# Admin Dashboard — Design

**Date:** 2026-04-20
**Status:** Approved, ready for implementation plan
**Scope:** MVP admin dashboard for OpenReap platform stats, including lightweight visit tracking

## Problem

OpenReap has no internal view of platform health. The founders cannot answer basic operational questions: how many agents are live, how many x402 calls have settled, how much USDC has flowed through, how many users came today. Data exists in the DB; there is no place to see it. Visit traffic is not tracked at all.

## Goal

A single `/admin` page, gated to a short email allowlist, that surfaces platform-level counts, 30-day trend charts, and top-N leaderboards. Plus minimal daily-session tracking so traffic shows up alongside on-chain stats.

## Non-Goals

- Real-time updates or live polling
- Date-range controls or custom filters
- Per-agent / per-user drilldowns
- Page-view-level analytics (path popularity, funnels, referrers)
- Role-based admin permissions — env-var allowlist only
- CSV export
- Automated tests (repo has no test framework today)

## Architecture

- **Route:** `/admin`, single Next.js Server Component.
- **Access gate:** enforced inside `/admin/page.tsx` itself. The Server Component calls `getSession()` (uses `next/headers` cookies — unavailable in proxy/middleware context) and compares the session email (lowercased) to `process.env.ADMIN_EMAILS`. Non-admins and logged-out visitors hit `notFound()` and render the standard 404. No info leak that the route exists. The proxy is left focused on session tracking only.
- **Data path:** Server Component calls `src/lib/admin/stats.ts`. That module fires 9 SQL queries in parallel via the existing `@neondatabase/serverless` client and returns a typed `AdminStats` object. No API routes. No client-side data fetching. No React Query.
- **Refresh model:** reload the page. There is no filter UI and no polling.
- **Env var:** `ADMIN_EMAILS` — comma-separated list, trimmed and lowercased on read.

## Visit Tracking

### Schema

New table, created by a new `scripts/migrate-v3.mjs` following the pattern of existing `migrate.mjs` / `migrate-v2.mjs`:

```sql
CREATE TABLE daily_sessions (
  session_id   TEXT NOT NULL,
  day          DATE NOT NULL,
  user_id      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  first_path   TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, day)
);
CREATE INDEX daily_sessions_day_idx ON daily_sessions(day);
```

- Composite PK `(session_id, day)` makes "one row per session per day" naturally idempotent via `INSERT ... ON CONFLICT DO NOTHING`. No counter columns, no row updates.
- `day` stores UTC date (not timestamp).
- `user_id` is populated on the first authenticated request of the day for that session and stays `NULL` for anonymous sessions.
- `first_path` captures the first path observed for that (session, day) pair — optional, used only for debugging. It is not surfaced on the dashboard.

### Cookie

- Cookie name: `reap_sid`
- Attributes: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, `Max-Age=31536000` (1 year).
- Value: 32 random bytes, base64url-encoded.
- Generated server-side in the proxy on first request that lacks the cookie.

### Instrumentation point

Everything runs in `src/proxy.ts`. For every request that is:

1. A page route (not `_next/*`, `/api/*`, static assets, favicon, robots, sitemap), **and**
2. Not from a recognised bot (`user-agent` matches `/bot|crawl|spider|preview/i`),

the proxy:

1. Reads `reap_sid`; if missing, generates a new ID and queues a `Set-Cookie` on the response.
2. Calls `recordDailySession({ sessionId, userId, path })` **fire-and-forget** — the promise is not awaited; failures are logged and swallowed so the request is never blocked by analytics.
3. `recordDailySession` issues `INSERT INTO daily_sessions (session_id, day, user_id, first_path) VALUES (..., CURRENT_DATE AT TIME ZONE 'UTC', ...) ON CONFLICT (session_id, day) DO NOTHING`.

Rationale for proxy over a client beacon: works without JS, no CORS surface, anonymous and authenticated sessions recorded the same way, nothing to deploy on the client.

## Stats Module

`src/lib/admin/stats.ts` exports `getAdminStats(): Promise<AdminStats>`.

### Return shape

```ts
type StatSlice<T> = { ok: true; data: T } | { ok: false; error: string };

type AdminStats = {
  sessions:    StatSlice<{ today: number; last7d: number; last30d: number }>;
  agents:      StatSlice<{ live: number; total: number }>;
  jobs:        StatSlice<{ total: number; last24h: number }>;
  usdc:        StatSlice<{ settledCents: number; reapFeeCents: number }>;
  users:       StatSlice<{ total: number; new7d: number }>;
  daily:       StatSlice<Array<{ day: string; sessions: number; jobs: number; usdcCents: number }>>;
  topAgents:   StatSlice<Array<{ id: number; name: string; jobs_completed: number; avg_rating: number }>>;
  topCreators: StatSlice<Array<{ user_id: number; display_name: string; lifetime_earned_usdc: string }>>;
  recentJobs:  StatSlice<Array<{ id: number; agent_name: string; price_cents: number; status: string; created_at: string }>>;
};
```

### Queries

