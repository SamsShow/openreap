import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const escalations = await sql`
    SELECT j.id, j.input_payload, j.status, j.price_cents, j.created_at,
           a.name AS agent_name
    FROM jobs j
    JOIN agents a ON j.agent_id = a.id
    WHERE a.owner_id = ${user.id} AND j.status = 'escalated'
    ORDER BY j.created_at DESC
  `;

  return NextResponse.json({ escalations });
}
