/**
 * Browser helper to call Elsa's x402-paid APIs on Base mainnet using the
 * user's connected wallet.
 *
 * Goes through a server proxy (`/api/elsa/*`) so that:
 *   a) the browser isn't blocked by CORS on x402-api.heyelsa.ai, and
 *   b) the server sees the same 402 envelope Elsa returns, making it trivial
 *      to later record the settlement tx hash for auditing.
 *
 * The user's wallet signs the x402 payment authorization directly — no
 * server-side private key is ever used.
 */

import type { Config } from "wagmi";
import { signX402Payment, type PaymentRequirements } from "./x402-client";
import {
  X402ClientError,
  classifyElsaError,
  classifySignError,
} from "./x402-errors";

export interface ElsaSwapQuoteInput {
  from_chain: string;
  from_token: string;
  from_amount: string | number;
  to_chain: string;
  to_token: string;
  wallet_address: string;
  slippage: number;
}

export interface ElsaSwapQuote {
  estimated_output?: number;
  price_impact?: number;
  gas_estimate?: number;
  route?: string | { path: string[] };
  // Elsa's exact response shape varies; we pass through whatever comes back.
  [key: string]: unknown;
}

export interface ElsaQuoteResult {
  quote: ElsaSwapQuote;
  /** base64 x-payment-response header from Elsa's facilitator. */
  paymentResponse: string | null;
  /** Decoded transaction hash from paymentResponse, if parseable. */
  txHash: string | null;
  /** The requirements we actually paid against. */
  requirements: PaymentRequirements;
}

function decodeTxHash(paymentResponseHeader: string | null): string | null {
  if (!paymentResponseHeader) return null;
  try {
    const decoded = JSON.parse(atob(paymentResponseHeader)) as {
      transaction?: string;
    };
    return decoded.transaction ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a swap quote from Elsa, paying the $0.01 x402 fee with the user's
 * mainnet wallet. Performs the 402 round-trip automatically.
 */
export async function getElsaMainnetQuote(
  wagmiConfig: Config,
  payer: `0x${string}`,
  input: ElsaSwapQuoteInput
): Promise<ElsaQuoteResult> {
  // Attempt 1 — no payment, expect 402
  let probe: Response;
  try {
    probe = await fetch("/api/elsa/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw new X402ClientError(
      "elsa_unreachable",
      "Can't reach Elsa",
      "Network request to the Elsa proxy failed. Check your connection and try again.",
      { details: err instanceof Error ? err.message : err }
    );
  }

  const probeBody = (await probe.json().catch(() => null)) as unknown;

  if (probe.status !== 402) {
    throw classifyElsaError(probe.status, probeBody);
  }

  const envelope = probeBody as {
    x402Version?: number;
    accepts?: PaymentRequirements[];
    error?: string;
  } | null;

  const requirements = envelope?.accepts?.[0];
  if (!requirements) {
    throw new X402ClientError(
      "elsa_rejected",
      "Elsa 402 response was incomplete",
      "We got an HTTP 402 from Elsa but no payment requirements. Retry in a moment.",
      { details: envelope }
    );
  }

  if (requirements.network !== "base") {
    throw new X402ClientError(
      "wrong_network",
      "Elsa wants mainnet",
      `Elsa requires network "base" (mainnet) but sent "${requirements.network}". Fund your wallet with a small amount of mainnet USDC.`,
      { details: requirements }
    );
  }

  // Sign the mainnet payment with the user's wallet.
  let signed;
  try {
    signed = await signX402Payment(wagmiConfig, payer, requirements);
  } catch (err) {
    throw classifySignError(err);
  }

  // Attempt 2 — with payment header
  let res: Response;
  try {
    res = await fetch("/api/elsa/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment": signed.header,
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw new X402ClientError(
      "elsa_unreachable",
      "Can't reach Elsa",
      "The settlement request to Elsa failed mid-flight. Try again.",
      { details: err instanceof Error ? err.message : err }
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as unknown;
    throw classifyElsaError(res.status, body);
  }

  const paymentResponse = res.headers.get("x-payment-response");
  const quote = (await res.json()) as ElsaSwapQuote;

  return {
    quote,
    paymentResponse,
    txHash: decodeTxHash(paymentResponse),
    requirements,
  };
}
