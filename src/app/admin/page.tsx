import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin/is-admin";
import {
  getAdminStats,
  type StatSlice,
  type AdminStats,
  type DailyRow,
} from "@/lib/admin/stats";
import { SessionsChart, JobsChart, UsdcChart } from "./charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EM_DASH = "—";

function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return EM_DASH;
  const d = cents / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(2)}M`;
  if (d >= 1000) return `$${(d / 1000).toFixed(1)}K`;
  return `$${d.toFixed(2)}`;
}

function formatUsdc(raw: string): string {
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v)) return EM_DASH;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return EM_DASH;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusClasses(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "settled") return "text-success bg-success/10";
  if (s === "failed" || s === "error") return "text-terracotta bg-terracotta/10";
  if (s === "pending" || s === "running") return "text-cream bg-cream/10";
  return "text-muted bg-muted/10";
}

function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface rounded-lg p-5 border border-cream/5 ${className}`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-heading font-bold tracking-[0.08em] uppercase text-muted">
          {title}
        </h3>
        {subtitle ? (
          <span className="text-[11px] text-subtle">{subtitle}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Unavailable({ error }: { error: string }) {
  return (
    <div className="text-xs text-muted flex items-center gap-1.5">
      <span className="text-terracotta">⚠</span>
      <span>unavailable</span>
      <span className="text-subtle truncate max-w-[200px]" title={error}>
        · {error}
      </span>
    </div>
  );
}

function BigStat({ value, foot }: { value: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div>
      <div className="text-3xl font-heading font-bold tracking-tight text-cream">
        {value}
      </div>
      {foot ? <div className="mt-1 text-xs text-muted">{foot}</div> : null}
    </div>
  );
}

function SessionsCard({ slice }: { slice: StatSlice<AdminStats["sessions"] extends StatSlice<infer T> ? T : never> }) {
  return (
    <Card title="Unique Sessions" subtitle="today · 7d · 30d">
      {slice.ok ? (
        <div className="flex items-baseline gap-4">
          <div className="text-3xl font-heading font-bold text-cream">
            {formatNumber(slice.data.today)}
          </div>
          <div className="text-sm text-muted">
            · {formatNumber(slice.data.last7d)} · {formatNumber(slice.data.last30d)}
          </div>
        </div>
      ) : (
        <Unavailable error={slice.error} />
      )}
    </Card>
  );
}

function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="bg-terracotta/10 border border-terracotta/30 rounded-lg px-4 py-3 mb-6 text-sm text-cream">
      <span className="font-bold text-terracotta">⚠ {errors.length}</span>{" "}
      stat{errors.length === 1 ? "" : "s"} failed to load. Check server logs.
    </div>
  );
}

