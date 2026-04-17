import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { sql } from "./db";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "openreap-session-secret-change-in-production"
);

export type User = {
  id: string;
  email: string;
  display_name: string | null;
  professional_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  plan: string;
};

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(
  token: string
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { sub: string };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload?.sub) return null;

  const rows = await sql`
    SELECT id, email, display_name, professional_title, bio, avatar_url, wallet_address, plan
    FROM users
    WHERE id = ${payload.sub}
  `;

  return (rows[0] as User) ?? null;
}
