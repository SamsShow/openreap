/**
 * One-shot seed for the test@gmail.com account.
 *
 * Populates: 3 live agents, a mix of completed + escalated jobs spread over
 * the last 7 days (with several in the last 24h), payouts, and a balance row.
 *
 * Idempotent: re-runs are safe — agents use upsert by slug, jobs/payouts are
 * cleared-then-reinserted for this user so the counts don't double.
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

const EMAIL = "test@gmail.com";

async function run() {
  console.log(`Seeding demo data for ${EMAIL}...\n`);

  // 1. Look up the user (must already exist — user signed up).
  const users = await sql`SELECT id, display_name FROM users WHERE email = ${EMAIL}`;
  if (users.length === 0) {
    console.error(
      `No user with email ${EMAIL} found. Sign up via the UI first, then re-run.`
    );
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`  ✓ Found user ${EMAIL} (id=${userId.slice(0, 8)}...)`);

  // 2. Wipe this user's previous demo jobs + payouts so counts stay clean.
  await sql`
    DELETE FROM payouts
    WHERE user_id = ${userId}
  `;
  await sql`
    DELETE FROM jobs
    WHERE agent_id IN (SELECT id FROM agents WHERE owner_id = ${userId})
  `;
  console.log("  ✓ Cleared previous demo jobs + payouts");

  // 3. Upsert 3 agents owned by this user.
  const agentDefs = [
    {
      slug: "test-contract-reviewer",
      name: "Contract Reviewer",
      description:
        "Reviews NDAs, vendor agreements, and SaaS contracts. Flags risk clauses, indemnity issues, and suggests protective edits.",
      category: "Legal",
      price_cents: 500,
      reputation: 98.4,
      rating: 4.9,
      system_prompt:
        "You are an expert contract review agent. Return JSON with risk_score, flagged_clauses[], and summary.",
      parsed_skill: {
        meta: { name: "Contract Reviewer", price_usdc: 5, category: "legal" },
      },
    },
    {
      slug: "test-code-reviewer",
      name: "Code Reviewer",
      description:
        "Catches security flaws and suggests refactors across Python, TypeScript, Go, and Rust. Prioritizes OWASP top 10 patterns.",
      category: "Software Engineering",
      price_cents: 800,
      reputation: 97.8,
      rating: 4.8,
      system_prompt:
        "You are a senior code reviewer. Return JSON with severity, issues[], and fix_diff suggestions.",
      parsed_skill: {
        meta: { name: "Code Reviewer", price_usdc: 8, category: "software" },
      },
    },
    {
      slug: "test-seo-writer",
      name: "SEO Blog Writer",
      description:
        "Writes 800-1200 word blog posts optimized for search. Researches keywords, builds meta descriptions, suggests internal links.",
      category: "Content & Writing",
      price_cents: 600,
      reputation: 95.1,
      rating: 4.6,
      system_prompt:
        "You are an SEO writer. Return JSON with title, meta_description, body_markdown, target_keywords[].",
      parsed_skill: {
        meta: { name: "SEO Blog Writer", price_usdc: 6, category: "content" },
      },
    },
  ];

  const agentIds = [];
  for (const a of agentDefs) {
    const rows = await sql`
      INSERT INTO agents (
        owner_id, slug, name, description, category, price_cents, model,
        skill_md, is_live, jobs_completed, reputation_score, avg_rating,
        status, parsed_skill, system_prompt
      ) VALUES (
        ${userId}, ${a.slug}, ${a.name}, ${a.description}, ${a.category},
        ${a.price_cents}, 'openrouter-free',
        ${`name: ${a.slug}\nprice: ${a.price_cents / 100}\nskill: ${a.description}`},
        true, 0, ${a.reputation}, ${a.rating},
        'live', ${JSON.stringify(a.parsed_skill)}::jsonb, ${a.system_prompt}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        price_cents = EXCLUDED.price_cents,
        is_live = true,
        status = 'live',
        reputation_score = EXCLUDED.reputation_score,
        avg_rating = EXCLUDED.avg_rating,
        parsed_skill = EXCLUDED.parsed_skill,
        system_prompt = EXCLUDED.system_prompt
      RETURNING id
    `;
    agentIds.push(rows[0].id);
  }
  console.log(`  ✓ Upserted ${agentDefs.length} agents`);

  // 4. Generate jobs over the last 7 days. 18 jobs total — ~6 in last 24h.
  const now = new Date();
  const jobSeeds = [
    // 0–24h — recent activity so dashboard "Jobs last 24h" isn't 0
    { agentIdx: 0, input: "NDA review — Acme Corp SaaS agreement", status: "completed", minutesAgo: 45 },
    { agentIdx: 1, input: "Python auth middleware review, watch for JWT expiry handling", status: "completed", minutesAgo: 120 },
    { agentIdx: 2, input: "Blog post: 'Why Base Sepolia for dev demos' — 1000 words", status: "completed", minutesAgo: 180 },
    { agentIdx: 0, input: "Joint venture agreement — liability clause exceeds $100K threshold", status: "escalated", minutesAgo: 240 },
    { agentIdx: 1, input: "Review Solana smart contract for reentrancy", status: "completed", minutesAgo: 420 },
    { agentIdx: 2, input: "SEO brief: '10 best Next.js libraries 2026'", status: "completed", minutesAgo: 600 },

    // 1–3 days ago
    { agentIdx: 0, input: "Service agreement — freelancer T&C review", status: "completed", minutesAgo: 60 * 26 },
    { agentIdx: 1, input: "TypeScript API handler security audit", status: "completed", minutesAgo: 60 * 30 },
    { agentIdx: 2, input: "Blog: 'x402 micropayments explained'", status: "completed", minutesAgo: 60 * 38 },
    { agentIdx: 0, input: "Software license — perpetual vs subscription terms", status: "completed", minutesAgo: 60 * 44 },
    { agentIdx: 1, input: "Rust crate for CLI tool — surface unsafe blocks", status: "completed", minutesAgo: 60 * 52 },
    { agentIdx: 2, input: "SEO audit for landing page copy", status: "completed", minutesAgo: 60 * 60 },

    // 3–7 days ago
    { agentIdx: 0, input: "Vendor agreement — indemnity cap review", status: "completed", minutesAgo: 60 * 80 },
    { agentIdx: 1, input: "Go microservice review — check for goroutine leaks", status: "completed", minutesAgo: 60 * 96 },
    { agentIdx: 2, input: "Rewrite product page copy for conversions", status: "completed", minutesAgo: 60 * 110 },
    { agentIdx: 0, input: "Composite dealer turnover query — escalation needed", status: "escalated", minutesAgo: 60 * 130 },
    { agentIdx: 1, input: "React component perf review — unnecessary re-renders", status: "completed", minutesAgo: 60 * 148 },
    { agentIdx: 2, input: "Blog: 'Shipping AI agents on a budget'", status: "completed", minutesAgo: 60 * 160 },
  ];

  let completedCount = 0;
  let totalEarnedCents = 0;

  for (const job of jobSeeds) {
    const agentId = agentIds[job.agentIdx];
    const priceCents = agentDefs[job.agentIdx].price_cents;
    const createdAt = new Date(now.getTime() - job.minutesAgo * 60 * 1000);
    const completedAt =
      job.status === "completed"
        ? new Date(createdAt.getTime() + 30 * 1000)
        : null;
    const creatorPayoutCents =
      job.status === "completed" ? Math.round(priceCents * 0.75) : null;
    const reapFeeCents =
      job.status === "completed" ? priceCents - (creatorPayoutCents ?? 0) : null;

    const jobRows = await sql`
      INSERT INTO jobs (
        agent_id, input_payload, status, price_cents,
        creator_payout_cents, reap_fee_cents,
        started_at, completed_at, created_at,
        elsa_tx_hash
      ) VALUES (
        ${agentId},
        ${JSON.stringify({ input: job.input })}::jsonb,
        ${job.status},
        ${priceCents},
        ${creatorPayoutCents},
        ${reapFeeCents},
        ${createdAt.toISOString()},
        ${completedAt ? completedAt.toISOString() : null},
        ${createdAt.toISOString()},
        ${"0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("")}
      )
      RETURNING id
    `;

    // 5. Create a matching payout for each completed job.
    if (job.status === "completed" && creatorPayoutCents) {
      completedCount += 1;
      totalEarnedCents += creatorPayoutCents;
      const usdcAmount = (creatorPayoutCents / 100).toFixed(6);
      await sql`
        INSERT INTO payouts (
          user_id, job_id, amount_cents, usdc_amount, status, created_at
        ) VALUES (
          ${userId},
          ${jobRows[0].id},
          ${creatorPayoutCents},
          ${usdcAmount},
          'settled',
          ${createdAt.toISOString()}
        )
      `;
    }
  }
  console.log(`  ✓ ${jobSeeds.length} jobs (${completedCount} completed)`);
  console.log(
    `  ✓ ${completedCount} matching payouts (~$${(totalEarnedCents / 100).toFixed(2)} total)`
  );

  // 6. Update agent.jobs_completed counters to match.
  for (let i = 0; i < agentIds.length; i += 1) {
    const completed = jobSeeds.filter(
      (j) => j.agentIdx === i && j.status === "completed"
    ).length;
    await sql`
      UPDATE agents SET jobs_completed = ${completed} WHERE id = ${agentIds[i]}
    `;
  }

  // 7. Seed the balance row. Available is capped at $5 so the demo withdraw
  // fits comfortably within a Circle Sepolia faucet drip; lifetime_earned
  // reflects the full $78 for realism in the dashboard cards.
  const totalEarnedUsdc = (totalEarnedCents / 100).toFixed(2);
  const availableDemoUsdc = "5.00";
  await sql`
    INSERT INTO balances (user_id, available_usdc, pending_usdc, lifetime_earned, updated_at)
    VALUES (${userId}, ${availableDemoUsdc}, 0, ${totalEarnedUsdc}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      available_usdc = ${availableDemoUsdc},
      lifetime_earned = GREATEST(balances.lifetime_earned, ${totalEarnedUsdc}),
      updated_at = now()
  `;
  console.log(
    `  ✓ Balance: $${availableDemoUsdc} available (lifetime earned: $${totalEarnedUsdc})`
  );

  console.log(`\nDone. Log in as ${EMAIL} and refresh your dashboard.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
