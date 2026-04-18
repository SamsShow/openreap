/**
 * Idempotent seed for the Code Roaster first-party Reap agent.
 *
 *   node --env-file=.env.local scripts/seed-code-roaster.mjs
 *
 * Creates or updates the `code-roaster` row in `agents`. Price is $0.01
 * (price_cents = 1) paid via x402 through Elsa's facilitator. Model is
 * "inhouse" — free-tier router in src/lib/llm.ts picks up INHOUSE_LLM_URL
 * when set, with OpenRouter fallback.
 *
 * owner_id is whichever user the Base Auto-Trader is already owned by
 * (the Reap system user), so 75%/25% payout math keeps working with 100%
 * effectively staying with Reap.
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

const SYSTEM_PROMPT = `You are the Reap Code Roaster — a brutally honest,
witty, but ultimately constructive senior engineer. A user has submitted
code for roasting. Read it carefully, find the real problems, and call
them out with specific, technically accurate critique.

Return strictly valid JSON with this exact schema:
{
  "verdict": "one-sentence damning summary",
  "roast": "2-4 sentences of pointed, witty critique — specific, not generic",
  "sins": [{"snippet": "the offending line or block, quoted verbatim", "sin": "what's wrong and why"}],
  "redemption": "the actually-fix-it advice, concrete and actionable"
}

Rules:
- Be savage but accurate. No hollow snark. Every jab must land on a real flaw.
- If the code is genuinely good, say so — set "verdict" accordingly and explain
  in "roast" why it's solid. Don't invent problems.
- sins[] must have between 1 and 5 entries, each quoting an actual snippet.
- No markdown, no code fences, JSON only.`;

const PARSED_SKILL = {
  meta: {
    name: "Code Roaster",
    version: "1.0",
    author: "Reap",
    price_usdc: 0.01,
    category: "dev",
    model_tier: "standard",
  },
  service: {
    description:
      "Roasts any code you throw at it. Savage, specific, constructive. Powered by our in-house LLM.",
    accepts: ["Any language", "Snippets up to 8000 characters"],
    rejects: [],
  },
  output_schema: {
    verdict: "string — one-sentence summary",
    roast: "string — 2-4 sentences of pointed critique",
    sins: [{ snippet: "string", sin: "string" }],
    redemption: "string — concrete fix",
  },
  examples: [
    {
      input: "function add(a, b) { return eval(a + '+' + b); }",
      output: JSON.stringify({
        verdict: "Arithmetic via eval is a war crime.",
        roast:
          "You used eval() to add two numbers. Every input is now arbitrary code execution, and you have reinvented the + operator with a remote shell attached.",
        sins: [
          {
            snippet: "return eval(a + '+' + b);",
            sin: "eval() on user-concatenated strings is textbook RCE",
          },
        ],
        redemption:
          "return a + b; — the JS operator you were trying to impersonate.",
      }),
    },
  ],
  escalate_patterns: [],
};

const SKILL_MD = `# Code Roaster

**What it does:** Savage-but-constructive code review for any language.

**Price:** $0.01 USDC per call on Base mainnet via Elsa x402.

**Input:** \`{ input: "<your code, up to 8000 chars>" }\`

**Output:** JSON with \`verdict\`, \`roast\`, \`sins[]\`, \`redemption\`.

Powered by the Reap in-house LLM — free to us, so all $0.01 stays with Reap.
`;

async function run() {
  console.log("Seeding Code Roaster agent...\n");

  // Use the same owner as the Base Auto-Trader (Reap system user).
  const ownerRows = await sql`
    SELECT owner_id FROM agents WHERE slug = 'base-auto-trader' LIMIT 1
  `;

  let ownerId;
  if (ownerRows.length > 0) {
    ownerId = ownerRows[0].owner_id;
    console.log(`  ✓ Using Reap system owner_id ${String(ownerId).slice(0, 8)}... (from base-auto-trader)`);
  } else {
    // Fallback: first user in the table.
    const anyUser = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`;
    if (anyUser.length === 0) {
      console.error("No users in DB. Run scripts/seed.mjs first.");
      process.exit(1);
    }
    ownerId = anyUser[0].id;
    console.log(`  ✓ Using fallback owner_id ${String(ownerId).slice(0, 8)}... (no base-auto-trader found)`);
  }

  await sql`
    INSERT INTO agents (
      owner_id, slug, name, description, category, price_cents, model,
      skill_md, is_live, is_reap_agent, jobs_completed, reputation_score, avg_rating,
      status, parsed_skill, system_prompt
    ) VALUES (
      ${ownerId},
      'code-roaster',
      'Code Roaster',
      'Savage-but-constructive code review. Paste code, get roasted. $0.01 USDC per call via Elsa x402 on Base mainnet. Powered by Reap in-house LLM.',
      'dev',
      1,
      'inhouse',
      ${SKILL_MD},
      true,
      true,
      0,
      100.00,
      5.00,
      'live',
      ${JSON.stringify(PARSED_SKILL)}::jsonb,
      ${SYSTEM_PROMPT}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      price_cents = EXCLUDED.price_cents,
      model = EXCLUDED.model,
      skill_md = EXCLUDED.skill_md,
      is_live = true,
      is_reap_agent = true,
      status = 'live',
      parsed_skill = EXCLUDED.parsed_skill,
      system_prompt = EXCLUDED.system_prompt,
      updated_at = now()
  `;

  console.log("  ✓ code-roaster seeded (price $0.01, model=inhouse, is_reap_agent=true)");
  console.log("\nDone. POST /api/agents/code-roaster/run returns HTTP 402 with x402 requirements.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
