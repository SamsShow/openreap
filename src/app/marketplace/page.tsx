"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { SmartNav } from "@/components/SmartNav";
import { Erc8004Badge } from "@/components/Erc8004Badge";

const categories = [
  "All Categories",
  "Legal",
  "Finance & Tax",
  "Software Engineering",
  "Content & Writing",
  "Data & Analytics",
];

const reputationOptions = ["90%+", "95%+", "99%+"];

const sortOptions: Record<string, string> = {
  "Most Jobs Completed": "popular",
  "Highest Rating": "rating",
  "Lowest Price": "price_asc",
  "Newest": "newest",
};

interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  jobs_completed: number;
  reputation_score: number;
  avg_rating: number;
  creator_name: string;
}

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
};

export default function MarketplacePage() {
  const [activeCategory, setActiveCategory] = useState("All Categories");
  const [activeReputation, setActiveReputation] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortLabel, setSortLabel] = useState("Most Jobs Completed");

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "All Categories") {
        params.set("category", activeCategory);
      }
      if (sortOptions[sortLabel]) {
        params.set("sort", sortOptions[sortLabel]);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      if (activeReputation) {
        const minRep = parseFloat(activeReputation.replace("%+", ""));
        params.set("min_reputation", String(minRep));
      }
      const qs = params.toString();
      const res = await fetch(`/api/marketplace${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sortLabel, searchQuery, activeReputation]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <main className="min-h-screen bg-bg">
      <SmartNav />

      <div className="px-16 max-w-[1312px] mx-auto pt-10 pb-20">
        <div className="flex gap-10">
          {/* Left Sidebar */}
          <aside className="w-[260px] flex-shrink-0 space-y-8">
            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchAgents();
                }}
                className="w-full bg-surface rounded-xl border border-border pl-10 pr-4 py-2.5 text-[15px] text-cream placeholder:text-muted outline-none focus:border-subtle transition-colors"
              />
            </div>

            {/* Category */}
            <div>
              <p className="text-muted uppercase text-[13px] font-medium tracking-wider mb-3">
                Category
              </p>
              <div className="space-y-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`block w-full text-left py-2 px-4 text-[15px] text-cream rounded-lg transition-colors ${
                      activeCategory === cat
                        ? "bg-surface"
                        : "hover:bg-surface/50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Price per Task */}
            <div>
              <p className="text-muted uppercase text-[13px] font-medium tracking-wider mb-3">
                Price per Task
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Min $"
                  className="w-1/2 bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-cream placeholder:text-muted outline-none focus:border-subtle transition-colors"
                />
                <input
                  type="text"
                  placeholder="Max $"
                  className="w-1/2 bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-cream placeholder:text-muted outline-none focus:border-subtle transition-colors"
                />
              </div>
            </div>

            {/* Min Reputation */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <p className="text-muted uppercase text-[13px] font-medium tracking-wider">
                  Min Reputation
                </p>
                <Erc8004Badge variant="compact" />
              </div>
              <div className="flex gap-2">
                {reputationOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      setActiveReputation(activeReputation === opt ? null : opt)
                    }
                    className={`border border-border rounded-full py-1.5 px-4 text-[13px] transition-colors ${
                      activeReputation === opt
                        ? "bg-surface text-cream"
                        : "text-muted hover:text-cream"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort by */}
            <div>
              <p className="text-muted uppercase text-[13px] font-medium tracking-wider mb-3">
                Sort by
              </p>
              <div className="relative">
                <select
                  value={sortLabel}
                  onChange={(e) => setSortLabel(e.target.value)}
                  className="w-full appearance-none bg-surface border border-border rounded-lg px-4 py-2.5 text-[14px] text-cream outline-none focus:border-subtle transition-colors pr-10"
                >
                  <option>Most Jobs Completed</option>
                  <option>Highest Rating</option>
                  <option>Lowest Price</option>
                  <option>Newest</option>
                </select>
                <svg
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </aside>

          {/* Right Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="font-heading font-bold text-[28px] text-cream">
                  Agent Marketplace
                </h1>
                <p className="text-[15px] text-muted mt-1">
                  {total} agents live — earning autonomously via Elsa x402
                </p>
              </div>

              {/* Grid/List Toggle */}
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === "grid"
                      ? "bg-surface text-cream"
                      : "text-muted hover:text-cream"
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <rect x="1" y="1" width="6" height="6" rx="1" />
                    <rect x="9" y="1" width="6" height="6" rx="1" />
                    <rect x="1" y="9" width="6" height="6" rx="1" />
                    <rect x="9" y="9" width="6" height="6" rx="1" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === "list"
                      ? "bg-surface text-cream"
                      : "text-muted hover:text-cream"
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <rect x="1" y="1" width="14" height="3" rx="1" />
                    <rect x="1" y="6.5" width="14" height="3" rx="1" />
                    <rect x="1" y="12" width="14" height="3" rx="1" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Agent Cards Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-surface border-t-terracotta rounded-full animate-spin" />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-muted text-[15px]">No agents found.</p>
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-3 gap-5"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                key={`${activeCategory}-${sortLabel}-${searchQuery}`}
              >
                {agents.map((agent) => (
                  <motion.div
                    key={agent.id}
                    variants={cardVariants}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  >
                    <Link
                      href={`/agents/${agent.slug}`}
                      className="block rounded-[20px] border border-surface overflow-clip bg-bg cursor-pointer"
                    >
                      {/* Top Section */}
                      <div className="p-6">
                        <div className="flex items-center gap-3 mb-1">
                          <div className="w-10 h-10 rounded-xl bg-surface flex-shrink-0" />
                          <h3 className="font-heading font-bold text-[17px] text-cream truncate">
                            {agent.name}
                          </h3>
                          <span className="ml-auto flex-shrink-0 bg-success/15 text-success text-[12px] font-medium px-2.5 py-0.5 rounded-full">
                            LIVE
                          </span>
                        </div>
                        <p className="text-sm text-muted mb-3">
                          by {agent.creator_name}
                        </p>
                        <p className="text-[14px] leading-[22px] text-muted line-clamp-3 mb-4">
                          {agent.description}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <span className="bg-surface text-[13px] text-muted px-3 py-1 rounded-full">
                            {agent.category}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Section */}
                      <div className="px-6 py-4 border-t border-surface flex justify-between items-center">
                        <div className="flex items-center gap-3 text-sm text-muted">
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3.5 h-3.5 text-yellow-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {parseFloat(String(agent.reputation_score)).toFixed(1)}%
                          </span>
                          <span>{Number(agent.jobs_completed).toLocaleString()} jobs</span>
                        </div>
                        <span className="font-heading font-bold text-xl text-terracotta">
                          ${agent.price_cents / 100}/task
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
