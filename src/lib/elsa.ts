/**
 * x402 payment helpers for OpenReap agents (Base Sepolia testnet).
 *
 * Inbound payment flow (user hires an agent):
 *   1. Agent endpoint returns HTTP 402 with the requirements from
 *      getPaymentDetails(). Client signs an EIP-3009 transferWithAuthorization
 *      for the USDC on Base Sepolia and retries with `x-payment` header
 *      (base64-encoded JSON payload, x402 v1 spec).
 *   2. Server calls verifyPayment() which forwards the header + requirements
 *      to the x402.org facilitator's /settle endpoint. Facilitator submits the
 *      authorization on Base Sepolia and returns the transaction hash.
 *
 * Outbound payment flow (our agent pays Elsa on mainnet) lives in
 * src/lib/elsa-client.ts — that side runs in the browser with the user's
 * connected wallet so no server-side private key is ever needed.
 */

import {
  REAP_TREASURY,
  USDC_BASE_SEPOLIA,
  X402_FACILITATOR_URL,
} from "./chains";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://openreap.vercel.app";

// ---------------------------------------------------------------------------
// Types — x402 v1 spec
// ---------------------------------------------------------------------------

export interface PaymentRequirements {
  scheme: "exact";
  network: "base-sepolia" | "base";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}

export interface PaymentDetailsEnvelope {
  x402Version: 1;
  accepts: PaymentRequirements[];
  error?: string;
}

export interface VerifyPaymentResult {
  ok: boolean;
  tx_hash?: string;
  payer?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toMicroUsdc(priceUsdc: number): string {
  return String(Math.round(priceUsdc * 1e6));
}

function buildRequirements(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: toMicroUsdc(priceUsdc),
    resource: `${API_URL}/api/agents/${agentSlug}/run`,
    description: `${agentName} — ${priceUsdc} USDC per request`,
    mimeType: "application/json",
    payTo: REAP_TREASURY,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE_SEPOLIA,
    extra: { name: "USDC", version: "2" },
  };
}

// ---------------------------------------------------------------------------
// Exported — inbound 402 response shape
// ---------------------------------------------------------------------------

/**
 * Build the full HTTP 402 body per x402 v1.
 */
export function getPaymentDetails(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentDetailsEnvelope {
  return {
    x402Version: 1,
    accepts: [buildRequirements(agentName, agentSlug, priceUsdc)],
  };
}

/** Pre-built payment details for the in-house Base Auto-Trader ($0.10). */
export function getAutoTraderPaymentDetails(): PaymentDetailsEnvelope {
  return getPaymentDetails("Base Auto-Trader", "auto-trader", 0.1);
}

// ---------------------------------------------------------------------------
// Exported — payment verification via x402.org facilitator
// ---------------------------------------------------------------------------

interface FacilitatorSettleResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  error?: string;
}

/**
 * Verify and settle an x-payment header.
 *
 * Parses the base64-encoded x402 payload, forwards it to the x402.org
 * facilitator's /settle endpoint, and returns the on-chain tx hash.
 *
 * @param paymentHeader     Raw value of the `x-payment` request header.
 * @param requirements      The PaymentRequirements the 402 response advertised.
 */
export async function verifyPayment(
  paymentHeader: string | null | undefined,
  requirements: PaymentRequirements
): Promise<VerifyPaymentResult> {
  if (!paymentHeader) {
    return { ok: false, reason: "Missing x-payment header" };
  }

  let decoded: Record<string, unknown>;
  try {
    const jsonStr = Buffer.from(paymentHeader, "base64").toString("utf-8");
    decoded = JSON.parse(jsonStr);
  } catch {
    return {
      ok: false,
      reason: "x-payment header is not valid base64 JSON",
    };
  }

  // Forward to the facilitator for on-chain settlement.
  let res: Response;
  try {
    res = await fetch(`${X402_FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: decoded,
        paymentRequirements: requirements,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: `Facilitator unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  let body: FacilitatorSettleResponse;
  try {
    body = (await res.json()) as FacilitatorSettleResponse;
  } catch {
    return {
      ok: false,
      reason: `Facilitator returned non-JSON (HTTP ${res.status})`,
    };
  }

  if (!res.ok || !body.success || !body.transaction) {
    return {
      ok: false,
      reason:
        body.errorReason ||
        body.error ||
        `Facilitator rejected payment (HTTP ${res.status})`,
    };
  }

  return {
    ok: true,
    tx_hash: body.transaction,
    payer: body.payer,
  };
}

/**
 * Helper used by endpoints: given an agent's price and identity, produces both
 * the 402 body and a verifier bound to the same requirements.
 */
export function requirementsFor(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentRequirements {
  return buildRequirements(agentName, agentSlug, priceUsdc);
}
