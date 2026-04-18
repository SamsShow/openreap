import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  REAP_TREASURY,
  USDC_BASE_MAINNET,
} from "@/lib/chains";

/**
 * Machine-discoverable catalog of Reap x402 agents.
 *
 *   GET /api/agents/catalog
 *
 * Returns a list of first-party Reap agents (is_reap_agent = true) with
 * their x402 pricing, call endpoint, and I/O schema. Intended for
 * autonomous agents that want to discover and pay to use Reap tools
 * without a human in the loop.
 *
 * Response shape is tool-friendly: every agent entry includes the exact
 * POST resource, the x402 payment hints (scheme, network, asset, payTo),
 * and the parsed input/output schemas from parsed_skill.
 */
export async function GET() {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || "https://openreap.vercel.app";

  const rows = (await sql`
    SELECT slug, name, description, category, price_cents, parsed_skill,
           jobs_completed, reputation_score, avg_rating
    FROM agents
    WHERE is_live = true AND is_reap_agent = true AND status = 'live'
    ORDER BY jobs_completed DESC
  `) as Array<{
    slug: string;
    name: string;
    description: string;
    category: string;
    price_cents: number;
    parsed_skill: {
      service?: { description?: string; accepts?: string[] };
      output_schema?: Record<string, unknown>;
    } | null;
    jobs_completed: number;
    reputation_score: string;
    avg_rating: string;
  }>;

  const agents = rows.map((row) => {
    const priceUsdc = Number(row.price_cents) / 100;
    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      price_usdc: priceUsdc,
      resource: `${apiBase}/api/agents/${row.slug}/run`,
      payment: {
        scheme: "exact" as const,
        network: "base" as const,
        asset: USDC_BASE_MAINNET,
        payTo: REAP_TREASURY,
        description: `${row.name} — ${priceUsdc} USDC per request`,
      },
      input_schema: {
        input: "string — the prompt body to send to the agent",
      },
      output_schema: row.parsed_skill?.output_schema ?? null,
      accepts: row.parsed_skill?.service?.accepts ?? null,
      stats: {
        jobs_completed: Number(row.jobs_completed),
        reputation_score: Number(row.reputation_score),
        avg_rating: Number(row.avg_rating),
      },
      is_reap_agent: true as const,
    };
  });

  return NextResponse.json({
    x402Version: 1,
    how_to_call:
      "POST the resource URL with `{ input: '...' }` and no headers to receive HTTP 402 + payment requirements. Sign an EIP-3009 TransferWithAuthorization against the listed asset, then retry with `x-payment` header (base64 JSON). Server settles via Elsa's x402 facilitator and returns the agent output.",
    total: agents.length,
    agents,
  });
}
