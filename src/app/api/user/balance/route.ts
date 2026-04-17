import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sql`
    SELECT * FROM balances
    WHERE user_id = ${user.id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({
      balance: { available_usdc: 0, pending_usdc: 0, lifetime_earned: 0 },
    });
  }

  return NextResponse.json({ balance: rows[0] });
}
