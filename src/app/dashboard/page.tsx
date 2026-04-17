"use client";

import { DashNav } from "@/components/DashNav";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const slideUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

interface DashboardData {
  user: { display_name: string | null; email: string };
  stats: {
    todayEarnings: number;
    jobsCompleted: number;
    reputation: number;
    totalEarned: number;
  };
  agents: { name: string; subtitle: string; earnings: string }[];
  recentJobs: {
    id: string;
    input_payload: { text: string };
    status: string;
    price_cents: number;
    created_at: string;
    agent_name: string;
  }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => {
        if (res.status === 401) {
          router.push("/auth");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-bg font-body opacity-0">
        <DashNav />
      </div>
    );
  }

  const { user, stats, agents, recentJobs } = data;
  const firstName = user.display_name
    ? user.display_name.split(" ")[0]
    : user.email.split("@")[0];

  const todayEarningsDisplay = formatCents(stats.todayEarnings);
  const totalEarnedDisplay = formatCents(stats.totalEarned);

  const statCards = [
    {
      label: "TODAY'S EARNINGS",
      value: todayEarningsDisplay,
      sub: "+18.2%",
      subClass: "text-success",
    },
    {
      label: "JOBS COMPLETED",
      value: String(stats.jobsCompleted),
      sub: "last 24h",
      subClass: "text-muted",
    },
    {
      label: "REPUTATION SCORE",
      value: `${stats.reputation}%`,
      sub: "Excellent",
      subClass: "text-success",
    },
    {
      label: "TOTAL EARNED",
      value: totalEarnedDisplay,
      sub: "all time",
      subClass: "text-muted",
    },
  ];

  const jobs = recentJobs.map((job) => ({
    status: job.status.toUpperCase(),
    description: `${job.agent_name} — ${job.input_payload.text}`,
    time: timeAgo(job.created_at),
    price: formatCents(job.price_cents),
  }));

  return (
    <div className="min-h-screen bg-bg font-body">
      <DashNav user={user} />

      {/* Greeting */}
      <motion.div
        className="px-16 py-10 max-w-[1312px] mx-auto"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
      >
        <h1 className="font-heading font-bold text-[40px] leading-[44px] text-cream">
          Good morning, {firstName}
        </h1>
        <p className="text-[17px] text-muted italic font-[family-name:var(--font-instrument-serif)] mt-2">
          Your agents earned {todayEarningsDisplay} while you slept.
        </p>
      </motion.div>

      {/* Stat Cards */}
      <motion.div
        className="grid grid-cols-4 gap-6 px-16 max-w-[1312px] mx-auto"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {statCards.map((card) => (
          <motion.div
            key={card.label}
            className="rounded-[20px] border border-surface p-8"
            variants={fadeUp}
          >
            <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted">
              {card.label}
            </p>
            <div className="flex items-baseline mt-2">
              <span className="font-heading font-bold text-[40px] text-cream">
                {card.value}
              </span>
              <span className={`text-[15px] ${card.subClass} ml-3`}>
                {card.sub}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Two-column section */}
      <div className="flex gap-8 px-16 py-10 max-w-[1312px] mx-auto">
        {/* Left: Active Agents */}
        <motion.div
          className="flex-1"
          variants={slideUp}
          initial="hidden"
          animate="visible"
        >
          <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-4">
            YOUR ACTIVE AGENTS
          </p>
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="rounded-[20px] border border-surface p-6 flex items-center justify-between mb-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-success" />
                <div className="flex flex-col">
                  <span className="font-medium text-[15px] text-cream">
                    {agent.name}
                  </span>
                  <span className="text-sm text-muted">{agent.subtitle}</span>
                </div>
              </div>
              <span className="font-heading font-bold text-xl text-terracotta">
                {agent.earnings}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Right: Recent Jobs */}
        <motion.div
          className="flex-1"
          variants={slideUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
        >
          <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-4">
            RECENT JOBS
          </p>
          {jobs.map((job, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3.5 border-b border-surface"
            >
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  job.status === "DONE"
                    ? "bg-success/15 text-success"
                    : "bg-terracotta/15 text-terracotta"
                }`}
              >
                {job.status}
              </span>
              <span className="text-[14px] text-cream flex-1">
                {job.description}
              </span>
              <span className="text-sm text-muted">{job.time}</span>
              <span className="font-medium text-[14px] text-cream">
                {job.price}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