All 9 slices run concurrently via `Promise.allSettled`. Each is wrapped so a single failure produces `{ ok: false, error }` for that slice only — the rest continue to render.

1. **sessions** — 3 × `SELECT COUNT(DISTINCT session_id) FROM daily_sessions WHERE day >= …` for today / 7d / 30d.
2. **agents** — `SELECT COUNT(*) FILTER (WHERE is_live), COUNT(*) FROM agents`.
3. **jobs** — `SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') FROM jobs`.
4. **usdc** — `SELECT SUM(price_cents) FILTER (WHERE status='completed'), SUM(reap_fee_cents) FROM jobs`.
5. **users** — `SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') FROM users`.
6. **daily** — CTE joining `generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day')` with per-day aggregates from `daily_sessions` (COUNT DISTINCT session_id) and `jobs` (COUNT, SUM price_cents). Zero-days render as 0 instead of being skipped.
7. **topAgents** — `SELECT id, name, jobs_completed, avg_rating FROM agents ORDER BY jobs_completed DESC LIMIT 10`.
8. **topCreators** — `SELECT b.user_id, u.display_name, b.lifetime_earned AS lifetime_earned_usdc FROM balances b JOIN users u ON u.id = b.user_id ORDER BY b.lifetime_earned DESC LIMIT 10`. `lifetime_earned` is stored as a USDC numeric/string (not cents); display formatting is a UI concern. Typed as `string` in the return shape to preserve precision across the wire.
9. **recentJobs** — `SELECT j.id, a.name AS agent_name, j.price_cents, j.status, j.created_at FROM jobs j JOIN agents a ON a.id = j.agent_id ORDER BY j.created_at DESC LIMIT 20`.

All cent totals stay as integers end-to-end. Dollar formatting is a UI concern.

## UI

Single page, top-down:

1. **Header strip** — "Admin · OpenReap" title, last-refresh timestamp (server-render time), manual reload link.
2. **Stat cards — row 1 (3 cards):** Unique Sessions (today / 7d / 30d mini-bar), Live Agents (`total` subtitle), x402 Calls (`last 24h` subtitle).
3. **Stat cards — row 2 (3 cards):** USDC Settled, Reap Fees, Users (`new 7d` subtitle).
4. **Charts — 30-day strip (3 charts):** Sessions/day (line), Jobs/day (line), USDC/day (bar). Side-by-side on desktop, stacked on mobile.
5. **Tables — two column:** Top Agents (left), Top Creators (right). Plain HTML tables styled with Tailwind — Tremor's DataTable is skipped to keep the bundle small.
6. **Recent Jobs — full-width table:** 20 rows, columns: agent, price (USDC), status pill, relative time.

### Components & styling

- **Chart library:** Recharts 3.x. Newly installed dependency. (Tremor was considered during design but its current release requires React 18 and Tailwind v3; this repo is React 19 + Tailwind v4.) Charts live inside hand-built `AdminCard` wrappers so styling uses existing design tokens (`bg-surface`, `border-cream/10`, `Space Grotesk` headings, terracotta/cream palette) directly, with no third-party theme to override.
- **Empty states:** any slice with zero data shows `—` in muted colour. No "No data yet." placeholder boxes — the dashboard stays visually consistent from day one.

## Error Handling

- **Per-slice errors:** `stats.ts` wraps each of the 9 slices in its own try/catch. A single failing query returns `{ ok: false, error }` for that slice only; the rest render normally. The corresponding card, chart, or table shows a `⚠ unavailable` placeholder.
- **Page-level banner:** if **any** slice failed, a small red banner renders at the top of the page. Visible only to admins.
- **Gate failure:** non-admin requests to `/admin` call `notFound()` and render the standard 404. No stack traces, no special error page, no hint that the route exists.
- **Proxy / session insert failure:** logged to `console.error` and swallowed. A broken analytics insert must never block a page render.

## Manual Test Plan

No automated tests are added — the repo has no test framework configured.

- `pnpm dev`; log in as an `ADMIN_EMAILS` user; open `/admin`; verify all cards, charts, tables render.
- Log in as a non-admin user; open `/admin`; verify 404.
- Log out; open `/admin`; verify 404.
- Clear cookies; visit any page; verify `reap_sid` is set and exactly one row appears in `daily_sessions`.
- Refresh the same page the same day; verify no new row is inserted.
- Temporarily break `DATABASE_URL`; open `/admin`; verify the page renders with per-card error placeholders and a top banner.

## Shipping Scope

**In scope:**

- `/admin` route, Server Component, env-var gate in `src/proxy.ts`
- `daily_sessions` table + `scripts/migrate-v3.mjs`
- `recordDailySession()` and cookie handling in the proxy
- `src/lib/admin/stats.ts` with 9 query slices
- 6 stat cards, 3 charts, 3 tables
- Recharts installed, composed inside Tailwind card components
- `ADMIN_EMAILS` added to `.env.example`

**Explicitly out of scope:**

- Real-time updates, polling, WebSockets
- Date-range controls
- Per-agent or per-user drilldowns
- Page-view-level analytics
- CSV / JSON export
- Admin RBAC beyond env-var allowlist
- Automated tests
