import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const rows = await sql`
    SELECT a.*, u.display_name AS creator_name
    FROM agents a
    JOIN users u ON a.owner_id = u.id
    WHERE a.slug = ${slug}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({ agent: rows[0] });
}
