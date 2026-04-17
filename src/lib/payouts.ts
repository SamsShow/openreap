/**
 * Server-side treasury signer for outbound payouts on Base Sepolia.
 *
 * Earnings accrue as USD value in the `balances` table. When a creator
 * withdraws, we send the equivalent amount in native **Base Sepolia ETH**
 * (converted at the current ETH/USD spot price) because Sepolia ETH is
 * dramatically easier to faucet than Sepolia USDC.
 *
 * If REAP_TREASURY_PRIVATE_KEY is missing, sendPayout() returns a clear
 * `{ ok: false, reason: "treasury_not_configured" }` so the withdrawal row
 * can be marked "pending_manual_review" instead of crashing.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_RPC } from "./chains";

const FALLBACK_ETH_PRICE_USD = 3000;

export interface PayoutSuccess {
  ok: true;
  txHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amountUsd: number;
  amountEth: number;
  ethPriceUsd: number;
}

export interface PayoutFailure {
  ok: false;
  /** Stable machine-readable reason — safe to persist to the DB. */
  reason:
    | "treasury_not_configured"
    | "treasury_underfunded"
    | "invalid_destination"
    | "rpc_failure"
    | "tx_reverted"
    | "unknown";
  message: string;
  /** For treasury_underfunded: what we have vs. what was asked (in USD). */
  treasuryBalanceUsd?: number;
  requestedUsd?: number;
}

export type PayoutResult = PayoutSuccess | PayoutFailure;

function normalizePrivateKey(raw: string): Hex | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return null;
  return withPrefix as Hex;
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** Get the current ETH/USD spot rate. Falls back to a constant if offline. */
export async function getEthPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coinbase.com/v2/exchange-rates?currency=ETH",
      { cache: "no-store" }
    );
    if (!res.ok) return FALLBACK_ETH_PRICE_USD;
    const data = (await res.json()) as {
      data?: { rates?: { USD?: string } };
    };
    const rate = Number(data.data?.rates?.USD);
    if (Number.isFinite(rate) && rate > 0) return rate;
    return FALLBACK_ETH_PRICE_USD;
  } catch {
    return FALLBACK_ETH_PRICE_USD;
  }
}

/** Convert a USD amount to wei using the given ETH/USD price. */
function usdToWei(usd: number, ethPriceUsd: number): bigint {
  const eth = usd / ethPriceUsd;
  return BigInt(Math.floor(eth * 1e18));
}

/**
 * Send Sepolia ETH from the Reap treasury to a creator's wallet, valued at
 * the given USD amount.
 */
export async function sendPayout(
  to: string,
  amountUsd: number
): Promise<PayoutResult> {
  const rawKey = process.env.REAP_TREASURY_PRIVATE_KEY;
  if (!rawKey) {
    return {
      ok: false,
      reason: "treasury_not_configured",
      message:
        "REAP_TREASURY_PRIVATE_KEY is not set. Withdrawal saved as pending; an operator must execute it manually.",
    };
  }

  const pk = normalizePrivateKey(rawKey);
  if (!pk) {
    return {
      ok: false,
      reason: "treasury_not_configured",
      message:
        "REAP_TREASURY_PRIVATE_KEY is set but malformed (expected 32 hex bytes).",
    };
  }

  if (!isAddress(to)) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: `Destination wallet "${to}" is not a valid 0x-address.`,
    };
  }

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: "Amount must be a positive number of USD.",
    };
  }

  const account = privateKeyToAccount(pk);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(BASE_SEPOLIA_RPC),
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(BASE_SEPOLIA_RPC),
  });

  const ethPriceUsd = await getEthPriceUsd();
  const weiAmount = usdToWei(amountUsd, ethPriceUsd);
  const amountEth = Number(weiAmount) / 1e18;

  if (weiAmount <= BigInt(0)) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: "Computed ETH amount rounded to zero — USD value too small.",
    };
  }

  // Pre-flight: does the treasury hold enough ETH (including a small gas
  // reserve)? Catch the most common failure before spending gas on a
  // doomed transaction.
  try {
    const balance = await publicClient.getBalance({ address: account.address });
    // Reserve ~0.0001 ETH for gas (21k gas * 5 gwei ≈ 1.05e5 gwei = 1.05e14 wei)
    const gasReserve = BigInt(150_000_000_000_000); // 1.5e14 wei ≈ 0.00015 ETH
    if (balance < weiAmount + gasReserve) {
      return {
        ok: false,
        reason: "treasury_underfunded",
        message:
          "The Reap treasury doesn't hold enough Sepolia ETH to cover this withdrawal.",
        treasuryBalanceUsd: (Number(balance) / 1e18) * ethPriceUsd,
        requestedUsd: amountUsd,
      };
    }
  } catch (err) {
    console.warn(
      "[payouts] pre-flight balance read failed:",
      err instanceof Error ? err.message : err
    );
  }

  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.sendTransaction({
      to: to as `0x${string}`,
      value: weiAmount,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const reasonMatch = rawMsg.match(/reason:\s*([^\n.]+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim() : null;
    if (reason && /insufficient funds|exceeds balance/i.test(reason)) {
      return {
        ok: false,
        reason: "treasury_underfunded",
        message: `Treasury transfer reverted: ${reason}.`,
        requestedUsd: amountUsd,
      };
    }
    return {
      ok: false,
      reason: "rpc_failure",
      message: reason
        ? `RPC rejected the transfer: ${reason}.`
        : "RPC rejected the transfer.",
    };
  }

  // Best-effort wait for a single confirmation so we can catch reverts.
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
    if (receipt.status !== "success") {
      return {
        ok: false,
        reason: "tx_reverted",
        message: `Transfer reverted on-chain. Hash: ${txHash}`,
      };
    }
  } catch {
    return {
      ok: true,
      txHash,
      from: account.address,
      to,
      amountUsd,
      amountEth,
      ethPriceUsd,
    };
  }

  return {
    ok: true,
    txHash,
    from: account.address,
    to,
    amountUsd,
    amountEth,
    ethPriceUsd,
  };
}

/** Read-only: is the treasury signer ready to broadcast? */
export function treasuryConfigured(): boolean {
  const raw = process.env.REAP_TREASURY_PRIVATE_KEY;
  return !!(raw && normalizePrivateKey(raw));
}

/** Derive the treasury address from REAP_TREASURY_PRIVATE_KEY, if set. */
export function treasuryAddress(): `0x${string}` | null {
  const raw = process.env.REAP_TREASURY_PRIVATE_KEY;
  if (!raw) return null;
  const pk = normalizePrivateKey(raw);
  if (!pk) return null;
  return privateKeyToAccount(pk).address;
}
