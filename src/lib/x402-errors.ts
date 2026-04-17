/**
 * Structured errors for the x402 payment + Elsa mainnet flow.
 *
 * Pages render these via <ErrorCard />; the `kind` drives the headline + icon,
 * `message` is the human-readable body, `details` holds the raw payload for
 * the collapsible "Details" expander.
 */

export type X402ErrorKind =
  | "insufficient_funds"
  | "user_rejected"
  | "wrong_network"
  | "wallet_not_connected"
  | "wallet_unauthorized"
  | "elsa_unreachable"
  | "elsa_rejected"
  | "facilitator_failed"
  | "agent_error"
  | "invalid_input"
  | "unknown";

export class X402ClientError extends Error {
  kind: X402ErrorKind;
  title: string;
  hint?: string;
  details?: unknown;

  constructor(
    kind: X402ErrorKind,
    title: string,
    message: string,
    opts: { hint?: string; details?: unknown } = {}
  ) {
    super(message);
    this.name = "X402ClientError";
    this.kind = kind;
    this.title = title;
    this.hint = opts.hint;
    this.details = opts.details;
  }
}

/** Classify a raw Elsa/x402 response into an X402ClientError. */
export function classifyElsaError(
  status: number,
  body: unknown
): X402ClientError {
  const asObj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw = typeof asObj?.error === "string" ? asObj.error : null;

  if (raw === "insufficient_funds") {
    const accepts = Array.isArray(asObj?.accepts)
      ? (asObj?.accepts as Array<Record<string, unknown>>)[0]
      : undefined;
    const amount = accepts?.maxAmountRequired as string | undefined;
    const asset = accepts?.asset as string | undefined;
    const network = accepts?.network as string | undefined;

    const priceUsd = amount ? Number(amount) / 1e6 : null;

    return new X402ClientError(
      "insufficient_funds",
      "Not enough USDC in your wallet",
      priceUsd
        ? `This call costs ~$${priceUsd.toFixed(2)} USDC on Base ${
            network === "base" ? "mainnet" : network ?? "mainnet"
          }. Fund your connected wallet and try again.`
        : "The Elsa x402 API says your wallet doesn't have enough USDC to pay for this call.",
      {
        hint:
          network === "base"
            ? "Send a small amount of USDC on Base mainnet to your wallet."
            : undefined,
        details: { status, amount, asset, network, raw: body },
      }
    );
  }

  if (raw === "invalid_exact_evm_payload_authorization_value") {
    return new X402ClientError(
      "invalid_input",
      "Payment authorization was malformed",
      "The signed authorization didn't match the payment requirements. This is a bug in the x402 signer — please retry once.",
      { details: body }
    );
  }

  if (status === 402) {
    return new X402ClientError(
      "elsa_rejected",
      "Elsa refused the payment",
      raw ? `Elsa returned: ${raw}.` : "Elsa returned HTTP 402 after settlement.",
      { details: body }
    );
  }

  return new X402ClientError(
    "elsa_rejected",
    "Elsa quote request failed",
    `HTTP ${status}${raw ? ` — ${raw}` : ""}`,
    { details: body }
  );
}

/** Turn a thrown error from wagmi/viem signing into a friendly X402ClientError. */
export function classifySignError(err: unknown): X402ClientError {
  // Pass-through: if the caller already threw a classified error (e.g. the
  // pre-flight balance check in signX402Payment), don't downgrade it to a
  // generic "Wallet error".
  if (err instanceof X402ClientError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  const lower = msg.toLowerCase();

  // EIP-1193 code 4100 — "The requested method and/or account has not been
  // authorized by the user." Fires when the wallet connection went stale
  // mid-flow (often after a chain switch) or the user revoked the dapp's
  // permission in the wallet.
  if (
    lower.includes("not been authorized by the user") ||
    lower.includes("has not been authorized") ||
    lower.includes("unauthorized")
  ) {
    return new X402ClientError(
      "wallet_unauthorized",
      "Wallet permission lost",
      "Your wallet no longer has permission to sign for this site. Disconnect and reconnect, then try again.",
      {
        hint:
          "This often happens after a network switch. Click the wallet button to reconnect, then retry.",
        details: msg,
      }
    );
  }

  if (
    name === "UserRejectedRequestError" ||
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return new X402ClientError(
      "user_rejected",
      "Signature cancelled",
      "You declined the wallet prompt. Try again when you're ready.",
      { details: msg }
    );
  }

  if (name === "SwitchChainError" || lower.includes("switch chain")) {
    return new X402ClientError(
      "wrong_network",
      "Couldn't switch network",
      "Your wallet refused to switch to the required chain. Switch manually and retry.",
      { details: msg }
    );
  }

  return new X402ClientError("unknown", "Wallet error", msg, { details: err });
}
