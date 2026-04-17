import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  sendPayout,
  treasuryAddress,
  treasuryConfigured,
} from "@/lib/payouts";

const MIN_WITHDRAWAL_USDC = 1;

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withdrawals = await sql`
    SELECT id, amount_usdc, destination, status, tx_hash, created_at, completed_at
    FROM withdrawals
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({
    withdrawals,
    treasury_configured: treasuryConfigured(),
    treasury_address: treasuryAddress(),
    network: "base-sepolia",
  });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount_usdc?: number; destination?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amountUsdc = typeof body.amount_usdc === "number" ? body.amount_usdc : NaN;
  if (!Number.isFinite(amountUsdc) || amountUsdc < MIN_WITHDRAWAL_USDC) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ${MIN_WITHDRAWAL_USDC} USDC` },
      { status: 400 }
    );
  }

  const destination = (body.destination || user.wallet_address || "").trim();
  if (!destination) {
    return NextResponse.json(
      { error: "Provide a destination wallet or link one to your account" },
      { status: 400 }
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(destination)) {
    return NextResponse.json(
      { error: "destination must be a 0x-prefixed Ethereum address" },
      { status: 400 }
    );
  }

  const balanceRows = await sql`
    SELECT available_usdc FROM balances WHERE user_id = ${user.id}
  `;
  const available =
    balanceRows.length > 0 ? Number(balanceRows[0].available_usdc) : 0;

  if (available < amountUsdc) {
    return NextResponse.json(
      {
        error: "Insufficient balance",
        available_usdc: available,
        requested_usdc: amountUsdc,
      },
      { status: 400 }
    );
  }

  // Reserve the funds: move available -> pending. If the broadcast succeeds
  // we clear pending; if it fails we roll back to available.
  await sql`
    UPDATE balances
    SET available_usdc = available_usdc - ${amountUsdc},
        pending_usdc = pending_usdc + ${amountUsdc},
        updated_at = now()
    WHERE user_id = ${user.id}
  `;

  const insertRows = await sql`
    INSERT INTO withdrawals (user_id, amount_usdc, destination, status)
    VALUES (${user.id}, ${amountUsdc}, ${destination}, 'pending')
    RETURNING id, amount_usdc, destination, status, created_at
  `;
  const row = insertRows[0] as {
    id: string;
    amount_usdc: string;
    destination: string;
    status: string;
    created_at: string;
  };

  // Attempt the real on-chain transfer (Sepolia ETH valued at USD amount).
  const result = await sendPayout(destination, amountUsdc);

  if (!result.ok && result.reason === "treasury_not_configured") {
    // Pending row stays for manual processing; funds remain in pending.
    const updated = await sql`
      UPDATE withdrawals
      SET status = 'pending_manual_review'
      WHERE id = ${row.id}
      RETURNING id, amount_usdc, destination, status, tx_hash, created_at, completed_at
    `;
    return NextResponse.json(
      {
        withdrawal: updated[0],
        message:
          "Withdrawal queued — operator needs to fund REAP_TREASURY_PRIVATE_KEY before it can broadcast.",
        reason: result.reason,
      },
      { status: 202 }
    );
  }

  if (!result.ok) {
    // Roll back the reservation so the user isn't stuck.
    await sql`
      UPDATE balances
      SET available_usdc = available_usdc + ${amountUsdc},
          pending_usdc = pending_usdc - ${amountUsdc},
          updated_at = now()
      WHERE user_id = ${user.id}
    `;
    const failed = await sql`
      UPDATE withdrawals
      SET status = 'failed'
      WHERE id = ${row.id}
      RETURNING id, amount_usdc, destination, status, tx_hash, created_at, completed_at
    `;
    const httpStatus = result.reason === "treasury_underfunded" ? 409 : 502;
    return NextResponse.json(
      {
        withdrawal: failed[0],
        error: result.message,
        reason: result.reason,
        treasury_balance_usd: result.treasuryBalanceUsd,
        requested_usd: result.requestedUsd,
        treasury_address: treasuryAddress(),
      },
      { status: httpStatus }
    );
  }

  // Success: finalize. Pending -> debited entirely; tx hash stored.
  await sql`
    UPDATE balances
    SET pending_usdc = pending_usdc - ${amountUsdc},
        updated_at = now()
    WHERE user_id = ${user.id}
  `;
  const completed = await sql`
    UPDATE withdrawals
    SET status = 'completed',
        tx_hash = ${result.txHash},
        completed_at = now()
    WHERE id = ${row.id}
    RETURNING id, amount_usdc, destination, status, tx_hash, created_at, completed_at
  `;

  return NextResponse.json({
    withdrawal: completed[0],
    message: "Withdrawal settled on Base Sepolia",
    amount_eth: result.amountEth,
    eth_price_usd: result.ethPriceUsd,
  });
}
