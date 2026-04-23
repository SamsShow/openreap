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

const SYSTEM_PROMPT = `You are the Reap Diagram Weaver. Turn a plain-English description into an Excalidraw scene JSON.

Return JSON only — no markdown, no code fences, no prose.

Shape of the response:
{
  "type": "excalidraw",
  "version": 2,
  "source": "openreap",
  "elements": [ /* see below */ ],
  "appState": { "viewBackgroundColor": "#ffffff", "gridSize": null },
  "files": {}
}

Each element is one of these minimal shapes (a downstream renderer fills in defaults):

Node (rectangle, ellipse, or diamond):
  { "id": "n1", "type": "rectangle", "x": 100, "y": 100,
    "width": 180, "height": 60, "text": "User clicks Login",
    "strokeColor": "#1e1e1e", "backgroundColor": "#ffffff" }

Arrow (connects two nodes by id — use this, not free arrows):
  { "id": "a1", "type": "arrow",
    "startBinding": { "elementId": "n1", "focus": 0, "gap": 4 },
    "endBinding":   { "elementId": "n2", "focus": 0, "gap": 4 },
    "x": 0, "y": 0, "width": 0, "height": 0,
    "points": [[0,0],[1,0]] }

CRITICAL — ARROWS ARE NOT OPTIONAL:
- Every directed transition in the description becomes ONE arrow element.
- If the flow has N sequential steps, you emit N-1 arrows.
- If a decision (diamond) branches, each branch gets its own arrow.
- Every arrow MUST have startBinding.elementId AND endBinding.elementId pointing to real node ids you already emitted.
- Never skip arrows to save tokens. A scene with nodes but no arrows is a FAILED scene.

Layout:
- Coordinates don't matter — downstream auto-layout (dagre + snake-wrap) recomputes all x/y. Just emit clean ids and bindings.
- Decisions (diamonds) for yes/no splits. Rectangles for steps. Ellipses for start/end.

Faithfulness — THIS IS THE MOST IMPORTANT RULE:
- Every distinct step, service, check, branch, or decision in the user's input becomes its OWN node.
- Do NOT summarize. Do NOT merge steps. Do NOT omit branches. A 40-step input produces 40+ nodes, not 8.
- If the input describes multiple parallel flows (FLOW 1, FLOW 2, …), render each flow as its own connected chain. Flows can share nodes where the text says they do.
- Every "if X, then Y / else Z" becomes a diamond with two outgoing arrows to the two branch targets.
- Scale is fine — 50, 80, 100+ nodes are all acceptable if the input describes that many steps.

Labels:
- Short phrases, 2–6 words. Keep decisions as a question ("Fraud score > 0.8?").
- Branch arrows carry no label — the target node name implies the path.

Coloring:
- Use backgroundColor to group related nodes. A single flow should mostly share a color family; decisions can pop with a distinct accent.
- Good palette: #bae6fd (blue), #bbf7d0 (green), #fde68a (yellow), #fecaca (red), #e9d5ff (purple), #fed7aa (orange). White (#ffffff) is fine for neutral steps.
- Never return an empty elements array. If the input is thin, still produce a best-effort sketch.

JSON only. Nothing else.`;

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
    type: "'excalidraw'",
    version: 2,
    source: "'openreap'",
    elements: "ExcalidrawElement[]",
    appState: "{ viewBackgroundColor, gridSize }",
    files: "{}",
  },
  examples: [
    {
      input: "User clicks Sign Up → frontend POSTs to /api/auth → server issues JWT → client stores in httpOnly cookie.",
      output:
        "{ type: 'excalidraw', elements: [ rectangle 'User clicks Sign Up', arrow, rectangle '/api/auth', arrow, rectangle 'JWT issued', arrow, rectangle 'Cookie stored' ], appState: {...}, files: {} }",
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
