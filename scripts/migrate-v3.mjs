import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Running v3 migration...\n");

  await sql`
    CREATE TABLE IF NOT EXISTS daily_sessions (
      session_id TEXT NOT NULL,
      day        DATE NOT NULL,
      user_id    UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      first_path TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, day)
    )
  `;
  console.log("  ✓ daily_sessions table");

  await sql`CREATE INDEX IF NOT EXISTS daily_sessions_day_idx ON daily_sessions(day)`;
  console.log("  ✓ daily_sessions_day_idx");

  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log("\nAll tables:", tables.map((t) => t.tablename).join(", "));
  console.log("v3 migration complete!");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
