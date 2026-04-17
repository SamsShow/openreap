import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const rows = await sql`
    SELECT j.id, j.price_cents
    FROM jobs j
    JOIN agents a ON j.agent_id = a.id
    WHERE j.id = ${id} AND a.owner_id = ${user.id} AND j.status = 'escalated'
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check wallet is connected before creating payout
  const walletRows = await sql`
    SELECT wallet_address FROM users WHERE id = ${user.id}
  `;
  const walletAddress = walletRows[0]?.wallet_address;

  if (!walletAddress) {
    return NextResponse.json(
      { error: "Connect a wallet in your profile settings to receive payouts" },
      { status: 400 }
    );
  }

  const priceCents = Number(rows[0].price_cents);
  const payoutCents = Math.round(priceCents * 0.75);
  const usdcAmount = payoutCents / 100;

  await sql`
    UPDATE jobs SET status = 'completed', completed_at = now() WHERE id = ${id}
  `;

  await sql`
    INSERT INTO payouts (user_id, job_id, amount_cents, usdc_amount, wallet_address, status)
    VALUES (${user.id}, ${id}, ${payoutCents}, ${usdcAmount}, ${walletAddress}, 'pending')
  `;

  return NextResponse.json({ success: true });
}
