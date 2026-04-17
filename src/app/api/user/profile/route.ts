import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}

export async function PUT(req: NextRequest) {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { displayName, professionalTitle, bio } = await req.json();

  const [updated] = await sql`
    UPDATE users
    SET display_name = ${displayName ?? user.display_name},
        professional_title = ${professionalTitle ?? user.professional_title},
        bio = ${bio ?? user.bio},
        updated_at = now()
    WHERE id = ${user.id}
    RETURNING id, email, display_name, professional_title, bio, avatar_url, wallet_address, plan
  `;

  return NextResponse.json({ user: updated });
}
