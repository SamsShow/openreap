import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

async function seed() {
  console.log("Seeding database...\n");

  // Ensure payouts table has wallet_address column
  await sql`ALTER TABLE payouts ADD COLUMN IF NOT EXISTS wallet_address TEXT`;
  console.log("  ✓ Ensured wallet_address column exists on payouts");

  // Ensure balances has updated_at (used by hire-agent + withdrawal flows)
  await sql`ALTER TABLE balances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
  console.log("  ✓ Ensured updated_at column exists on balances");

  // Normalize any legacy agent.model values that OpenRouter rejects. Anything
  // without a `/` (e.g. "standard", "none", "", "openrouter-free") gets
  // rewritten to the real free Llama id so callLLM doesn't 400 out.
  const normalized = await sql`
    UPDATE agents
    SET model = 'meta-llama/llama-3.1-8b-instruct:free'
    WHERE is_reap_agent = false
      AND (model IS NULL OR model NOT LIKE '%/%')
    RETURNING id
  `;
  console.log(
    `  ✓ Normalized ${normalized.length} agents with invalid model values`
  );

  // 1. Create demo user
  const passwordHash = await bcrypt.hash("password123", 12);
  const [user] = await sql`
    INSERT INTO users (email, password_hash, display_name, professional_title, bio, plan)
    VALUES (
      'sarah@mitchell.law',
      ${passwordHash},
      'Sarah Mitchell',
      'Attorney — Contract Law',
      '10+ years reviewing contracts for tech startups. Specialized in SaaS agreements, NDAs, and vendor contracts.',
      'starter'
    )
    ON CONFLICT (email) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      professional_title = EXCLUDED.professional_title,
      bio = EXCLUDED.bio
    RETURNING id
  `;
  const userId = user.id;
  console.log("  ✓ User: Sarah Mitchell (sarah@mitchell.law / password123)");

  // 2. Create agents
  const [agent1] = await sql`
    INSERT INTO agents (owner_id, slug, name, description, category, price_cents, model, skill_md, is_live, jobs_completed, reputation_score, avg_rating)
    VALUES (
      ${userId}, 'contract-reviewer', 'Contract Reviewer',
      'Reviews NDAs, service agreements, and vendor contracts for tech startups. Flags risk clauses, indemnity issues, and suggests protective edits. Specializes in SaaS and technology contracts.',
      'Legal', 500, 'openrouter-free',
      'name: contract-reviewer\nprice: 5\nskill: Review contracts for risk clauses, indemnity, IP assignment\nescalate_if: liability > 100K',
      true, 1247, 98.20, 4.90
    )
    ON CONFLICT (slug) DO UPDATE SET jobs_completed = EXCLUDED.jobs_completed, reputation_score = EXCLUDED.reputation_score
    RETURNING id
  `;

  const [agent2] = await sql`
    INSERT INTO agents (owner_id, slug, name, description, category, price_cents, model, skill_md, is_live, jobs_completed, reputation_score, avg_rating)
    VALUES (
      ${userId}, 'tax-filing-assistant', 'Tax Filing Assistant',
      'Handles tax return queries, eligibility checks, and compliance flags for small businesses and freelancers.',
      'Finance & Tax', 300, 'openrouter-free',
      'name: tax-assistant\nprice: 3\nskill: Answer tax queries, eligibility checks\nescalate_if: revenue > 500K',
      true, 3891, 96.70, 4.70
    )
    ON CONFLICT (slug) DO UPDATE SET jobs_completed = EXCLUDED.jobs_completed, reputation_score = EXCLUDED.reputation_score
    RETURNING id
  `;

  const [agent3] = await sql`
    INSERT INTO agents (owner_id, slug, name, description, category, price_cents, model, skill_md, is_live, jobs_completed, reputation_score, avg_rating)
    VALUES (
      ${userId}, 'pitch-deck-reviewer', 'Pitch Deck Reviewer',
      'Reviews startup pitch decks for clarity, structure, and investor readiness. Provides slide-by-slide feedback.',
      'Strategy', 1000, 'openrouter-free',
      'name: pitch-deck-reviewer\nprice: 10\nskill: Review pitch decks for clarity and investor readiness\nescalate_if: complex_cap_table',
      true, 567, 97.30, 4.80
    )
    ON CONFLICT (slug) DO UPDATE SET jobs_completed = EXCLUDED.jobs_completed, reputation_score = EXCLUDED.reputation_score
    RETURNING id
  `;
  console.log("  ✓ 3 agents: Contract Reviewer, Tax Filing Assistant, Pitch Deck Reviewer");

  // Also seed some marketplace agents from other "users"
  const otherHash = await bcrypt.hash("demo123", 12);

  const [user2] = await sql`
    INSERT INTO users (email, password_hash, display_name, professional_title, bio, plan)
    VALUES ('alex@devops.io', ${otherHash}, 'Alex K.', 'Senior Developer', 'Security-focused code reviewer.', 'starter')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id
  `;
  await sql`
    INSERT INTO agents (owner_id, slug, name, description, category, price_cents, model, skill_md, is_live, jobs_completed, reputation_score, avg_rating)
    VALUES (${user2.id}, 'code-review-pro', 'Code Review Pro',
      'Catches security flaws, suggests refactors, enforces team conventions. Supports Python, TypeScript, Go, and Rust.',
      'Software Engineering', 1200, 'openrouter-free',
      'name: code-reviewer\nprice: 12\nskill: Review code for security and quality\nescalate_if: critical_vuln',
      true, 482, 99.10, 4.90)
    ON CONFLICT (slug) DO NOTHING
  `;

  const [user3] = await sql`
    INSERT INTO users (email, password_hash, display_name, professional_title, bio, plan)
    VALUES ('emma@content.co', ${otherHash}, 'Emma Davis', 'Content Strategist', 'SEO expert and blog writer.', 'starter')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id
  `;
  await sql`
    INSERT INTO agents (owner_id, slug, name, description, category, price_cents, model, skill_md, is_live, jobs_completed, reputation_score, avg_rating)
    VALUES (${user3.id}, 'blog-seo-writer', 'Blog SEO Writer',
      'Writes SEO-optimized blog posts with keyword research, meta descriptions, and internal linking suggestions.',
      'Content & Writing', 800, 'openrouter-free',
      'name: blog-seo-writer\nprice: 8\nskill: Write SEO blog posts\nescalate_if: topic_mismatch',
      true, 2108, 94.50, 4.60)
    ON CONFLICT (slug) DO NOTHING
  `;

  const [user4] = await sql`
    INSERT INTO users (email, password_hash, display_name, professional_title, bio, plan)
    VALUES ('lisa@data.dev', ${otherHash}, 'Lisa R.', 'Data Engineer', 'ETL pipeline specialist.', 'starter')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id
  `;
  await sql`
    INSERT INTO agents (owner_id, slug, name, description, category, price_cents, model, skill_md, is_live, jobs_completed, reputation_score, avg_rating)
    VALUES (${user4.id}, 'data-pipeline-auditor', 'Data Pipeline Auditor',
      'Reviews ETL pipelines, checks for data quality issues, validates schema migrations and transformation logic.',
      'Data & Analytics', 1100, 'openrouter-free',
      'name: data-pipeline-auditor\nprice: 11\nskill: Audit ETL pipelines\nescalate_if: schema_break',
      true, 321, 98.80, 4.70)
    ON CONFLICT (slug) DO NOTHING
  `;
  console.log("  ✓ 3 marketplace agents: Code Review Pro, Blog SEO Writer, Data Pipeline Auditor");

  // 3. Create jobs for Sarah's agents
  const now = new Date();
  const jobData = [
    { agentId: agent1.id, input: "NDA review — Acme Corp vendor agreement", status: "completed", price: 500, ago: 2 },
    { agentId: agent2.id, input: "Tax return query — eligibility check for SaaS business", status: "completed", price: 300, ago: 5 },
    { agentId: agent3.id, input: "Pitch deck — Series A fintech, complex cap table with convertible notes, SAFE agreements, and multi-class equity", status: "escalated", price: 1000, ago: 8 },
    { agentId: agent1.id, input: "Service agreement — Freelancer T&C review", status: "completed", price: 500, ago: 12 },
    { agentId: agent2.id, input: "Tax compliance check — Quarterly filing review", status: "completed", price: 300, ago: 15 },
    { agentId: agent1.id, input: "Joint venture agreement — liability clause exceeds $100K threshold, cross-jurisdiction enforceability concerns", status: "escalated", price: 500, ago: 23 },
    { agentId: agent2.id, input: "Composite dealer turnover query — annual turnover exceeds $500K, composition scheme eligibility in question", status: "escalated", price: 300, ago: 60 },
    { agentId: agent1.id, input: "Software license agreement — perpetual vs subscription terms", status: "completed", price: 500, ago: 30 },
  ];

  for (const job of jobData) {
    const createdAt = new Date(now.getTime() - job.ago * 60 * 1000);
    const completedAt = job.status === "completed" ? createdAt : null;
    const creatorPayout = job.status === "completed" ? Math.round(job.price * 0.75) : null;
    const reapFee = job.status === "completed" ? Math.round(job.price * 0.25) : null;

    await sql`
      INSERT INTO jobs (agent_id, input_payload, status, price_cents, creator_payout_cents, reap_fee_cents, started_at, completed_at, created_at)
      VALUES (
        ${job.agentId},
        ${JSON.stringify({ text: job.input })}::jsonb,
        ${job.status},
        ${job.price},
        ${creatorPayout},
        ${reapFee},
        ${createdAt.toISOString()},
        ${completedAt ? completedAt.toISOString() : null},
        ${createdAt.toISOString()}
      )
    `;
  }
  console.log("  ✓ 8 jobs (5 completed, 3 escalated)");

  // 4. Seed Base Auto-Trader (in-house agent, no owner — use first user as placeholder)
  await sql`
    INSERT INTO agents (
      owner_id, slug, name, description, category, price_cents, model,
      skill_md, is_live, is_reap_agent, jobs_completed, reputation_score, avg_rating,
      status, parsed_skill, system_prompt
    ) VALUES (
      ${userId}, 'base-auto-trader', 'Base Auto-Trader',
      'Takes a token swap instruction, executes the trade on Base via Uniswap v3, and returns the transaction hash. Pure on-chain execution — no LLM involved.',
      'defi', 10, 'none',
      'In-house agent. No SKILL.md — pure on-chain execution.',
      true, true, 0, 100.00, 5.00,
      'live', '{"meta":{"name":"Base Auto-Trader","price_usdc":0.10,"category":"defi"}}'::jsonb,
      'N/A — on-chain execution only'
    )
    ON CONFLICT (slug) DO UPDATE SET
      description = EXCLUDED.description,
      is_reap_agent = true,
      status = 'live'
  `;
  console.log("  ✓ Base Auto-Trader (in-house agent)");

  // 5. Seed parsed_skill + system_prompt for Sarah's agents
  const contractSkill = JSON.stringify({
    meta: { name: "Contract Reviewer", version: "1.0", author: "Sarah Mitchell, Attorney", price_usdc: 5, category: "legal", model_tier: "standard" },
    service: { description: "Reviews NDAs, service agreements, and vendor contracts for tech startups.", accepts: ["NDA and confidentiality agreements", "Service and vendor agreements"], rejects: ["Documents longer than 20 pages", "Non-English documents"] },
    output_schema: { risk_score: "Low|Medium|High", flagged_clauses: [{ clause: "...", issue: "...", fix: "..." }], summary: "..." },
    examples: [
      { input: "NDA with unlimited liability and no term limit", output: '{"risk_score":"High","flagged_clauses":[{"clause":"Unlimited liability","issue":"No cap on indemnity","fix":"Add liability ceiling of 2x contract value"}],"summary":"High risk NDA with uncapped liability."}' },
      { input: "Standard SaaS agreement, Indian jurisdiction", output: '{"risk_score":"Low","flagged_clauses":[],"summary":"Standard agreement with appropriate protections."}' }
    ],
    escalate_patterns: ["Contract value exceeds 100K", "Government or PSU as a party"]
  });
  const contractPrompt = `You are an expert AI service agent for Contract Review.\nPROFESSIONAL: Sarah Mitchell, Attorney\nYou review NDAs, service agreements, and vendor contracts.\nAlways return valid JSON with risk_score, flagged_clauses, and summary.`;

  await sql`UPDATE agents SET parsed_skill = ${contractSkill}::jsonb, system_prompt = ${contractPrompt} WHERE slug = 'contract-reviewer'`;
  await sql`UPDATE agents SET parsed_skill = '{"meta":{"name":"Tax Filing Assistant","price_usdc":3,"category":"finance"}}'::jsonb, system_prompt = 'You are a tax filing assistant. Answer tax queries with valid JSON output.' WHERE slug = 'tax-filing-assistant'`;
  await sql`UPDATE agents SET parsed_skill = '{"meta":{"name":"Pitch Deck Reviewer","price_usdc":10,"category":"tech"}}'::jsonb, system_prompt = 'You are a pitch deck reviewer. Analyze decks for clarity and investor readiness. Return valid JSON.' WHERE slug = 'pitch-deck-reviewer'`;
  console.log("  ✓ Updated parsed_skill + system_prompt for all agents");

  // 6. Create balance row for Sarah — seed a realistic amount so the payouts
  // page has something to withdraw during demos. 75% creator share × $15 of
  // completed jobs ≈ $11.25. Round to 12.50 to keep the UI readable.
  await sql`
    INSERT INTO balances (user_id, available_usdc, pending_usdc, lifetime_earned, updated_at)
    VALUES (${userId}, 12.50, 0, 12.50, now())
    ON CONFLICT (user_id) DO UPDATE SET
      available_usdc = GREATEST(balances.available_usdc, 12.50),
      lifetime_earned = GREATEST(balances.lifetime_earned, 12.50),
      updated_at = now()
  `;
  console.log("  ✓ Balance row for Sarah ($12.50 available for demo)");

  // Verify
  const counts = await Promise.all([
    sql`SELECT COUNT(*) as c FROM users`,
    sql`SELECT COUNT(*) as c FROM agents`,
    sql`SELECT COUNT(*) as c FROM jobs`,
  ]);
  console.log(`\nDatabase totals: ${counts[0][0].c} users, ${counts[1][0].c} agents, ${counts[2][0].c} jobs`);
  console.log("Seed complete!");
}

seed().catch(console.error);
