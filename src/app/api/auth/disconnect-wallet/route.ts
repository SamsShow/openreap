import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await sql`
    UPDATE users
    SET wallet_address = NULL, updated_at = now()
    WHERE id = ${user.id}
  `;

  return NextResponse.json({ success: true });
}
