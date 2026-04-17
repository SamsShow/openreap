import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  const [jobsResult, earningsResult, reapFeeResult, recentJobs] =
    await Promise.all([
      sql`
        SELECT COUNT(*) AS count
        FROM jobs j
        JOIN agents a ON j.agent_id = a.id
        WHERE a.owner_id = ${userId}
          AND j.created_at >= date_trunc('month', CURRENT_DATE)
      `,
      sql`
        SELECT COALESCE(SUM(amount_cents), 0) AS total
        FROM payouts
        WHERE user_id = ${userId}
          AND created_at >= date_trunc('month', CURRENT_DATE)
      `,
      sql`
        SELECT COALESCE(SUM(reap_fee_cents), 0) AS total
        FROM jobs j
        JOIN agents a ON j.agent_id = a.id
        WHERE a.owner_id = ${userId}
          AND j.created_at >= date_trunc('month', CURRENT_DATE)
          AND j.status = 'completed'
      `,
      sql`
        SELECT j.created_at, j.price_cents, a.model, a.name
        FROM jobs j
        JOIN agents a ON j.agent_id = a.id
        WHERE a.owner_id = ${userId}
        ORDER BY j.created_at DESC
        LIMIT 3
      `,
    ]);

  return NextResponse.json({
    jobsThisMonth: Number(jobsResult[0].count),
    earnings: Number(earningsResult[0].total),
    reapFee: Number(reapFeeResult[0].total),
    recentJobs,
  });
}
