/**
 * x402 facilitator client for OpenReap agent hires.
 *
 * Inbound payment flow (user hires an agent):
 *   1. Agent endpoint returns HTTP 402 with the envelope from
 *      getPaymentDetails(). Production advertises only Base mainnet; when
 *      NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK=1, both mainnet and Sepolia are
 *      offered so local dev wallets can pay without real USDC.
 *   2. Client signs an EIP-3009 transferWithAuthorization for the USDC on
 *      whichever network its wallet is on and retries with `x-payment`
 *      (base64-encoded JSON payload, x402 v1 spec).
 *   3. Server calls verifyPayment() which forwards the header + the requirement
 *      matching the payload's network to the configured facilitator's /settle
 *      endpoint. Default facilitator is Elsa (facilitator.heyelsa.build).
 *
 * Outbound payment flow (our agent pays Elsa as a merchant) lives in
 * src/lib/elsa-client.ts.
 */

import {
  ENABLE_SEPOLIA_FALLBACK,
  REAP_TREASURY,
  USDC_BASE_MAINNET,
  USDC_BASE_SEPOLIA,
  X402_FACILITATOR_URL,
} from "./chains";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://openreap.vercel.app";

// ---------------------------------------------------------------------------
// Types — x402 v1 spec
// ---------------------------------------------------------------------------

export type X402Network = "base" | "base-sepolia";

export interface PaymentRequirements {
  scheme: "exact";
  network: X402Network;
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

// EIP-712 domain `name` must match the on-chain USDC contract's
// DOMAIN_SEPARATOR or transferWithAuthorization fails signature verification.
// Values are NOT interchangeable across deployments:
//   Base mainnet USDC (0x8335…2913) → "USD Coin"
//   Base Sepolia USDC (0x036C…CF7e) → "USDC"
// Confirmed by probing Elsa's own 402 envelope (they ARE the facilitator).
function buildMainnetRequirements(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base",
    maxAmountRequired: toMicroUsdc(priceUsdc),
    resource: `${API_URL}/api/agents/${agentSlug}/run`,
    description: `${agentName} — ${priceUsdc} USDC per request`,
    mimeType: "application/json",
    payTo: REAP_TREASURY,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE_MAINNET,
    extra: { name: "USD Coin", version: "2" },
  };
}

function buildSepoliaRequirements(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: toMicroUsdc(priceUsdc),
    resource: `${API_URL}/api/agents/${agentSlug}/run`,
    description: `${agentName} — ${priceUsdc} USDC per request (Sepolia dev)`,
    mimeType: "application/json",
    payTo: REAP_TREASURY,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE_SEPOLIA,
    extra: { name: "USDC", version: "2" },
  };
}

// ---------------------------------------------------------------------------
// Exported — 402 envelope + requirement selection
// ---------------------------------------------------------------------------

/**
 * Build the full HTTP 402 body per x402 v1. Mainnet is always advertised;
 * Sepolia is appended only when the dev fallback flag is on.
 */
export function getPaymentDetails(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentDetailsEnvelope {
  const accepts: PaymentRequirements[] = [
    buildMainnetRequirements(agentName, agentSlug, priceUsdc),
  ];
  if (ENABLE_SEPOLIA_FALLBACK) {
    accepts.push(buildSepoliaRequirements(agentName, agentSlug, priceUsdc));
  }
  return { x402Version: 1, accepts };
}

/** Pre-built payment details for the in-house Base Auto-Trader ($0.10). */
export function getAutoTraderPaymentDetails(): PaymentDetailsEnvelope {
  return getPaymentDetails("Base Auto-Trader", "auto-trader", 0.1);
}

/**
 * Pick the requirement matching the network the client actually signed.
 * Returns null when the network is unsupported in the current env (e.g. a
 * dev-fallback-off server receiving a Sepolia payload).
 */
export function requirementsForNetwork(
  agentName: string,
  agentSlug: string,
  priceUsdc: number,
  network: string
): PaymentRequirements | null {
  if (network === "base") {
    return buildMainnetRequirements(agentName, agentSlug, priceUsdc);
  }
  if (network === "base-sepolia" && ENABLE_SEPOLIA_FALLBACK) {
    return buildSepoliaRequirements(agentName, agentSlug, priceUsdc);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exported — payment verification via x402 facilitator
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
 * Parses the base64-encoded x402 payload, forwards it to the configured
 * facilitator's /settle endpoint (Elsa by default), and returns the on-chain
 * tx hash.
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
    console.warn(
      `[verifyPayment] facilitator rejected: HTTP ${res.status}, body=${JSON.stringify(body)}, reqAsset=${requirements.asset}, reqNetwork=${requirements.network}, reqExtra=${JSON.stringify(requirements.extra)}, payloadNetwork=${(decoded as { network?: unknown }).network}`
    );
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
