import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Running v2 migration...\n");

  // Agents: add parsed_skill, system_prompt, x402_endpoint, status
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS parsed_skill JSONB`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS x402_endpoint TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'`;
  await sql`UPDATE agents SET status = 'live' WHERE is_live = true AND (status IS NULL OR status = 'draft')`;
  console.log("  ✓ agents: parsed_skill, system_prompt, x402_endpoint, status");

  // Jobs: add LLM tracking fields
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tokens_used INTEGER`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS llm_cost_usdc NUMERIC(20,6)`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS llm_model TEXT`;
  console.log("  ✓ jobs: tokens_used, llm_cost_usdc, llm_model");

  // Balances table
  await sql`
    CREATE TABLE IF NOT EXISTS balances (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      available_usdc NUMERIC(20,6) DEFAULT 0,
      pending_usdc NUMERIC(20,6) DEFAULT 0,
      lifetime_earned NUMERIC(20,6) DEFAULT 0
    )
  `;
  console.log("  ✓ balances table");

  // Withdrawals table
  await sql`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_usdc NUMERIC(20,6) NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tx_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `;
  console.log("  ✓ withdrawals table");

  // Users: ensure wallet_address column exists
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT`;
  console.log("  ✓ users: wallet_address");

  // Payouts: ensure wallet_address column exists
  await sql`ALTER TABLE payouts ADD COLUMN IF NOT EXISTS wallet_address TEXT`;
  console.log("  ✓ payouts: wallet_address");

  // Verify
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log("\nAll tables:", tables.map(t => t.tablename).join(", "));
  console.log("v2 migration complete!");
}

migrate().catch(console.error);
