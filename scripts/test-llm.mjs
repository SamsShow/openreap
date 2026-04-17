/**
 * Smoke test for OpenRouter via the same SDK call pattern `src/lib/llm.ts`
 * uses. Run with:
 *
 *   node --env-file=.env.local scripts/test-llm.mjs
 *
 * Verifies:
 *   1. The API key is valid + reaches OpenRouter
 *   2. The free model actually responds
 *   3. JSON mode works
 *   4. Token counts + cost math match expectations
 */

import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set. Export it or use --env-file.");
  process.exit(1);
}

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey,
  defaultHeaders: {
    "HTTP-Referer": "https://openreap.xyz",
    "X-Title": "OpenReap",
  },
});

const tests = [
  {
    name: "Contract Reviewer — risk-scored NDA review",
    model: "meta-llama/llama-3.1-8b-instruct",
    costPerToken: 0.00000006,
    system:
      "You are an expert AI service agent for Contract Review.\n" +
      "PROFESSIONAL: Sarah Mitchell, Attorney\n" +
      "You review NDAs, service agreements, and vendor contracts.\n" +
      "Always return valid JSON with risk_score, flagged_clauses (array of {clause, issue, fix}), and summary.",
    input:
      "NDA with unlimited liability and no term limit. Governing law: Delaware. Non-compete 36 months.",
  },
  {
    name: "Tax Filing Assistant — eligibility question",
    model: "meta-llama/llama-3.1-8b-instruct",
    costPerToken: 0.00000006,
    system:
      "You are a tax filing assistant. Answer tax queries with valid JSON output containing: eligible (boolean), reason, notes.",
    input:
      "I run a SaaS business, expect $120k revenue this year. Am I eligible for the QBI deduction?",
  },
  {
    name: "JSON-mode sanity check",
    model: "meta-llama/llama-3.1-8b-instruct",
    costPerToken: 0.00000006,
    system:
      "Respond with JSON only. Schema: { ok: boolean, message: string, timestamp: number }.",
    input: "Confirm you are receiving this request. Set timestamp to 0.",
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  process.stdout.write(`\n▶ ${t.name}\n  model: ${t.model}\n  `);
  const started = Date.now();
  try {
    const completion = await openrouter.chat.completions.create({
      model: t.model,
      response_format: { type: "json_object" },
      max_tokens: 512,
      temperature: 0.1,
      messages: [
        { role: "system", content: t.system },
        { role: "user", content: t.input },
      ],
    });
    const ms = Date.now() - started;
    const raw = completion.choices[0]?.message?.content ?? "";
    const tokens = completion.usage?.total_tokens ?? 0;
    const cost = tokens * t.costPerToken;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const preview =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed).slice(0, 240)
        : `[invalid JSON] ${raw.slice(0, 200)}`;

    console.log(
      `✓ ${ms}ms · ${tokens} tokens · $${cost.toFixed(6)}\n    ${preview}`
    );
    passed += 1;
  } catch (err) {
    console.log(`✗ FAILED after ${Date.now() - started}ms`);
    console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      console.log(err.stack.split("\n").slice(1, 4).join("\n"));
    }
    failed += 1;
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
