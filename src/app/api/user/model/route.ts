import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PUT /api/user/model — set the preferred model for all agents owned by the
 * current user. Matches the "Switch anytime — updates immediately" copy on
 * the Model Settings page.
 */
export async function PUT(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const model = body.model?.trim();
  if (!model) {
    return NextResponse.json(
      { error: "model is required" },
      { status: 400 }
    );
  }
  if (model.length > 200) {
    return NextResponse.json({ error: "model too long" }, { status: 400 });
  }

  const result = await sql`
    UPDATE agents
    SET model = ${model}, updated_at = now()
    WHERE owner_id = ${user.id}
    RETURNING id
  `;

  return NextResponse.json({
    model,
    agents_updated: result.length,
  });
}
