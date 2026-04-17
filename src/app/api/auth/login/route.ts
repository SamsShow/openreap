import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { signToken } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const [user] = await sql`
    SELECT id, email, password_hash, display_name, wallet_address, plan
    FROM users WHERE email = ${email}
  `;

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const token = await signToken(user.id);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      wallet_address: user.wallet_address,
      plan: user.plan,
    },
  });

  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return response;
}