function TopAgentsTable({
  slice,
}: {
  slice: AdminStats["topAgents"];
}) {
  return (
    <Card title="Top Agents" subtitle="by jobs completed">
      {slice.ok ? (
        slice.data.length === 0 ? (
          <div className="text-muted text-sm py-6 text-center">{EM_DASH}</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {slice.data.map((a, i) => (
                <tr key={a.id} className="border-t border-cream/5 first:border-t-0">
                  <td className="py-2 pr-2 text-subtle tabular-nums w-6">{i + 1}</td>
                  <td className="py-2 pr-2 text-cream truncate max-w-[200px]">{a.name}</td>
                  <td className="py-2 pr-2 text-right text-cream tabular-nums">
                    {formatNumber(a.jobs_completed)}
                  </td>
                  <td className="py-2 text-right text-muted tabular-nums">
                    ★ {a.avg_rating.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <Unavailable error={slice.error} />
      )}
    </Card>
  );
}

function TopCreatorsTable({ slice }: { slice: AdminStats["topCreators"] }) {
  return (
    <Card title="Top Creators" subtitle="by lifetime earned">
      {slice.ok ? (
        slice.data.length === 0 ? (
          <div className="text-muted text-sm py-6 text-center">{EM_DASH}</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {slice.data.map((c, i) => (
                <tr key={c.user_id} className="border-t border-cream/5 first:border-t-0">
                  <td className="py-2 pr-2 text-subtle tabular-nums w-6">{i + 1}</td>
                  <td className="py-2 pr-2 text-cream truncate max-w-[200px]">
                    {c.display_name ?? <span className="text-muted">unnamed</span>}
                  </td>
                  <td className="py-2 text-right text-cream tabular-nums">
                    {formatUsdc(c.lifetime_earned_usdc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <Unavailable error={slice.error} />
      )}
    </Card>
  );
}

function RecentJobsTable({ slice }: { slice: AdminStats["recentJobs"] }) {
  return (
    <Card title="Recent Jobs" subtitle="last 20">
      {slice.ok ? (
        slice.data.length === 0 ? (
          <div className="text-muted text-sm py-6 text-center">{EM_DASH}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-subtle">
                  <th className="py-2 pr-3 font-normal">Agent</th>
                  <th className="py-2 pr-3 font-normal text-right">Price</th>
                  <th className="py-2 pr-3 font-normal">Status</th>
                  <th className="py-2 font-normal text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {slice.data.map((j) => (
                  <tr key={j.id} className="border-t border-cream/5">
                    <td className="py-2 pr-3 text-cream truncate max-w-[260px]">
                      {j.agent_name}
                    </td>
                    <td className="py-2 pr-3 text-right text-cream tabular-nums">
                      {formatCents(j.price_cents)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${statusClasses(j.status)}`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted tabular-nums">
                      {timeAgo(j.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Unavailable error={slice.error} />
      )}
    </Card>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card title={title} subtitle="last 30 days">
      <div className="h-[180px]">{children}</div>
    </Card>
  );
}

function errorMessages(stats: AdminStats): string[] {
  const errors: string[] = [];
  for (const s of Object.values(stats)) {
    if (!(s as StatSlice<unknown>).ok) {
      errors.push((s as { error: string }).error);
    }
  }
  return errors;
}

export default async function AdminPage() {
  const session = await getSession();
  if (!isAdminEmail(session?.email)) {
    notFound();
  }

  const stats = await getAdminStats();
  const errors = errorMessages(stats);
  const now = new Date();
  const dailyForCharts: DailyRow[] = stats.daily.ok ? stats.daily.data : [];

  return (
    <div className="min-h-screen bg-bg text-cream font-body">
      <header className="border-b border-cream/5 px-8 py-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-heading font-bold tracking-tight">
            Admin <span className="text-muted">·</span> OpenReap
          </h1>
          <span className="text-xs text-muted">
            {now.toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            })}{" "}
            UTC
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin" className="text-terracotta hover:underline">
            reload
          </Link>
          <Link href="/dashboard" className="text-muted hover:text-cream">
            ← back
          </Link>
        </div>
      </header>

      <main className="px-8 py-8 max-w-7xl mx-auto">
        <ErrorBanner errors={errors} />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <SessionsCard slice={stats.sessions} />

          <Card title="Live Agents">
            {stats.agents.ok ? (
              <BigStat
                value={formatNumber(stats.agents.data.live)}
                foot={`${formatNumber(stats.agents.data.total)} total`}
              />
            ) : (
              <Unavailable error={stats.agents.error} />
            )}
          </Card>

          <Card title="x402 Calls">
            {stats.jobs.ok ? (
              <BigStat
                value={formatNumber(stats.jobs.data.total)}
                foot={`${formatNumber(stats.jobs.data.last24h)} in last 24h`}
              />
            ) : (
              <Unavailable error={stats.jobs.error} />
            )}
          </Card>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Card title="USDC Settled">
            {stats.usdc.ok ? (
              <BigStat value={formatCents(stats.usdc.data.settledCents)} />
            ) : (
              <Unavailable error={stats.usdc.error} />
            )}
          </Card>

          <Card title="Reap Fees">
            {stats.usdc.ok ? (
              <BigStat value={formatCents(stats.usdc.data.reapFeeCents)} />
            ) : (
              <Unavailable error={stats.usdc.error} />
            )}
          </Card>

          <Card title="Users">
            {stats.users.ok ? (
              <BigStat
                value={formatNumber(stats.users.data.total)}
                foot={`${formatNumber(stats.users.data.new7d)} new in 7d`}
              />
            ) : (
              <Unavailable error={stats.users.error} />
            )}
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <ChartCard title="Sessions / day">
            {stats.daily.ok ? (
              <SessionsChart data={dailyForCharts} />
            ) : (
              <Unavailable error={stats.daily.error} />
            )}
          </ChartCard>
          <ChartCard title="Jobs / day">
            {stats.daily.ok ? (
              <JobsChart data={dailyForCharts} />
            ) : (
              <Unavailable error={stats.daily.error} />
            )}
          </ChartCard>
          <ChartCard title="USDC settled / day">
            {stats.daily.ok ? (
              <UsdcChart data={dailyForCharts} />
            ) : (
              <Unavailable error={stats.daily.error} />
            )}
          </ChartCard>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <TopAgentsTable slice={stats.topAgents} />
          <TopCreatorsTable slice={stats.topCreators} />
        </section>

        <section className="mb-12">
          <RecentJobsTable slice={stats.recentJobs} />
        </section>
      </main>
    </div>
  );
}
