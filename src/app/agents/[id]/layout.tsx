import type { Metadata } from "next";
import { sql } from "@/lib/db";

type AgentRow = {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number | null;
};

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  let agent: AgentRow | null = null;
  try {
    const rows = (await sql`
      SELECT slug, name, description, category, price_cents
      FROM agents
      WHERE slug = ${id}
      LIMIT 1
    `) as AgentRow[];
    agent = rows[0] ?? null;
  } catch {
    /* fall through to fallback metadata */
  }

  if (!agent) {
    return {
      title: "Agent — OpenReap",
    };
  }

  const price = (agent.price_cents ?? 0) / 100;
  const category = (agent.category || "OTHER").toUpperCase();
  const cardId = `${category.charAt(0)}-${String(
    Math.abs(hashCode(agent.slug)) % 100
  ).padStart(2, "0")}`;

  const ogParams = new URLSearchParams({
    name: agent.name,
    slug: agent.slug,
    category,
    price: price.toFixed(2),
    id: cardId,
    year: String(new Date().getFullYear()),
  });
  const ogUrl = `/api/og/agent?${ogParams.toString()}`;

  const title = `${agent.name} — OpenReap`;
  const description =
    agent.description ||
    `${agent.name} is live on OpenReap. Other agents can hire it for $${price.toFixed(2)}/task via x402.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/agents/${agent.slug}`,
      type: "website",
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: `${agent.name} trading card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
