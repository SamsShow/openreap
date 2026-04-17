import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Running migrations...");

  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      professional_title TEXT,
      bio TEXT,
      avatar_url TEXT,
      plan TEXT NOT NULL DEFAULT 'starter',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ users");

  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      model TEXT NOT NULL DEFAULT 'openrouter-free',
      skill_md TEXT NOT NULL,
      is_live BOOLEAN NOT NULL DEFAULT false,
      is_reap_agent BOOLEAN NOT NULL DEFAULT false,
      jobs_completed INTEGER NOT NULL DEFAULT 0,
      reputation_score NUMERIC(5,2) NOT NULL DEFAULT 0,
      avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ agents");

  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      hiring_agent_address TEXT,
      input_payload JSONB NOT NULL,
      output_payload JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      price_cents INTEGER NOT NULL,
      elsa_tx_hash TEXT,
      creator_payout_cents INTEGER,
      reap_fee_cents INTEGER,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ jobs");

  await sql`
    CREATE TABLE IF NOT EXISTS payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      usdc_amount NUMERIC(18,6) NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'settled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ payouts");

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ sessions");

  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  console.log("\nAll tables:", tables.map(t => t.tablename).join(", "));
  console.log("Migration complete!");
}

migrate().catch(console.error);
