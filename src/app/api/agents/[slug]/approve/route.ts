import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const rows = await sql`
    UPDATE agents
    SET status = 'live', is_live = true, updated_at = now()
    WHERE slug = ${slug} AND owner_id = ${user.id} AND status = 'draft'
    RETURNING *
  `;

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Agent not found or not in draft status" },
      { status: 404 }
    );
  }

  return NextResponse.json({ agent: rows[0] });
}
