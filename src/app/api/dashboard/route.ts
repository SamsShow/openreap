import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  const [
    todayEarningsResult,
    jobsCompletedResult,
    reputationResult,
    totalEarnedResult,
    agents,
    recentJobs,
    agentEarnings,
  ] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(p.amount_cents), 0) AS total
      FROM payouts p
      WHERE p.user_id = ${userId} AND p.created_at >= CURRENT_DATE
    `,
    sql`
      SELECT COUNT(*) AS count
      FROM jobs j
      JOIN agents a ON j.agent_id = a.id
      WHERE a.owner_id = ${userId} AND j.created_at >= now() - interval '24 hours'
    `,
    sql`
      SELECT COALESCE(AVG(reputation_score), 0) AS avg_score
      FROM agents
      WHERE owner_id = ${userId} AND is_live = true
    `,
    sql`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM payouts
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT id, name, slug, jobs_completed, is_live
      FROM agents
      WHERE owner_id = ${userId} AND is_live = true
    `,
    sql`
      SELECT j.id, j.input_payload, j.status, j.price_cents, j.created_at, a.name AS agent_name
      FROM jobs j
      JOIN agents a ON j.agent_id = a.id
      WHERE a.owner_id = ${userId}
      ORDER BY j.created_at DESC
      LIMIT 5
    `,
    sql`
      SELECT a.id AS agent_id, COALESCE(SUM(p.amount_cents), 0) AS today_earnings
      FROM agents a
      LEFT JOIN jobs j ON j.agent_id = a.id
      LEFT JOIN payouts p ON p.job_id = j.id AND p.created_at >= CURRENT_DATE
      WHERE a.owner_id = ${userId} AND a.is_live = true
      GROUP BY a.id
    `,
  ]);

  const agentEarningsMap: Record<string, number> = {};
  for (const row of agentEarnings) {
    agentEarningsMap[row.agent_id] = Number(row.today_earnings);
  }

  const agentsWithEarnings = agents.map((agent) => ({
    ...agent,
    today_earnings: agentEarningsMap[agent.id] ?? 0,
  }));

  return NextResponse.json({
    user: { display_name: user.display_name },
    stats: {
      todayEarnings: Number(todayEarningsResult[0].total),
      jobsCompleted: Number(jobsCompletedResult[0].count),
      reputation: Number(reputationResult[0].avg_score),
      totalEarned: Number(totalEarnedResult[0].total),
    },
    agents: agentsWithEarnings,
    recentJobs,
  });
}
