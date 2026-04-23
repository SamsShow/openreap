import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// The in-house LLM can take 30-60s under load, and the facilitator's
// /settle call adds another few seconds. Extend the function runtime so
// Vercel's edge doesn't close the connection while we're still streaming
// the model output.
export const maxDuration = 300;
import {
  getPaymentDetails,
  requirementsForNetwork,
  verifyPayment,
} from "@/lib/elsa";
import { callLLM } from "@/lib/llm";
import type { ModelKey } from "@/lib/llm";
import type { ParsedSkill } from "@/lib/skill-parser";

// ---------------------------------------------------------------------------
// Per-instance in-flight deduplication keyed on the x-payment header.
//
// We've seen duplicate POSTs on Vercel (but not localhost) where two
// concurrent requests fire with the same signed authorization. The first
// reaches the facilitator and settles on-chain; the second is still
// mid-flight, calls the facilitator with the same auth, and USDC reverts
// with "FiatTokenV2: authorization is used or canceled" — leaving the user
// billed but with no response shown.
//
// Keeping the Promise in a Map lets the second request await the first's
// result instead of re-entering the flow. Vercel Fluid Compute reuses
// function instances for concurrent invocations, so this covers the hot
// path. Cold-instance collisions would still fall through — if that turns
// out to be a real problem we move the fingerprint check into Postgres.
// ---------------------------------------------------------------------------
type InFlight = Promise<{ status: number; body: unknown }>;
const inFlight = new Map<string, InFlight>();
const IN_FLIGHT_TTL_MS = 5 * 60_000;

