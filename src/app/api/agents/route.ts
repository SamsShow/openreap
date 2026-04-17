import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agents = await sql`
    SELECT * FROM agents WHERE owner_id = ${user.id} ORDER BY created_at DESC
  `;

  return NextResponse.json({ agents });
}
