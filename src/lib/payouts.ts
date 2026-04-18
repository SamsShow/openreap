/**
 * Server-side treasury signer for outbound payouts on Base mainnet.
 *
 * Earnings accrue as USD value in the `balances` table. When a creator
 * withdraws, we send the equivalent amount in **Base mainnet USDC** via an
 * ERC-20 `transfer` from the treasury wallet.
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
import { base } from "viem/chains";
import { BASE_MAINNET_RPC, USDC_BASE_MAINNET } from "./chains";

const GAS_RESERVE_WEI = BigInt(150_000_000_000_000); // ~0.00015 ETH — plenty for ERC-20 transfer gas on Base

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface PayoutSuccess {
  ok: true;
  txHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amountUsd: number;
}

export interface PayoutFailure {
  ok: false;
  /** Stable machine-readable reason — safe to persist to the DB. */
  reason:
    | "treasury_not_configured"
    | "treasury_usdc_underfunded"
    | "treasury_gas_underfunded"
    | "invalid_destination"
    | "rpc_failure"
    | "tx_reverted"
    | "unknown";
  message: string;
  /** For treasury_usdc_underfunded: USDC balance (USD) vs requested amount. */
  treasuryUsdcBalanceUsd?: number;
  /** For treasury_gas_underfunded: ETH balance (wei) on the treasury. */
  treasuryEthBalanceWei?: string;
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

function usdToMicroUsdc(amountUsd: number): bigint {
  return BigInt(Math.round(amountUsd * 1_000_000));
}

/**
 * Send mainnet USDC from the Reap treasury to a creator's wallet.
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
    chain: base,
    transport: http(BASE_MAINNET_RPC),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_MAINNET_RPC),
  });

  const amountMicro = usdToMicroUsdc(amountUsd);
  if (amountMicro <= BigInt(0)) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: "Computed USDC amount rounded to zero — USD value too small.",
    };
  }

  // Pre-flight: USDC balance must cover the payout; ETH balance must cover gas.
  try {
    const [usdcBalance, ethBalance] = await Promise.all([
      publicClient.readContract({
        address: USDC_BASE_MAINNET,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    if (usdcBalance < amountMicro) {
      return {
        ok: false,
        reason: "treasury_usdc_underfunded",
        message:
          "The Reap treasury doesn't hold enough USDC on Base mainnet to cover this withdrawal.",
        treasuryUsdcBalanceUsd: Number(usdcBalance) / 1_000_000,
        requestedUsd: amountUsd,
      };
    }

    if (ethBalance < GAS_RESERVE_WEI) {
      return {
        ok: false,
        reason: "treasury_gas_underfunded",
        message:
          "The treasury has USDC but not enough ETH on Base mainnet to pay gas. Top up the treasury with a small ETH float.",
        treasuryEthBalanceWei: ethBalance.toString(),
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
    txHash = await walletClient.writeContract({
      address: USDC_BASE_MAINNET,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, amountMicro],
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const reasonMatch = rawMsg.match(/reason:\s*([^\n.]+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim() : null;
    if (reason && /insufficient funds|exceeds balance/i.test(reason)) {
      return {
        ok: false,
        reason: "treasury_gas_underfunded",
        message: `Treasury transfer reverted while paying gas: ${reason}.`,
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
        message: `USDC transfer reverted on-chain. Hash: ${txHash}`,
      };
    }
  } catch {
    return {
      ok: true,
      txHash,
      from: account.address,
      to: to as `0x${string}`,
      amountUsd,
    };
  }

  return {
    ok: true,
    txHash,
    from: account.address,
    to: to as `0x${string}`,
    amountUsd,
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