async function fingerprint(header: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(header)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Shorter alias used inside runOnce for clarity.
async function hashX402(header: string): Promise<string> {
  return fingerprint(header);
}

// Poll the jobs table for a sibling row that owns this fingerprint. Returns
// a NextResponse with the completed output if found, null if the sibling
// failed, and null after a generous timeout if still 'processing'. Called
// both from the "authorization is used" replay branch AND from the claim
// conflict branch.
async function waitForSiblingJob(
  paymentFp: string
): Promise<NextResponse | null> {
  const pollStart = Date.now();
  const pollWindowMs = 240_000;
  while (Date.now() - pollStart < pollWindowMs) {
    const rows = await sql`
      SELECT id, output_payload, elsa_tx_hash, llm_model, tokens_used, status
      FROM jobs
      WHERE payment_fingerprint = ${paymentFp}
      LIMIT 1
    `;
    if (rows.length > 0) {
      const row = rows[0] as {
        id: string;
        output_payload: unknown;
        elsa_tx_hash: string | null;
        llm_model: string | null;
        tokens_used: number | null;
        status: string;
      };
      if (row.status === "completed") {
        console.info(
          `[agent-run] replay served from DB (job ${row.id.slice(0, 8)}…)`
        );
        return NextResponse.json({
          output: row.output_payload,
          job_id: row.id,
          tx_hash: row.elsa_tx_hash,
          model: row.llm_model,
          tokens: row.tokens_used,
          cached: true,
        });
      }
      if (row.status === "failed") {
        return NextResponse.json(
          {
            error: "sibling_job_failed",
            reason:
              "A sibling request for this payment failed. Refresh and try again with a fresh signature.",
          },
          { status: 503 }
        );
      }
      // status === 'processing' → keep polling
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/agents/[slug]/run
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Early fingerprint check — if we're already processing this exact signed
  // authorization on this instance, await that work and return its result.
  const rawPayment = request.headers.get("x-payment");
  if (rawPayment) {
    const fp = await fingerprint(rawPayment);
    const existing = inFlight.get(fp);
    if (existing) {
      const { status, body } = await existing;
      return NextResponse.json(body as Record<string, unknown>, { status });
    }
    let resolve: (v: { status: number; body: unknown }) => void = () => {};
    let reject: (err: unknown) => void = () => {};
    const pending: InFlight = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    inFlight.set(fp, pending);
    setTimeout(() => inFlight.delete(fp), IN_FLIGHT_TTL_MS);

    try {
      const res = await runOnce(request, slug);
      const body = await res.clone().json();
      resolve({ status: res.status, body });
      return res;
    } catch (err) {
      reject(err);
      throw err;
    }
  }

  return runOnce(request, slug);
}

async function runOnce(request: NextRequest, slug: string) {

  // Step 3 — Load agent
  const agentRows = await sql`
    SELECT a.*, u.id AS owner_user_id
    FROM agents a
    JOIN users u ON a.owner_id = u.id
    WHERE a.slug = ${slug} AND a.is_live = true
  `;

  if (agentRows.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agent = agentRows[0] as {
    id: string;
    name: string;
    slug: string;
    system_prompt: string;
    model: string;
    price_cents: number;
    parsed_skill: ParsedSkill;
    owner_user_id: string;
  };

  const priceUsdc: number = agent.price_cents / 100;

  // Step 1 — No payment header: return 402 with payment details
  const paymentHeader = request.headers.get("x-payment");
  if (!paymentHeader) {
    return NextResponse.json(
      getPaymentDetails(agent.name, agent.slug, priceUsdc),
      { status: 402 }
    );
  }

  // Step 1.5 — DB-backed idempotency. If we've already completed a job for
  // this exact signed authorization (hash collision), return that response
  // instead of re-verifying (which would hit USDC's "used or canceled" for
  // the same nonce). Covers cross-instance retries where the in-memory
  // dedupe map didn't match.
  const paymentFp = await hashX402(paymentHeader);
  const cachedJobRows = await sql`
    SELECT id, output_payload, elsa_tx_hash, llm_model, tokens_used, status
    FROM jobs
    WHERE payment_fingerprint = ${paymentFp} AND status = 'completed'
    LIMIT 1
  `;
  if (cachedJobRows.length > 0) {
    const cached = cachedJobRows[0] as {
      id: string;
      output_payload: unknown;
      elsa_tx_hash: string | null;
      llm_model: string | null;
      tokens_used: number | null;
    };
    console.info(
      `[agent-run] cache hit for fingerprint (job ${cached.id.slice(0, 8)}…)`
    );
    return NextResponse.json({
      output: cached.output_payload,
      job_id: cached.id,
      tx_hash: cached.elsa_tx_hash,
      model: cached.llm_model,
      tokens: cached.tokens_used,
      cached: true,
    });
  }

  // Step 2 — Decode the payload, pick the matching requirements, verify.
  let signedNetwork: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8")
    ) as { network?: unknown };
    if (typeof decoded.network !== "string") {
      throw new Error("payload missing network");
    }
    signedNetwork = decoded.network;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason =
      msg === "payload missing network"
        ? "x-payment payload is missing the network field"
        : `x-payment header is not valid base64 JSON: ${msg}`;
    return NextResponse.json(
      { error: "Payment verification failed", reason },
      { status: 402 }
    );
  }

  const requirements = requirementsForNetwork(
    agent.name,
    agent.slug,
    priceUsdc,
    signedNetwork
  );
  if (!requirements) {
    return NextResponse.json(
      {
        error: "Payment verification failed",
        reason: "unsupported_network",
        network: signedNetwork,
      },
      { status: 402 }
    );
  }

  const verified = await verifyPayment(paymentHeader, requirements);
  if (!verified.ok) {
    // "authorization is used or canceled" → the on-chain nonce was consumed
    // by a sibling request (either a duplicate in flight or a prior run
    // that crashed post-settlement). Poll by fingerprint for ANY row —
    // completed returns cached output; processing keeps polling; failed
    // exits fast so we don't sit here for 4 minutes waiting on a dead job.
    const reasonLower = (verified.reason ?? "").toLowerCase();
    if (reasonLower.includes("authorization is used or canceled")) {
      const cached = await waitForSiblingJob(paymentFp);
      if (cached) return cached;
      return NextResponse.json(
        {
          error: "replay_recovery_timeout",
          reason:
            "A sibling request consumed this payment on-chain but didn't complete in time. Check BaseScan for your USDC; contact support if the charge stuck.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Payment verification failed", reason: verified.reason },
      { status: 402 }
    );
  }

  // Step 4 — Get and validate input
  let body: { input?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { input } = body;

  if (typeof input !== "string" || input.length === 0) {
    return NextResponse.json(
      { error: "input is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (input.length > 10_000) {
    return NextResponse.json(
      { error: "input exceeds maximum length of 10,000 characters" },
      { status: 400 }
    );
  }

  // Step 5 — Reject filter
  const parsedSkill: ParsedSkill = agent.parsed_skill;
  const rejectPatterns = parsedSkill?.service?.rejects ?? [];

  for (const pattern of rejectPatterns) {
    if (input.toLowerCase().includes(pattern.toLowerCase())) {
      return NextResponse.json(
        { error: "out_of_scope", reason: pattern },
        { status: 200 }
      );
    }
  }

  // Step 6 — Escalation check
  const escalatePatterns = parsedSkill?.escalate_patterns ?? [];

  for (const pattern of escalatePatterns) {
    if (input.toLowerCase().includes(pattern.toLowerCase())) {
      const escalatedRows = await sql`
        INSERT INTO jobs (agent_id, input_payload, status, price_cents, elsa_tx_hash, created_at, updated_at)
        VALUES (
          ${agent.id},
          ${JSON.stringify({ input })}::jsonb,
          'escalated',
          ${Math.round(priceUsdc * 100)},
          ${verified.tx_hash ?? null},
          now(),
          now()
        )
        RETURNING id
      `;

      const jobId = (escalatedRows[0] as { id: string }).id;

      return NextResponse.json(
        { status: "escalated", job_id: jobId, message: "Queued for professional review" },
        { status: 202 }
      );
    }
  }

  // Step 6.5 — Claim a pending job row keyed on payment_fingerprint BEFORE
  // we call the LLM. This closes the window where an in-flight sibling has
  // consumed the on-chain nonce but hasn't yet inserted a job; retries can
  // now see 'processing' and wait, rather than staring at an empty DB.
  const priceCents = Math.round(priceUsdc * 100);
  const creatorPayoutCents = Math.round(priceCents * 0.75);
  const reapFeeCents = priceCents - creatorPayoutCents;

  const claimRows = await sql`
    INSERT INTO jobs (
      agent_id, input_payload, status, price_cents, elsa_tx_hash,
      creator_payout_cents, reap_fee_cents, payment_fingerprint,
      created_at, updated_at
    )
    VALUES (
      ${agent.id},
      ${JSON.stringify({ input })}::jsonb,
      'processing',
      ${priceCents},
      ${verified.tx_hash ?? null},
      ${creatorPayoutCents},
      ${reapFeeCents},
      ${paymentFp},
      now(),
      now()
    )
    ON CONFLICT (payment_fingerprint) DO NOTHING
    RETURNING id
  `;

  if (claimRows.length === 0) {
    // Another instance already claimed this fingerprint — either finished
    // already or still running. Wait for its outcome.
    const cached = await waitForSiblingJob(paymentFp);
    if (cached) return cached;
    return NextResponse.json(
      {
        error: "replay_recovery_timeout",
        reason:
          "A sibling request is handling this payment but didn't complete in time.",
      },
      { status: 504 }
    );
  }

  const jobId = (claimRows[0] as { id: string }).id;

  // Step 7 — LLM call with overall timeout budget (170s). When INHOUSE_LLM_URL
  // is unreachable and OpenRouter is slow, we used to hang until Vercel's
  // 300s hard kill — leaving a 'processing' row that never resolves. Bound
  // the whole LLM pipeline so we always persist a terminal state.
  let llmResult;
  let llmErr: unknown = null;
  const llmBudgetMs = 170_000;
  try {
    llmResult = await Promise.race([
      (async () => {
        let last: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await callLLM(
              agent.system_prompt,
              input,
              agent.model as ModelKey
            );
          } catch (err) {
            last = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (!/rate|429|5\d\d|timeout|ECONN|network/i.test(msg)) break;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        throw last;
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM budget exceeded after ${llmBudgetMs}ms`)),
          llmBudgetMs
        )
      ),
    ]);
  } catch (err) {
    llmErr = err;
  }

  if (!llmResult) {
    const rawMsg =
      llmErr instanceof Error ? llmErr.message : String(llmErr ?? "unknown");
    console.error("[agent-run] LLM call failed:", rawMsg);
    // Mark the claim row as failed so subsequent replays exit fast instead
    // of waiting the full poll window.
    await sql`
      UPDATE jobs SET status='failed', updated_at=now()
      WHERE id = ${jobId}
    `;
    const reason = rawMsg.slice(0, 240);
    return NextResponse.json(
      {
        error: "service_unavailable",
        reason,
        model: agent.model,
        hint:
          "The LLM provider timed out or rejected the call. Retry in a moment.",
      },
      { status: 503 }
    );
  }

  // Step 8 — Upgrade the claim row to completed with the LLM output.
  await sql`
    UPDATE jobs
    SET
      output_payload = ${JSON.stringify(llmResult.content)}::jsonb,
      status = 'completed',
      tokens_used = ${llmResult.tokens},
      llm_cost_usdc = ${llmResult.cost_usdc},
      llm_model = ${llmResult.model},
      updated_at = now()
    WHERE id = ${jobId}
  `;

  // Step 9 — Update balance (UPSERT)
  const creatorPayoutUsdc = priceUsdc * 0.75;

  await sql`
    INSERT INTO balances (user_id, available_usdc, lifetime_earned, updated_at)
    VALUES (${agent.owner_user_id}, ${creatorPayoutUsdc}, ${creatorPayoutUsdc}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      available_usdc = balances.available_usdc + ${creatorPayoutUsdc},
      lifetime_earned = balances.lifetime_earned + ${creatorPayoutUsdc},
      updated_at = now()
  `;

  // Step 10 — Update agent stats
  await sql`
    UPDATE agents SET jobs_completed = jobs_completed + 1 WHERE id = ${agent.id}
  `;

  // Step 11 — Return output
  return NextResponse.json({
    output: llmResult.content,
    job_id: jobId,
    tx_hash: verified.tx_hash,
    model: llmResult.model,
    tokens: llmResult.tokens,
  });
}
