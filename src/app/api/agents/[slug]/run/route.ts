import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  getPaymentDetails,
  requirementsFor,
  verifyPayment,
} from "@/lib/elsa";
import { callLLM } from "@/lib/llm";
import type { ModelKey } from "@/lib/llm";
import type { ParsedSkill } from "@/lib/skill-parser";

// ---------------------------------------------------------------------------
// POST /api/agents/[slug]/run
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Step 3 — Load agent
  const agentRows = await sql`
    SELECT a.*, u.id AS owner_user_id
    FROM agents a
    JOIN users u ON a.owner_id = u.id
    WHERE a.slug = ${slug} AND a.status = 'live'
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

  // Step 2 — Verify payment
  const requirements = requirementsFor(agent.name, agent.slug, priceUsdc);
  const verified = await verifyPayment(paymentHeader, requirements);
  if (!verified.ok) {
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

  // Step 7 — LLM call. One silent retry on transient errors (OpenRouter
  // occasionally returns 5xx / 429 during traffic spikes) before we give up.
  let llmResult;
  let llmErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      llmResult = await callLLM(
        agent.system_prompt,
        input,
        agent.model as ModelKey
      );
      llmErr = null;
      break;
    } catch (err) {
      llmErr = err;
      // Only retry if it looks like a transient OpenRouter error.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/rate|429|5\d\d|timeout|ECONN|network/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!llmResult) {
    const rawMsg =
      llmErr instanceof Error ? llmErr.message : String(llmErr ?? "unknown");
    console.error("[agent-run] LLM call failed:", rawMsg);
    // Return a trimmed, safe reason string. Truncate hard so we never leak
    // full stack traces or auth headers back to the client.
    const reason = rawMsg.slice(0, 240);
    return NextResponse.json(
      {
        error: "service_unavailable",
        reason,
        model: agent.model,
        hint:
          "The LLM provider rejected the call. This usually clears on retry. If it keeps failing, the agent's model setting may be invalid — update it in Settings → Model.",
      },
      { status: 503 }
    );
  }

  // Step 8 — Record job
  const priceCents = Math.round(priceUsdc * 100);
  const creatorPayoutCents = Math.round(priceCents * 0.75);
  const reapFeeCents = priceCents - creatorPayoutCents;

  const jobRows = await sql`
    INSERT INTO jobs (
      agent_id, input_payload, output_payload, status,
      price_cents, elsa_tx_hash, tokens_used, llm_cost_usdc,
      llm_model, creator_payout_cents, reap_fee_cents,
      created_at, updated_at
    )
    VALUES (
      ${agent.id},
      ${JSON.stringify({ input })}::jsonb,
      ${JSON.stringify(llmResult.content)}::jsonb,
      'completed',
      ${priceCents},
      ${verified.tx_hash ?? null},
      ${llmResult.tokens},
      ${llmResult.cost_usdc},
      ${llmResult.model},
      ${creatorPayoutCents},
      ${reapFeeCents},
      now(),
      now()
    )
    RETURNING id
  `;

  const jobId = (jobRows[0] as { id: string }).id;

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
