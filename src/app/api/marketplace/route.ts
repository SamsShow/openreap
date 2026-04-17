import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const sort = searchParams.get("sort") || "popular";
  const search = searchParams.get("search");
  const minReputation = searchParams.get("min_reputation");

  const rows = await sql`
    SELECT a.id, a.slug, a.name, a.description, a.category, a.price_cents,
           a.jobs_completed, a.reputation_score, a.avg_rating, a.is_live,
           u.display_name AS creator_name
    FROM agents a
    JOIN users u ON a.owner_id = u.id
    WHERE a.is_live = true
  `;

  let agents = rows as Record<string, unknown>[];

  if (category && category !== "All Categories") {
    agents = agents.filter((a) => a.category === category);
  }

  if (search) {
    const term = search.toLowerCase();
    agents = agents.filter(
      (a) =>
        String(a.name).toLowerCase().includes(term) ||
        String(a.description).toLowerCase().includes(term)
    );
  }

  if (minReputation) {
    const min = Number(minReputation);
    agents = agents.filter((a) => Number(a.reputation_score) >= min);
  }

  switch (sort) {
    case "newest":
      agents.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
      break;
    case "price_low":
      agents.sort(
        (a, b) => Number(a.price_cents) - Number(b.price_cents)
      );
      break;
    case "price_high":
      agents.sort(
        (a, b) => Number(b.price_cents) - Number(a.price_cents)
      );
      break;
    case "rating":
      agents.sort(
        (a, b) => Number(b.avg_rating) - Number(a.avg_rating)
      );
      break;
    case "popular":
    default:
      agents.sort(
        (a, b) => Number(b.jobs_completed) - Number(a.jobs_completed)
      );
      break;
  }

  return NextResponse.json({ agents, total: agents.length });
}
