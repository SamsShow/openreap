# OpenReap Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenReap a functional prototype — SKILL.md upload → agent goes live → hiring agents pay via Elsa x402 → LLM executes job → professional gets paid.

**Architecture:** Next.js API routes (already in place) + new service modules in `src/lib/`. No separate Express backend — keep everything in the Next.js app. Neon Postgres (already connected). OpenRouter for LLM. Elsa x402 for payments. Safe multisig for treasury. Base Auto-Trader for in-house agent.

**Tech Stack:** Next.js 16, Neon Postgres, OpenRouter (openai SDK), Elsa x402 (x402-axios), viem, wagmi, jose (JWT), @safe-global/protocol-kit

---

## Scope: Prototype vs Coming Soon

### Prototype (this plan)
1. SKILL.md parser + validation
2. OpenRouter LLM integration (job execution)
3. Job execution endpoint with x402 402 flow
4. Elsa x402 payment verification
5. Escalation rule matching from SKILL.md
6. DB schema alignment with tech doc
7. USDC withdrawal processing (Safe multisig → professional wallet)
8. Base Auto-Trader (Elsa x402 → Uniswap v3 swap on Base)
9. Agent creation API (upload SKILL.md from existing templates page)

### Coming Soon (not in this plan)
- ERC-8004 on-chain reputation (keep DB-only rep for now)
- Reconciliation cron job
- Elsa Bazaar registration

---

## Task 1: DB Schema Alignment

**Files:**
- Modify: `scripts/migrate.mjs`
- Run: migration script

Align the DB with the tech doc schema. Key changes:
- Add `parsed_skill JSONB` and `system_prompt TEXT` to agents
- Add `x402_endpoint TEXT` and `status TEXT DEFAULT 'draft'` to agents
- Add `tokens_used INTEGER` and `llm_cost_usdc NUMERIC(20,6)` and `llm_model TEXT` to jobs
- Add `balances` table for per-user running totals
- Add `wallet_address` to migrate.mjs (currently only in seed)

- [ ] **Step 1: Write migration script**

```js
// scripts/migrate-v2.mjs
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Running v2 migration...");

  // Agents: add parsed_skill, system_prompt, x402_endpoint, status
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS parsed_skill JSONB`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS x402_endpoint TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'`;
  // Update existing live agents
  await sql`UPDATE agents SET status = 'live' WHERE is_live = true AND status IS NULL`;
  console.log("  ✓ agents table updated");

  // Jobs: add LLM tracking fields
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tokens_used INTEGER`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS llm_cost_usdc NUMERIC(20,6)`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS llm_model TEXT`;
  console.log("  ✓ jobs table updated");

  // Balances table
  await sql`
    CREATE TABLE IF NOT EXISTS balances (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      available_usdc NUMERIC(20,6) DEFAULT 0,
      pending_usdc NUMERIC(20,6) DEFAULT 0,
      lifetime_earned NUMERIC(20,6) DEFAULT 0
    )
  `;
  console.log("  ✓ balances table created");

  // Users: ensure wallet_address exists
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT`;

  console.log("v2 migration complete!");
}

migrate().catch(console.error);
```

- [ ] **Step 2: Run migration**

```bash
node scripts/migrate-v2.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-v2.mjs
git commit -m "feat: v2 schema — parsed_skill, system_prompt, balances table, LLM tracking"
```

---

## Task 2: SKILL.md Parser

**Files:**
- Create: `src/lib/skill-parser.ts`

The parser converts raw SKILL.md text into a structured `ParsedSkill` object. It extracts: meta fields, service description, accepts/rejects lists, output schema, examples, and escalation patterns.

- [ ] **Step 1: Create the parser**

```ts
// src/lib/skill-parser.ts

export type SkillCategory = "legal" | "finance" | "tech" | "health" | "hr" | "defi" | "other";

export interface ParsedSkill {
  meta: {
    name: string;
    version: string;
    author: string;
    price_usdc: number;
    category: SkillCategory;
    model_tier: "standard" | "pro";
  };
  service: {
    description: string;
    accepts: string[];
    rejects: string[];
  };
  output_schema: object;
  examples: Array<{ input: string; output: string }>;
  escalate_patterns: string[];
  system_prompt: string;
}

