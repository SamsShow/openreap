/**
 * Idempotent seed for the Diagram Weaver first-party Reap agent.
 *
 *   node --env-file=.env.local scripts/seed-diagram-weaver.mjs
 *
 * Turns plain-English descriptions of flows, architectures, or processes
 * into a renderable Excalidraw scene:
 *   { type: "excalidraw", version: 2, source: "openreap",
 *     elements: [...], appState: {...}, files: {} }
 *
 * Priced at $0.50 (price_cents = 50) paid via x402 through Elsa's
 * facilitator. Model is "inhouse" — free-tier router in src/lib/llm.ts
 * picks up INHOUSE_LLM_URL when set, with OpenRouter fallback. Keeps all
 * revenue with Reap.
 *
 * owner_id is the same Reap system user as base-auto-trader + code-roaster
 * so the 75/25 payout math stays coherent.
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

const SYSTEM_PROMPT = `You are the Reap Diagram Weaver. Turn a plain-English flow description into a small graph JSON. The server lays it out and renders it as Excalidraw.

Return JSON only — no markdown, no fences, no prose. Schema:

{
  "title": "short name of the flow",
  "nodes": [
    { "id": "n1", "kind": "start",    "label": "..." },
    { "id": "n2", "kind": "step",     "label": "..." },
    { "id": "n3", "kind": "decision", "label": "...?" },
    { "id": "n4", "kind": "end",      "label": "..." }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" },
    { "from": "n3", "to": "n4", "label": "yes" },
    { "from": "n3", "to": "n5", "label": "no"  }
  ]
}

Allowed kinds: "start", "step", "decision", "end", "io".
- "start"  → entry point (one per flow)
- "end"    → terminal state (multiple OK; failures and successes are both ends)
  - "decision" → yes/no or A/B branch. The label is a question ending in "?"
- "step"   → an action or process
- "io"     → input/output, file write, API call

THE ONE RULE THAT MATTERS:
Every "decision" node MUST have at least 2 outgoing edges in the edges array.
A decision with only 1 outgoing edge is a bug — the server rejects the diagram. Always emit BOTH branches.

Faithfulness:
- Every distinct step, service, check, or branch in the input is its own node. Do NOT collapse or summarize.
- Every "if X then Y else Z" emits one decision node + two edges (label them "yes"/"no" or with the actual branch names).
- Failure branches end at an "end" node. They do NOT loop back into the success path.
- Parallel flows (FLOW 1, FLOW 2) are separate subgraphs sharing nodes only where the input says so.

Labels:
- 2–6 words, sentence case. Decisions end in "?".
- Edge labels only on edges leaving a "decision" node ("yes", "no", "approved", "denied", etc.).

Worked example. Input:
"User submits order. Charge their card. If declined, retry once; if it still fails, mark FAILED and email user. If charged, mark CONFIRMED, decrement inventory, email user, and queue shipping."

Correct output:
{
  "title": "Order checkout",
  "nodes": [
    { "id": "n1", "kind": "start",    "label": "User submits order" },
    { "id": "n2", "kind": "step",     "label": "Charge card" },
    { "id": "n3", "kind": "decision", "label": "Charge declined?" },
    { "id": "n4", "kind": "step",     "label": "Retry charge" },
    { "id": "n5", "kind": "decision", "label": "Retry succeeded?" },
    { "id": "n6", "kind": "end",      "label": "Order FAILED + email" },
    { "id": "n7", "kind": "step",     "label": "Mark CONFIRMED" },
    { "id": "n8", "kind": "step",     "label": "Decrement inventory" },
    { "id": "n9", "kind": "step",     "label": "Email user" },
    { "id": "n10", "kind": "end",     "label": "Queue shipping" }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" },
    { "from": "n3", "to": "n4", "label": "yes" },
    { "from": "n3", "to": "n7", "label": "no"  },
    { "from": "n4", "to": "n5" },
    { "from": "n5", "to": "n7", "label": "yes" },
    { "from": "n5", "to": "n6", "label": "no"  },
    { "from": "n7", "to": "n8" },
    { "from": "n8", "to": "n9" },
    { "from": "n9", "to": "n10" }
  ]
}

Notice: both decisions have exactly 2 outgoing edges. Failure ends at n6, never rejoins. Success path n7→n8→n9→n10 starts from the "no" branch of the first decision.

JSON only.`;

const PARSED_SKILL = {
  meta: {
    name: "Diagram Weaver",
    version: "1.0",
    author: "Reap",
    price_usdc: 0.50,
    category: "other",
    model_tier: "pro",
  },
  service: {
    description:
      "Turns plain-English descriptions of flows, architectures, or processes into a valid Excalidraw JSON scene. Downstream agents can JSON.parse the output and render it directly; humans see a live Excalidraw preview.",
    accepts: [
      "Process / workflow descriptions",
      "System architecture summaries",
      "Sequence diagrams described in prose",
      "Flowcharts described in bullet form",
    ],
    rejects: ["private key", "secret", "password"],
  },
  output_schema: {
    title: "string",
    nodes: "[{ id, kind: 'start'|'step'|'decision'|'end'|'io', label, color? }]",
    edges: "[{ from, to, label? }]",
    note: "Server converts this graph to an Excalidraw scene before returning.",
  },
  examples: [
    {
      input: "User clicks Sign Up → POST /api/auth → server issues JWT → client stores cookie.",
      output:
        "{ title:'Signup', nodes:[start 'Sign Up', step 'POST /api/auth', step 'Issue JWT', end 'Store cookie'], edges:[n1→n2, n2→n3, n3→n4] }",
    },
    {
      input:
        "Charge card; if declined, retry once then mark FAILED; if charged, mark CONFIRMED and email.",
      output:
        "Two decisions, each with 2 outgoing edges. Failure path ends at 'Order FAILED'. Success path n3-no→n7 (CONFIRMED) → email.",
    },
  ],
  escalate_patterns: [],
};

const SKILL_MD = `# Diagram Weaver

**What it does:** Generates Excalidraw JSON scenes from textual descriptions. Downstream agents get structured data; humans see a live preview.

**Price:** $0.50 USDC per call on Base mainnet via Elsa x402.

**Input:** \`{ input: "<freeform description of the diagram you want>" }\`

**Output:** \`{ type: "excalidraw", version: 2, source: "openreap", elements: [...], appState: {...}, files: {} }\` — pipe directly into \`@excalidraw/excalidraw\` or any Excalidraw importer.

Model: Reap in-house LLM — free to us, so all revenue stays with Reap.
`;

async function run() {
  console.log("Seeding Diagram Weaver agent...\n");

  const ownerRows = await sql`
    SELECT owner_id FROM agents WHERE slug = 'base-auto-trader' LIMIT 1
  `;

  let ownerId;
  if (ownerRows.length > 0) {
    ownerId = ownerRows[0].owner_id;
    console.log(
      `  ✓ Using Reap system owner_id ${String(ownerId).slice(0, 8)}... (from base-auto-trader)`
    );
  } else {
    const anyUser = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`;
    if (anyUser.length === 0) {
      console.error("No users in DB. Run scripts/seed.mjs first.");
      process.exit(1);
    }
    ownerId = anyUser[0].id;
    console.log(
      `  ✓ Using fallback owner_id ${String(ownerId).slice(0, 8)}... (no base-auto-trader found)`
    );
  }

  await sql`
    INSERT INTO agents (
      owner_id, slug, name, description, category, price_cents, model,
      skill_md, is_live, is_reap_agent, jobs_completed, reputation_score, avg_rating,
      status, parsed_skill, system_prompt
    ) VALUES (
      ${ownerId},
      'diagram-weaver',
      'Diagram Weaver',
      'Turns plain-English process, architecture, or flow descriptions into a valid Excalidraw JSON scene. Returns {type:"excalidraw", elements, appState, files} so downstream agents can render or embed the diagram directly. $0.50 USDC per call via x402 on Base mainnet.',
      'other',
      50,
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

  console.log(
    "  ✓ diagram-weaver seeded (price $0.50, model=inhouse, is_reap_agent=true)"
  );
  console.log(
    "\nDone. POST /api/agents/diagram-weaver/run returns HTTP 402 with x402 requirements."
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
