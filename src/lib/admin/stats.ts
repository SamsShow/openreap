import { sql } from "../db";

export type StatSlice<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SessionsData = { today: number; last7d: number; last30d: number };
export type AgentsData = { live: number; total: number };
export type JobsData = { total: number; last24h: number };
export type UsdcData = { settledCents: number; reapFeeCents: number };
export type UsersData = { total: number; new7d: number };
export type DailyRow = { day: string; sessions: number; jobs: number; usdcCents: number };
export type TopAgentRow = { id: string; name: string; jobs_completed: number; avg_rating: number };
export type TopCreatorRow = { user_id: string; display_name: string | null; lifetime_earned_usdc: string };
export type RecentJobRow = {
  id: string;
  agent_name: string;
  price_cents: number;
  status: string;
  created_at: string;
};

export type AdminStats = {
  sessions: StatSlice<SessionsData>;
  agents: StatSlice<AgentsData>;
  jobs: StatSlice<JobsData>;
  usdc: StatSlice<UsdcData>;
  users: StatSlice<UsersData>;
  daily: StatSlice<DailyRow[]>;
  topAgents: StatSlice<TopAgentRow[]>;
  topCreators: StatSlice<TopCreatorRow[]>;
  recentJobs: StatSlice<RecentJobRow[]>;
};

const n = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

async function slice<T>(fn: () => Promise<T>): Promise<StatSlice<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin stats]", msg);
    return { ok: false, error: msg };
  }
}

export async function getAdminStats(): Promise<AdminStats> {
  const [
    sessions,
    agents,
    jobs,
    usdc,
    users,
    daily,
    topAgents,
    topCreators,
    recentJobs,
  ] = await Promise.all([
    slice(async () => {
      const [row] = await sql`
        SELECT
          COUNT(DISTINCT session_id) FILTER (WHERE day = CURRENT_DATE)                         AS today,
          COUNT(DISTINCT session_id) FILTER (WHERE day >= CURRENT_DATE - INTERVAL '6 days')    AS last7d,
          COUNT(DISTINCT session_id) FILTER (WHERE day >= CURRENT_DATE - INTERVAL '29 days')   AS last30d
        FROM daily_sessions
      `;
      return { today: n(row?.today), last7d: n(row?.last7d), last30d: n(row?.last30d) };
    }),

    slice(async () => {
      const [row] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE is_live) AS live,
          COUNT(*) AS total
        FROM agents
      `;
      return { live: n(row?.live), total: n(row?.total) };
    }),

    slice(async () => {
      const [row] = await sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last24h
        FROM jobs
      `;
      return { total: n(row?.total), last24h: n(row?.last24h) };
    }),

    slice(async () => {
      const [row] = await sql`
        SELECT
          COALESCE(SUM(price_cents) FILTER (WHERE status = 'completed'), 0) AS settled_cents,
          COALESCE(SUM(reap_fee_cents), 0)                                  AS reap_fee_cents
        FROM jobs
      `;
      return {
        settledCents: n(row?.settled_cents),
        reapFeeCents: n(row?.reap_fee_cents),
      };
    }),

    slice(async () => {
      const [row] = await sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new7d
        FROM users
      `;
      return { total: n(row?.total), new7d: n(row?.new7d) };
    }),

    slice<DailyRow[]>(async () => {
      const rows = await sql`
        WITH days AS (
          SELECT generate_series(
            (CURRENT_DATE - INTERVAL '29 days')::date,
            CURRENT_DATE::date,
            INTERVAL '1 day'
          )::date AS day
        ),
        sessions_per_day AS (
          SELECT day, COUNT(DISTINCT session_id) AS sessions
          FROM daily_sessions
          WHERE day >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY day
        ),
        jobs_per_day AS (
          SELECT created_at::date AS day,
                 COUNT(*) AS jobs,
                 COALESCE(SUM(price_cents) FILTER (WHERE status = 'completed'), 0) AS usdc_cents
          FROM jobs
          WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY created_at::date
        )
        SELECT
          to_char(d.day, 'YYYY-MM-DD')         AS day,
          COALESCE(s.sessions, 0)              AS sessions,
          COALESCE(j.jobs, 0)                  AS jobs,
          COALESCE(j.usdc_cents, 0)            AS usdc_cents
        FROM days d
        LEFT JOIN sessions_per_day s ON s.day = d.day
        LEFT JOIN jobs_per_day j     ON j.day = d.day
        ORDER BY d.day
      `;
      return rows.map((r) => ({
        day: String(r.day),
        sessions: n(r.sessions),
        jobs: n(r.jobs),
        usdcCents: n(r.usdc_cents),
      }));
    }),

    slice<TopAgentRow[]>(async () => {
      const rows = await sql`
        SELECT id, name, jobs_completed, avg_rating
        FROM agents
        ORDER BY jobs_completed DESC, created_at DESC
        LIMIT 10
      `;
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        jobs_completed: n(r.jobs_completed),
        avg_rating: n(r.avg_rating),
      }));
    }),

    slice<TopCreatorRow[]>(async () => {
      const rows = await sql`
        SELECT b.user_id, u.display_name, b.lifetime_earned AS lifetime_earned_usdc
        FROM balances b
        JOIN users u ON u.id = b.user_id
        ORDER BY b.lifetime_earned DESC
        LIMIT 10
      `;
      return rows.map((r) => ({
        user_id: String(r.user_id),
        display_name: r.display_name ? String(r.display_name) : null,
        lifetime_earned_usdc: String(r.lifetime_earned_usdc ?? "0"),
      }));
    }),

    slice<RecentJobRow[]>(async () => {
      const rows = await sql`
        SELECT j.id, a.name AS agent_name, j.price_cents, j.status, j.created_at
        FROM jobs j
        JOIN agents a ON a.id = j.agent_id
        ORDER BY j.created_at DESC
        LIMIT 20
      `;
      return rows.map((r) => ({
        id: String(r.id),
        agent_name: String(r.agent_name),
        price_cents: n(r.price_cents),
        status: String(r.status),
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
      }));
    }),
  ]);

  return { sessions, agents, jobs, usdc, users, daily, topAgents, topCreators, recentJobs };
}