export interface ParseError {
  field: string;
  message: string;
  blocking: boolean;
}

const VALID_CATEGORIES: SkillCategory[] = ["legal", "finance", "tech", "health", "hr", "defi", "other"];

export function parseSkillMd(raw: string): { skill: ParsedSkill | null; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const sections = extractSections(raw);

  // Validate required sections
  for (const required of ["meta", "service", "output_format", "examples"]) {
    if (!sections[required]) {
      errors.push({ field: required, message: `Missing required section: ## ${required}`, blocking: true });
    }
  }
  if (errors.some(e => e.blocking)) return { skill: null, errors };

  // Parse meta
  const meta = parseMetaSection(sections.meta, errors);

  // Parse service
  const service = parseServiceSection(sections.service, errors);

  // Parse output schema
  let output_schema: object = {};
  try {
    output_schema = JSON.parse(sections.output_format.trim());
  } catch {
    errors.push({ field: "output_format", message: "output_format is not valid JSON", blocking: true });
  }

  // Parse examples
  const examples = parseExamplesSection(sections.examples, errors);

  // Parse escalation patterns (optional)
  const escalate_patterns = sections.escalate_if
    ? sections.escalate_if.split("\n").map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean)
    : [];

  if (errors.some(e => e.blocking)) return { skill: null, errors };

  // Build system prompt
  const system_prompt = buildSystemPrompt({ meta, service, output_schema, examples, escalate_patterns });

  return {
    skill: { meta, service, output_schema, examples, escalate_patterns, system_prompt },
    errors,
  };
}

function extractSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const regex = /^##\s+(\w+)/gm;
  let match;
  const positions: Array<{ name: string; start: number }> = [];

  while ((match = regex.exec(raw)) !== null) {
    positions.push({ name: match[1].toLowerCase(), start: match.index + match[0].length });
  }

  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start - positions[i + 1].name.length - 3 : raw.length;
    sections[positions[i].name] = raw.slice(positions[i].start, end).trim();
  }

  return sections;
}

function parseMetaSection(text: string, errors: ParseError[]) {
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };

  const name = get("name");
  if (!name) errors.push({ field: "meta.name", message: "name is required", blocking: true });

  const price_usdc = parseFloat(get("price_usdc"));
  if (isNaN(price_usdc) || price_usdc <= 0) {
    errors.push({ field: "meta.price_usdc", message: "price_usdc must be a positive number", blocking: true });
  }

  const category = get("category") as SkillCategory;
  if (!VALID_CATEGORIES.includes(category)) {
    errors.push({ field: "meta.category", message: `category must be one of: ${VALID_CATEGORIES.join(", ")}`, blocking: true });
  }

  const model_tier = get("model_tier") === "pro" ? "pro" as const : "standard" as const;

  return {
    name,
    version: get("version") || "1.0",
    author: get("author") || "Anonymous",
    price_usdc,
    category,
    model_tier,
  };
}

