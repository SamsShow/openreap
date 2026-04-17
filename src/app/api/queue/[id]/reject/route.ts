import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { reason } = body;

  const rows = await sql`
    SELECT j.id
    FROM jobs j
    JOIN agents a ON j.agent_id = a.id
    WHERE j.id = ${id} AND a.owner_id = ${user.id} AND j.status = 'escalated'
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await sql`
    UPDATE jobs SET status = 'rejected', output_payload = jsonb_build_object('reason', ${reason || 'Rejected by owner'})
    WHERE id = ${id}
  `;

  return NextResponse.json({ success: true });
}
