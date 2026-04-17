import { NextRequest, NextResponse } from "next/server";
import { ELSA_X402_BASE_URL } from "@/lib/chains";

/**
 * Transparent proxy to Elsa x402 `/api/get_swap_quote` on Base mainnet.
 *
 * The browser sits in front of this endpoint so CORS isn't an issue, and the
 * server can log/record settlement hashes. The user's wallet signed the
 * x-payment header in the browser — the server forwards it unchanged.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const paymentHeader = request.headers.get("x-payment");

  const upstreamHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (paymentHeader) upstreamHeaders["x-payment"] = paymentHeader;

  let upstream: Response;
  try {
    upstream = await fetch(`${ELSA_X402_BASE_URL}/api/get_swap_quote`, {
      method: "POST",
      headers: upstreamHeaders,
      body,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "elsa_unreachable",
        reason: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  };
  const paymentResponse = upstream.headers.get("x-payment-response");
  if (paymentResponse) {
    responseHeaders["x-payment-response"] = paymentResponse;
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