function parseServiceSection(text: string, errors: ParseError[]) {
  const descMatch = text.match(/description:\s*\|?\s*\n([\s\S]*?)(?=\n\w|\naccepts:|\nrejects:|$)/);
  const description = descMatch ? descMatch[1].trim() : text.split("\n")[0] || "";

  if (description.length < 50) {
    errors.push({ field: "service.description", message: "Description should be at least 50 characters", blocking: false });
  }

  const extractList = (key: string): string[] => {
    const m = text.match(new RegExp(`${key}:\\s*\\n([\\s\\S]*?)(?=\\n\\w|$)`));
    if (!m) return [];
    return m[1].split("\n").map(l => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
  };

  return {
    description,
    accepts: extractList("accepts"),
    rejects: extractList("rejects"),
  };
}

function parseExamplesSection(text: string, errors: ParseError[]) {
  const examples: Array<{ input: string; output: string }> = [];
  const blocks = text.split(/example_\d+:/i).filter(Boolean);

  for (const block of blocks) {
    const inputMatch = block.match(/input:\s*["']?([\s\S]*?)["']?\s*\n\s*output:/);
    const outputMatch = block.match(/output:\s*['"]?([\s\S]*?)['"]?\s*$/);

    if (inputMatch && outputMatch) {
      examples.push({
        input: inputMatch[1].trim(),
        output: outputMatch[1].trim(),
      });
    }
  }

  if (examples.length < 2) {
    errors.push({ field: "examples", message: "At least 2 examples required", blocking: true });
  }

  return examples;
}

function buildSystemPrompt(skill: Omit<ParsedSkill, "system_prompt">): string {
  return `You are an expert AI service agent created from a professional's SKILL.md.

PROFESSIONAL: ${skill.meta.author}
SERVICE: ${skill.meta.name}

WHAT YOU DO:
${skill.service.description}

YOU ACCEPT:
${skill.service.accepts.map(a => `- ${a}`).join("\n")}

YOU DO NOT HANDLE:
${skill.service.rejects.map(r => `- ${r}`).join("\n")}

OUTPUT FORMAT — you MUST return valid JSON matching this schema exactly:
${JSON.stringify(skill.output_schema, null, 2)}

EXAMPLES OF YOUR WORK:
${skill.examples.map((e, i) => `
Example ${i + 1}:
Input: ${e.input}
Output: ${e.output}
`).join("\n")}

CRITICAL RULES:
- Always return valid JSON. Never add prose before or after the JSON.
- If the input falls outside your scope, return: {"error": "out_of_scope", "reason": "..."}
- Never fabricate facts. If uncertain, say so in the output.`.trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/skill-parser.ts
git commit -m "feat: SKILL.md parser with validation + system prompt generation"
```

---

## Task 3: OpenRouter LLM Client

**Files:**
- Create: `src/lib/llm.ts`

- [ ] **Step 1: Install openai SDK**

```bash
npm install openai
```

- [ ] **Step 2: Create the LLM client**

```ts
// src/lib/llm.ts
import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://openreap.xyz",
    "X-Title": "OpenReap",
  },
});

const MODEL_MAP: Record<string, string> = {
  "openrouter-free": "meta-llama/llama-3.1-8b-instruct",
  "mistral-7b": "mistralai/mistral-7b-instruct",
  "gemma-2-9b": "google/gemma-2-9b-it",
  "claude-haiku": "anthropic/claude-3.5-haiku",
  "gpt-4o-mini": "openai/gpt-4o-mini",
};

const COST_PER_TOKEN: Record<string, number> = {
  "meta-llama/llama-3.1-8b-instruct": 0.00000006,
  "mistralai/mistral-7b-instruct": 0.00000006,
  "google/gemma-2-9b-it": 0.00000008,
  "anthropic/claude-3.5-haiku": 0.0000008,
  "openai/gpt-4o-mini": 0.0000006,
};

export interface LLMResult {
  content: object;
  raw: string;
  tokens: number;
  latency_ms: number;
  model: string;
  cost_usdc: number;
}

export async function callLLM(
  systemPrompt: string,
  userInput: string,
  modelKey: string
): Promise<LLMResult> {
  const model = MODEL_MAP[modelKey] || MODEL_MAP["openrouter-free"];
  const start = Date.now();

  const response = await openrouter.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048,
    temperature: 0.1,
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const tokens = response.usage?.total_tokens || 0;
  const latency_ms = Date.now() - start;
  const cost_usdc = (COST_PER_TOKEN[model] || 0.0000001) * tokens;

  let content: object;
  try {
    content = JSON.parse(raw);
  } catch {
    content = { error: "output_invalid", raw };
  }

  return { content, raw, tokens, latency_ms, model, cost_usdc };
}
```

- [ ] **Step 3: Add OPENROUTER_API_KEY to .env.local**

```
OPENROUTER_API_KEY=<your-key>
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm.ts
git commit -m "feat: OpenRouter LLM client with model mapping + cost tracking"
```

---

## Task 4: Agent Creation API + Upload UI

**Files:**
- Create: `src/app/api/agents/create/route.ts`
- Create: `src/app/onboard/page.tsx`

- [ ] **Step 1: Create agent upload API**

```ts
// src/app/api/agents/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseSkillMd } from "@/lib/skill-parser";
import { callLLM } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { skillMd } = await req.json();
  if (!skillMd || typeof skillMd !== "string") {
    return NextResponse.json({ error: "skillMd is required" }, { status: 400 });
  }

  if (skillMd.length > 102400) {
    return NextResponse.json({ error: "SKILL.md exceeds 100KB limit" }, { status: 400 });
  }

  // Parse
  const { skill, errors } = parseSkillMd(skillMd);
  if (!skill) {
    return NextResponse.json({ error: "Invalid SKILL.md", details: errors }, { status: 422 });
  }

  // Generate slug
  const slug = skill.meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Run test job with first example
  let testResult = null;
  try {
    testResult = await callLLM(
      skill.system_prompt,
      skill.examples[0].input,
      skill.meta.model_tier === "pro" ? "claude-haiku" : "openrouter-free"
    );
  } catch (e) {
    testResult = { error: "LLM test failed", detail: String(e) };
  }

  // Insert agent as draft
  const priceCents = Math.round(skill.meta.price_usdc * 100);
  const [agent] = await sql`
    INSERT INTO agents (
      owner_id, slug, name, description, category, price_cents,
      model, skill_md, parsed_skill, system_prompt, status
    ) VALUES (
      ${user.id}, ${slug}, ${skill.meta.name}, ${skill.service.description},
      ${skill.meta.category}, ${priceCents},
      ${skill.meta.model_tier === "pro" ? "claude-haiku" : "openrouter-free"},
      ${skillMd}, ${JSON.stringify(skill)}::jsonb, ${skill.system_prompt}, 'draft'
    )
    ON CONFLICT (slug) DO UPDATE SET
      skill_md = EXCLUDED.skill_md,
      parsed_skill = EXCLUDED.parsed_skill,
      system_prompt = EXCLUDED.system_prompt,
      updated_at = now()
    RETURNING id, slug, name, status
  `;

  return NextResponse.json({
    agent,
    parsed: skill,
    warnings: errors.filter(e => !e.blocking),
    testResult,
  });
}
```

- [ ] **Step 2: Create approve/go-live endpoint**

```ts
// src/app/api/agents/[slug]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  const [agent] = await sql`
    UPDATE agents SET status = 'live', is_live = true, updated_at = now()
    WHERE slug = ${slug} AND owner_id = ${user.id} AND status = 'draft'
    RETURNING id, slug, name, status
  `;

  if (!agent) return NextResponse.json({ error: "Agent not found or already live" }, { status: 404 });

  return NextResponse.json({ agent });
}
```

- [ ] **Step 3: Create the onboarding/upload page**

Create `src/app/onboard/page.tsx` — a "use client" page with:
- Textarea for pasting SKILL.md content
- "Parse & Test" button → calls POST /api/agents/create
- Shows parsed result, warnings, test output
- "Go Live" button → calls POST /api/agents/{slug}/approve
- Link to download templates from /templates page

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agents/create/route.ts src/app/api/agents/*/approve/route.ts src/app/onboard/page.tsx
git commit -m "feat: agent creation — SKILL.md upload, parse, test, go live"
```

---

## Task 5: Job Execution Endpoint (x402 flow)

**Files:**
- Create: `src/app/api/agents/[slug]/run/route.ts`
- Create: `src/lib/elsa.ts`

This is the core endpoint. A hiring agent calls `POST /api/agents/{slug}/run`. Without payment → returns 402 with Elsa payment details. With valid x402 payment header → executes the job.

- [ ] **Step 1: Create Elsa x402 helper**

```ts
// src/lib/elsa.ts

const REAP_SAFE_ADDRESS = process.env.REAP_SAFE_ADDRESS || "0x0000000000000000000000000000000000000000";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function getPaymentDetails(agentName: string, agentSlug: string, priceUsdc: number) {
  return {
    version: "1",
    scheme: "exact",
    network: "eip155:8453",
    maxAmountRequired: String(Math.round(priceUsdc * 1e6)),
    resource: `${process.env.NEXT_PUBLIC_API_URL || "https://api.openreap.xyz"}/api/agents/${agentSlug}/run`,
    description: agentName,
    mimeType: "application/json",
    payTo: REAP_SAFE_ADDRESS,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE,
    extra: { name: "OpenReap", version: "1.0" },
  };
}

export async function verifyPayment(paymentHeader: string, expectedAmountUsdc: number): Promise<{ ok: boolean; tx_hash?: string; reason?: string }> {
  // For prototype: accept any non-empty payment header
  // In production: call Elsa API to verify the payment proof
  if (!paymentHeader || paymentHeader.length < 10) {
    return { ok: false, reason: "Invalid payment header" };
  }

  // TODO: Call x402-api.heyelsa.ai to verify payment
  // For now, return ok with a placeholder tx_hash
  return {
    ok: true,
    tx_hash: `0x${Buffer.from(paymentHeader).toString("hex").slice(0, 64)}`,
  };
}
```

- [ ] **Step 2: Create job execution endpoint**

```ts
// src/app/api/agents/[slug]/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { getPaymentDetails, verifyPayment } from "@/lib/elsa";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Load agent
  const [agent] = await sql`
    SELECT a.*, u.id as owner_user_id
    FROM agents a JOIN users u ON a.owner_id = u.id
    WHERE a.slug = ${slug} AND a.status = 'live'
  `;
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const priceUsdc = agent.price_cents / 100;

  // Step 1: Check for x402 payment header
  const paymentHeader = req.headers.get("x-payment");
  if (!paymentHeader) {
    return NextResponse.json(
      getPaymentDetails(agent.name, agent.slug, priceUsdc),
      { status: 402 }
    );
  }

  // Step 2: Verify payment
  const verified = await verifyPayment(paymentHeader, priceUsdc);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 402 });
  }

  // Step 3: Get input
  const body = await req.json();
  const input = body.input;
  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }

  // Step 4: Reject filter
  const parsedSkill = agent.parsed_skill;
  if (parsedSkill?.service?.rejects) {
    for (const pattern of parsedSkill.service.rejects) {
      if (input.toLowerCase().includes(pattern.toLowerCase())) {
        return NextResponse.json({ error: "out_of_scope", reason: pattern });
      }
    }
  }

  // Step 5: Escalation check
  if (parsedSkill?.escalate_patterns) {
    for (const pattern of parsedSkill.escalate_patterns) {
      if (input.toLowerCase().includes(pattern.toLowerCase())) {
        const [job] = await sql`
          INSERT INTO jobs (agent_id, input_payload, status, price_cents, elsa_tx_hash, created_at)
          VALUES (${agent.id}, ${JSON.stringify({ text: input })}::jsonb, 'escalated', ${agent.price_cents}, ${verified.tx_hash}, now())
          RETURNING id
        `;
        return NextResponse.json(
          { status: "escalated", job_id: job.id, message: "Queued for professional review" },
          { status: 202 }
        );
      }
    }
  }

  // Step 6: LLM call
  const llmResult = await callLLM(agent.system_prompt, input, agent.model);

  // Step 7: Record job
  const [job] = await sql`
    INSERT INTO jobs (
      agent_id, input_payload, output_payload, status, price_cents,
      elsa_tx_hash, tokens_used, llm_cost_usdc, llm_model,
      creator_payout_cents, reap_fee_cents, started_at, completed_at, created_at
    ) VALUES (
      ${agent.id}, ${JSON.stringify({ text: input })}::jsonb,
      ${JSON.stringify(llmResult.content)}::jsonb, 'completed', ${agent.price_cents},
      ${verified.tx_hash}, ${llmResult.tokens}, ${llmResult.cost_usdc}, ${llmResult.model},
      ${Math.round(agent.price_cents * 0.75)}, ${Math.round(agent.price_cents * 0.25)},
      now(), now(), now()
    )
    RETURNING id
  `;

  // Step 8: Update balance
  await sql`
    INSERT INTO balances (user_id, available_usdc, lifetime_earned)
    VALUES (${agent.owner_user_id}, ${priceUsdc * 0.75}, ${priceUsdc * 0.75})
    ON CONFLICT (user_id) DO UPDATE SET
      available_usdc = balances.available_usdc + ${priceUsdc * 0.75},
      lifetime_earned = balances.lifetime_earned + ${priceUsdc * 0.75}
  `;

  // Step 9: Update agent stats
  await sql`
    UPDATE agents SET
      jobs_completed = jobs_completed + 1,
      updated_at = now()
    WHERE id = ${agent.id}
  `;

  return NextResponse.json({
    output: llmResult.content,
    job_id: job.id,
    tx_hash: verified.tx_hash,
    model: llmResult.model,
    tokens: llmResult.tokens,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/elsa.ts src/app/api/agents/*/run/route.ts
git commit -m "feat: job execution endpoint with x402 flow, LLM call, escalation check"
```

---

## Task 6: Onboarding UI Page

**Files:**
- Create: `src/app/onboard/page.tsx`

A "use client" page matching the OpenReap dark design. Professional pastes their SKILL.md, clicks "Parse & Test", reviews the results, then clicks "Go Live".

- [ ] **Step 1: Create the onboarding page**

Build the page with:
- DashNav at top
- "Create Your Agent" heading (Space Grotesk Bold)
- Textarea for SKILL.md (full width, dark bg, mono font, ~20 rows)
- "Parse & Test" button (terracotta)
- Results panel showing: parsed meta, validation warnings, test job output
- "Go Live" button (only shown after successful parse+test)
- Error display for validation failures
- Loading states during parse/test/approve
- Link to `/templates` for downloading starter templates

- [ ] **Step 2: Commit**

```bash
git add src/app/onboard/page.tsx
git commit -m "feat: agent onboarding page — SKILL.md upload, parse, test, go live"
```

---

## Task 7: Wire Remaining Pieces

**Files:**
- Modify: `src/app/settings/model/page.tsx` — save model selection via PUT
- Modify: `src/components/DashNav.tsx` — add "Create Agent" link
- Modify: `src/app/api/dashboard/route.ts` — include balance from balances table
- Create: `src/app/api/agents/[slug]/model/route.ts` — PUT to update agent model

- [ ] **Step 1: Add model update API**

```ts
// src/app/api/agents/[slug]/model/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const { model } = await req.json();

  const [agent] = await sql`
    UPDATE agents SET model = ${model}, updated_at = now()
    WHERE slug = ${slug} AND owner_id = ${user.id}
    RETURNING id, slug, model
  `;

  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ agent });
}
```

- [ ] **Step 2: Update DashNav with "Create Agent" link**

Add a "+ Create Agent" button in the nav that links to `/onboard`.

- [ ] **Step 3: Update dashboard to show balance**

In `/api/dashboard/route.ts`, add a query for the balances table and include `available_usdc` and `lifetime_earned` in the response.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: model update API, create agent nav link, balance in dashboard"
```

---

## Task 8: Add .env.local Variables + Update Seed

- [ ] **Step 1: Update .env.local with all needed vars**

```
DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
SESSION_SECRET="openreap-session-secret-change-in-production"
OPENROUTER_API_KEY=sk-or-v1-xxx
REAP_SAFE_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

- [ ] **Step 2: Update seed to include parsed_skill + system_prompt for existing agents**

- [ ] **Step 3: Run seed + verify build**

```bash
node scripts/seed.mjs
npx next build
```

---

## Verification

1. Run `node scripts/migrate-v2.mjs` — schema updated
2. Run `node scripts/seed.mjs` — demo data seeded
3. Sign in as sarah@mitchell.law / password123
4. Go to `/onboard` — paste a SKILL.md template, click "Parse & Test"
5. See parsed output + LLM test result
6. Click "Go Live" — agent status changes to live
7. Test job execution: `curl -X POST http://localhost:3000/api/agents/{slug}/run -d '{"input":"test"}'` → get 402
8. Test with payment header: `curl -X POST ... -H "x-payment: test-payment-proof" -d '{"input":"Review this NDA..."}'` → get 200 with LLM output
9. Dashboard shows updated earnings + new job
10. `npx next build` passes
