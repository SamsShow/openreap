/**
 * Integration test for the hire-agent pipeline minus the x402 payment gate.
 *
 * Run with:
 *   node --env-file=.env.local scripts/test-agent-pipeline.mjs
 *
 * For each seeded agent, this script:
 *   1. Loads the agent row from Postgres (parsed_skill, system_prompt, model)
 *   2. Runs the same reject_patterns + escalate_patterns checks the
 *      production endpoint runs (src/app/api/agents/[slug]/run/route.ts)
 *   3. If neither trips, calls OpenRouter with the agent's system_prompt
 *      and a test input
 *   4. Reports tokens, cost, latency, and the parsed JSON output
 *
 * The x402 layer is already exercised by the 402-envelope smoke test
 * (curl probes prove the payment requirements are correct); this script
 * proves the downstream LLM pipeline that fires after a successful payment.
 */

import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";

const DATABASE_URL = process.env.DATABASE_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
if (!OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY missing");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://openreap.xyz",
    "X-Title": "OpenReap",
  },
});

const MODEL_IDS = {
  "openrouter-free": "meta-llama/llama-3.1-8b-instruct",
  "mistral-7b": "mistralai/mistral-7b-instruct-v0.1",
  "gemma-2-9b": "google/gemma-2-9b-it",
  "claude-haiku": "anthropic/claude-3.5-haiku",
  "gpt-4o-mini": "openai/gpt-4o-mini",
};

const COST_PER_TOKEN = {
  "openrouter-free": 0.00000006,
  "mistral-7b": 0.00000006,
  "gemma-2-9b": 0.00000008,
  "claude-haiku": 0.0000008,
  "gpt-4o-mini": 0.0000006,
};

const SCENARIOS = [
  {
    slug: "contract-reviewer",
    inputs: [
      {
        label: "happy path — SaaS NDA review",
        input:
          "Please review this NDA: Acme Corp SaaS agreement with mutual indemnity, 2-year term, Delaware governing law.",
        expect: "completes",
      },
      {
        label: "escalation — Contract value exceeds 100K",
        input:
          "Joint venture agreement. Contract value exceeds 100K. Needs human review.",
        expect: "escalated",
      },
    ],
  },
  {
    slug: "tax-filing-assistant",
    inputs: [
      {
        label: "happy path — tax eligibility",
        input: "Am I eligible for QBI deduction on $80k SaaS revenue?",
        expect: "completes",
      },
    ],
  },
];

function matchesAny(input, patterns) {
  const lower = input.toLowerCase();
  return (patterns || []).some((p) => lower.includes(p.toLowerCase()));
}

async function runLLM(systemPrompt, userInput, modelKey) {
  const modelId = MODEL_IDS[modelKey] ?? MODEL_IDS["openrouter-free"];
  const costPerToken =
    COST_PER_TOKEN[modelKey] ?? COST_PER_TOKEN["openrouter-free"];

  const started = Date.now();
  const completion = await openrouter.chat.completions.create({
    model: modelId,
    response_format: { type: "json_object" },
    max_tokens: 512,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ],
  });

  const latency_ms = Date.now() - started;
  const raw = completion.choices[0]?.message?.content ?? "";
  const tokens = completion.usage?.total_tokens ?? 0;

  let content;
  try {
    content = JSON.parse(raw);
  } catch {
    content = { error: "output_invalid", raw: raw.slice(0, 160) };
  }

  return {
    content,
    tokens,
    latency_ms,
    model: modelId,
    cost_usdc: tokens * costPerToken,
  };
}

async function runAgentCase(slug, testCase) {
  const rows = await sql`
    SELECT a.id, a.slug, a.name, a.system_prompt, a.model,
           a.parsed_skill, a.price_cents, a.status, a.is_live
    FROM agents a
    WHERE a.slug = ${slug}
  `;

  if (rows.length === 0) {
    return { ok: false, reason: `agent not found: ${slug}` };
  }
  const agent = rows[0];
  if (!agent.is_live || agent.status !== "live") {
    return { ok: false, reason: `agent not live (status=${agent.status})` };
  }

  const parsedSkill = agent.parsed_skill ?? {};
  const rejectPatterns = parsedSkill?.service?.rejects ?? [];
  const escalatePatterns = parsedSkill?.escalate_patterns ?? [];

  if (matchesAny(testCase.input, rejectPatterns)) {
    return {
      ok: testCase.expect === "rejected",
      observed: "rejected",
      expected: testCase.expect,
    };
  }

  if (matchesAny(testCase.input, escalatePatterns)) {
    return {
      ok: testCase.expect === "escalated",
      observed: "escalated",
      expected: testCase.expect,
    };
  }

  if (!agent.system_prompt || agent.model === "none") {
    return {
      ok: false,
      reason: `agent has no LLM configured (model=${agent.model})`,
    };
  }

  const result = await runLLM(
    agent.system_prompt,
    testCase.input,
    agent.model
  );

  return {
    ok: testCase.expect === "completes",
    observed: "completed",
    expected: testCase.expect,
    tokens: result.tokens,
    latency_ms: result.latency_ms,
    cost_usdc: result.cost_usdc,
    model: result.model,
    output: result.content,
  };
}

let pass = 0;
let fail = 0;

for (const scenario of SCENARIOS) {
  console.log(`\n▶ /api/agents/${scenario.slug}/run`);
  for (const testCase of scenario.inputs) {
    process.stdout.write(`  · ${testCase.label} ... `);
    try {
      const res = await runAgentCase(scenario.slug, testCase);
      if (!res.ok) {
        console.log(
          `FAIL  observed=${res.observed ?? "error"} expected=${testCase.expect}` +
            (res.reason ? ` (${res.reason})` : "")
        );
        fail += 1;
        continue;
      }
      if (res.observed === "completed") {
        const preview = JSON.stringify(res.output).slice(0, 160);
        console.log(
          `ok ${res.latency_ms}ms · ${res.tokens}tok · $${res.cost_usdc.toFixed(6)}`
        );
        console.log(`      ${preview}${preview.length >= 160 ? "…" : ""}`);
      } else {
        console.log(`ok (${res.observed})`);
      }
      pass += 1;
    } catch (err) {
      console.log(`ERROR`);
      console.log(
        `      ${err instanceof Error ? err.message : String(err)}`
      );
      fail += 1;
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
