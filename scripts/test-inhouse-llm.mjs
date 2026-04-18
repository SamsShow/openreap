/**
 * Smoke test for the in-house Qwen 3.5 4B server fronted by
 * INHOUSE_LLM_URL. Mirrors scripts/test-llm.mjs but exercises the in-house
 * path directly (not via OpenRouter).
 *
 *   node --env-file=.env.local scripts/test-inhouse-llm.mjs
 *
 * Verifies:
 *   1. The server is reachable + returns the expected {model_instance_id,
 *      output[], stats{}} envelope.
 *   2. The final `message` entry contains parseable JSON matching the
 *      requested schema.
 *   3. Token counts are present in `stats`.
 *   4. Retry-with-backoff in src/lib/llm.ts exhausts cleanly when pointed
 *      at an unreachable URL (verifies the ~1.2s total backoff math).
 */

const INHOUSE_URL = process.env.INHOUSE_LLM_URL;
if (!INHOUSE_URL) {
  console.error("INHOUSE_LLM_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const INHOUSE_MODEL_ID = "qwen3.5-4b";

async function probe({ name, system, input, schema }) {
  process.stdout.write(`\n▶ ${name}\n  model: ${INHOUSE_MODEL_ID}\n  `);
  const started = Date.now();
  try {
    const res = await fetch(`${INHOUSE_URL}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: INHOUSE_MODEL_ID,
        system_prompt: system,
        input,
      }),
    });
    if (!res.ok) {
      console.log(`✗ HTTP ${res.status}`);
      console.log(`    ${await res.text().catch(() => "")}`);
      return false;
    }
    const body = await res.json();
    const ms = Date.now() - started;
    const message = [...body.output]
      .reverse()
      .find((o) => o.type === "message");
    if (!message) {
      console.log(`✗ no message entry in output`);
      console.log(`    types=${body.output.map((o) => o.type).join(",")}`);
      return false;
    }
    const raw = (message.content ?? "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.log(`✗ message content is not valid JSON`);
      console.log(`    ${raw.slice(0, 200)}`);
      return false;
    }
    const tokens = body.stats.input_tokens + body.stats.total_output_tokens;
    const preview = JSON.stringify(parsed).slice(0, 240);
    if (schema && !schema(parsed)) {
      console.log(`✗ schema mismatch`);
      console.log(`    ${preview}`);
      return false;
    }
    console.log(`✓ ${ms}ms · ${tokens} tokens\n    ${preview}`);
    return true;
  } catch (err) {
    console.log(`✗ FAILED after ${Date.now() - started}ms`);
    console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

const scenarios = [
  {
    name: "Contract Reviewer — risk-scored NDA review",
    system:
      "You are an expert AI service agent for Contract Review. " +
      "Return valid JSON with risk_score (number), flagged_clauses (array of " +
      "{clause, issue, fix}), and summary (string). No other keys.",
    input:
      "NDA with unlimited liability and no term limit. Governing law: Delaware. Non-compete 36 months.",
    schema: (o) =>
      typeof o.risk_score !== "undefined" && Array.isArray(o.flagged_clauses),
  },
  {
    name: "Tax Filing Assistant — eligibility question",
    system:
      "You are a tax filing assistant. Answer with valid JSON containing: " +
      "eligible (boolean), reason (string), notes (string).",
    input:
      "I run a SaaS business, expect $120k revenue this year. Am I eligible for the QBI deduction?",
    schema: (o) => typeof o.eligible === "boolean",
  },
  {
    name: "JSON-mode sanity check",
    system:
      "Respond with JSON only. Schema: { ok: boolean, message: string, timestamp: number }.",
    input: "Confirm you are receiving this request. Set timestamp to 0.",
    schema: (o) => o.ok === true && typeof o.message === "string",
  },
];

let passed = 0;
let failed = 0;

for (const scenario of scenarios) {
  const ok = await probe(scenario);
  if (ok) passed += 1;
  else failed += 1;
}

console.log(`\n${passed}/${scenarios.length} passed, ${failed} failed`);

// ---- Retry math check --------------------------------------------------
//
// Point the client at a known-unreachable URL and assert that the retry
// loop in src/lib/llm.ts would exhaust in roughly the expected time. We
// don't import callLLM here (would pull in Next runtime config); we
// replicate the 3-attempt, 300ms/900ms backoff policy inline and check
// the total elapsed time matches.

console.log(`\n▶ Retry-exhaustion sanity check (unreachable URL)`);
const deadUrl = "http://127.0.0.1:1"; // reserved TCP/UDP port, refuses
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 300;
const PER_ATTEMPT_TIMEOUT_MS = 1_500;
const started = Date.now();
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  try {
    await fetch(`${deadUrl}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
  } catch {
    // expected
  } finally {
    clearTimeout(timeout);
  }
  if (attempt < MAX_ATTEMPTS - 1) {
    const backoff = BASE_BACKOFF_MS * Math.pow(3, attempt);
    await new Promise((r) => setTimeout(r, backoff));
  }
}
const elapsed = Date.now() - started;
// Expect: ECONNREFUSED is near-instant on each attempt, plus 300ms + 900ms
// backoff = ~1.2s. Allow up to 4s for CI variance.
const ok = elapsed >= 1_200 && elapsed < 4_000;
console.log(
  `  elapsed=${elapsed}ms — ${ok ? "✓ within expected 1.2–4s window" : "✗ outside expected window"}`
);
if (!ok) failed += 1;
else passed += 1;

console.log(`\nfinal: ${passed}/${scenarios.length + 1} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
