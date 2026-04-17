import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { verifyMessage } from "viem";

export async function POST(req: NextRequest) {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { walletAddress, signature, message } = await req.json();

  if (!walletAddress || !signature || !message) {
    return NextResponse.json(
      { error: "Missing walletAddress, signature, or message" },
      { status: 400 }
    );
  }

  const valid = await verifyMessage({
    address: walletAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  await sql`
    UPDATE users
    SET wallet_address = ${walletAddress}, updated_at = now()
    WHERE id = ${user.id}
  `;

  return NextResponse.json({ success: true, wallet_address: walletAddress });
}
