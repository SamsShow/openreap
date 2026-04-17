"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DashNav } from "@/components/DashNav";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
};

interface RecentJob {
  created_at: string;
  price_cents: number;
  model: string;
  name: string;
}

interface UsageData {
  jobsThisMonth: number;
  earnings: number;
  reapFee: number;
  recentJobs: RecentJob[];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [user, setUser] = useState<{ display_name: string | null; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usageRes, userRes] = await Promise.all([
          fetch("/api/usage"),
          fetch("/api/user/me"),
        ]);
        const usageData = await usageRes.json();
        const userData = await userRes.json();

        setUsage(usageData);
        if (userData.user) {
          setUser({ display_name: userData.user.display_name, email: userData.user.email });
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const jobsThisMonth = usage?.jobsThisMonth ?? 0;
  const earningsDollars = usage ? (usage.earnings / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0";
  const reapFeeDollars = usage ? (usage.reapFee / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0";
  const progressPct = Math.min((jobsThisMonth / 500) * 100, 100);
  const remaining = Math.max(500 - jobsThisMonth, 0);

  // Approximate LLM cost: assume ~$0.004 per job average
  const llmCostTotal = (jobsThisMonth * 0.004).toFixed(2);
  const llmCostAvg = jobsThisMonth > 0 ? (jobsThisMonth * 0.004 / jobsThisMonth).toFixed(3) : "0.000";

  const stats = [
    {
      value: String(jobsThisMonth),
      label: "Jobs this month",
      detail: `500 limit \u00b7 resets in 11 days`,
    },
    {
      value: `$${earningsDollars}`,
      label: "You earned (75%)",
      detail: `$${reapFeeDollars} to Reap (25%)`,
    },
    {
      value: `$${llmCostTotal}`,
      label: "LLM cost total",
      detail: `$${llmCostAvg} avg per job`,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <DashNav />
        <div className="px-16 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-surface rounded-lg" />
            <div className="grid grid-cols-3 gap-6 mt-4">
              <div className="h-32 bg-surface rounded-[20px]" />
              <div className="h-32 bg-surface rounded-[20px]" />
              <div className="h-32 bg-surface rounded-[20px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashNav user={user || undefined} />

      {/* Header */}
      <motion.div
        className="px-16 py-8 max-w-[900px]"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        <h1 className="font-heading font-bold text-[28px] text-cream">
          Usage &amp; Credits
        </h1>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        className="px-16 max-w-[900px] mt-4 grid grid-cols-3 gap-6"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            className="rounded-[20px] border border-surface p-8"
            variants={fadeUp}
          >
            <p className="font-heading font-bold text-[40px] text-cream">
              {stat.value}
            </p>
            <p className="text-sm text-muted mt-1">{stat.label}</p>
            <p className="text-sm text-muted">{stat.detail}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Progress bar */}
      <motion.div
        className="px-16 max-w-[900px] mt-6"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        <div className="flex items-center">
          <span className="text-sm text-cream">
            Jobs used &mdash; {jobsThisMonth} of 500
          </span>
          <span className="text-sm text-muted ml-auto">{remaining} remaining</span>
        </div>
        <div className="mt-2 w-full h-2 rounded-full bg-surface">
          <div
            className="h-2 rounded-full bg-success"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </motion.div>

      {/* Recent job costs */}
      <motion.div
        className="px-16 max-w-[900px] mt-8"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        <div className="rounded-[20px] border border-surface p-8">
          <p className="font-medium text-[15px] text-cream mb-4">
            Recent job costs
          </p>
          {usage?.recentJobs && usage.recentJobs.length > 0 ? (
            usage.recentJobs.map((job, i) => (
              <div
                key={i}
                className={`py-3 flex items-center ${
                  i < usage.recentJobs.length - 1 ? "border-b border-surface" : ""
                }`}
              >
                <span className="w-[60px] text-sm text-muted">{formatTime(job.created_at)}</span>
                <span className="flex-1 text-sm text-cream">{job.model || job.name}</span>
                <span className="text-sm text-muted mr-6">{job.name}</span>
                <span className="font-medium text-sm text-terracotta">
                  {formatCurrency(job.price_cents)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No recent jobs.</p>
          )}
        </div>
      </motion.div>

    </div>
  );
}
