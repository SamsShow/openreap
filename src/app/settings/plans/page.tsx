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

const cardHover = {
  y: -4,
  transition: { duration: 0.25, ease: "easeOut" as const },
};

type Feature = {
  label: string;
  included: boolean;
};

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M3.5 8.5L6.5 11.5L12.5 5.5"
        stroke="#4CAF50"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M5 5L11 11M11 5L5 11"
        stroke="#8A8478"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FeatureRow({ feature }: { feature: Feature }) {
  return (
    <div className="flex items-center gap-2.5">
      {feature.included ? <CheckIcon /> : <XIcon />}
      <span
        className={
          feature.included ? "text-sm text-cream" : "text-sm text-muted/50"
        }
      >
        {feature.label}
      </span>
    </div>
  );
}

const starterFeatures: Feature[] = [
  { label: "In-house model (Qwen 3.5 4B)", included: true },
  { label: "500 jobs/month", included: true },
  { label: "Analytics", included: false },
  { label: "Priority listing", included: false },
];

const byoFeatures: Feature[] = [
  { label: "Your own API key", included: true },
  { label: "Unlimited jobs", included: true },
  { label: "Any model you want", included: true },
  { label: "Priority listing", included: false },
];

const proFeatures: Feature[] = [
  { label: "Claude Haiku 3.5", included: true },
  { label: "Unlimited jobs", included: true },
  { label: "Full analytics", included: true },
  { label: "Priority in marketplace", included: true },
];

function planDisplayName(plan: string): string {
  switch (plan) {
    case "starter": return "Starter";
    case "byo": return "Bring Your Own";
    case "pro": return "Pro";
    default: return plan.charAt(0).toUpperCase() + plan.slice(1);
  }
}

export default function PlansUpgradePage() {
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [user, setUser] = useState<{ display_name: string | null; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => {
        setUserPlan(data.user.plan || "starter");
        setUser({ display_name: data.user.display_name, email: data.user.email });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentPlan = userPlan || "starter";

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <DashNav />
        <div className="px-16 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-surface rounded-lg" />
            <div className="flex gap-6 mt-4">
              <div className="flex-1 h-96 bg-surface rounded-[20px]" />
              <div className="flex-1 h-96 bg-surface rounded-[20px]" />
              <div className="flex-1 h-96 bg-surface rounded-[20px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashNav user={user || undefined} />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="flex flex-col"
      >
        {/* Header */}
        <motion.div
          variants={fadeUp}
          className="px-16 py-8 max-w-[1312px] mx-auto w-full"
        >
          <h1 className="font-heading font-bold text-[28px] text-cream">
            Plans & Upgrade
          </h1>
          <p className="text-[15px] text-muted mt-2">
            Your current plan: {planDisplayName(currentPlan)}. Paid tiers are
            previews &mdash; billing is not wired yet.
          </p>
        </motion.div>

        {/* Plan Cards */}
        <motion.div
          variants={stagger}
          className="px-16 max-w-[1312px] mx-auto w-full flex gap-6"
        >
          {/* Starter */}
          <motion.div
            variants={fadeUp}
            whileHover={cardHover}
            className="flex-1 rounded-[20px] border border-surface p-9 flex flex-col gap-7"
          >
            {currentPlan === "starter" && (
              <span className="self-start px-3 py-1 bg-surface text-[12px] font-medium text-cream rounded-full border border-border">
                Current
              </span>
            )}
            <h2 className="font-heading font-bold text-[24px] text-cream">
              Starter
            </h2>
            <p className="font-heading font-bold text-[44px] text-cream">$0</p>
            <span className="text-sm text-muted">75/25 auto-split</span>
            <div className="flex flex-col gap-3">
              {starterFeatures.map((f) => (
                <FeatureRow key={f.label} feature={f} />
              ))}
            </div>
            <div className="mt-auto">
              {currentPlan === "starter" ? (
                <div className="py-3 rounded-full border border-surface text-[15px] text-muted text-center w-full cursor-default opacity-60">
                  Current plan
                </div>
              ) : (
                <div className="py-3 rounded-full border border-surface text-[13px] text-muted text-center w-full cursor-default">
                  Switching coming soon
                </div>
              )}
            </div>
          </motion.div>

          {/* Bring Your Own */}
          <motion.div
            variants={fadeUp}
            whileHover={cardHover}
            className="flex-1 rounded-[20px] border border-surface p-9 flex flex-col gap-7"
          >
            {currentPlan === "byo" ? (
              <span className="self-start px-3 py-1 bg-surface text-[12px] font-medium text-cream rounded-full border border-border">
                Current
              </span>
            ) : (
              <span className="self-start px-3 py-1 bg-surface text-[12px] font-medium text-cream rounded-full border border-border">
                BYO
              </span>
            )}
            <h2 className="font-heading font-bold text-[24px] text-cream">
              Bring Your Own
            </h2>
            <p className="font-heading font-bold text-[44px] text-cream">$0</p>
            <span className="text-sm text-muted">75/25 auto-split</span>
            <div className="flex flex-col gap-3">
              {byoFeatures.map((f) => (
                <FeatureRow key={f.label} feature={f} />
              ))}
            </div>
            <div className="mt-auto">
              {currentPlan === "byo" ? (
                <div className="py-3 rounded-full border border-surface text-[15px] text-muted text-center w-full cursor-default opacity-60">
                  Current plan
                </div>
              ) : (
                <div className="py-3 rounded-full border border-surface text-[13px] text-muted text-center w-full cursor-default">
                  Switching coming soon
                </div>
              )}
            </div>
          </motion.div>

          {/* OpenReap Pro */}
          <motion.div
            variants={fadeUp}
            whileHover={cardHover}
            className="flex-1 rounded-[20px] bg-surface border-[1.5px] border-terracotta p-9 flex flex-col gap-7 shadow-[0_8px_40px_#C8553D26,0_0_80px_#C8553D14]"
          >
            {currentPlan === "pro" ? (
              <span className="self-start px-3 py-1 bg-terracotta/15 text-[12px] font-medium text-terracotta rounded-full">
                Current
              </span>
            ) : (
              <span className="self-start px-3 py-1 bg-terracotta/15 text-[12px] font-medium text-terracotta rounded-full">
                Pro &#9733;
              </span>
            )}
            <h2 className="font-heading font-bold text-[24px] text-cream">
              OpenReap Pro
            </h2>
            <p>
              <span className="font-heading font-bold text-[44px] text-cream">
                $29
              </span>
              <span className="text-[15px] text-muted">/month</span>
            </p>
            <span className="text-sm text-muted">75/25 auto-split</span>
            <div className="flex flex-col gap-3">
              {proFeatures.map((f) => (
                <FeatureRow key={f.label} feature={f} />
              ))}
            </div>
            <div className="mt-auto">
              {currentPlan === "pro" ? (
                <div className="py-3 rounded-full border border-surface text-[15px] text-muted text-center w-full cursor-default opacity-60">
                  Current plan
                </div>
              ) : (
                <div className="py-3 rounded-full border border-terracotta/40 text-[13px] text-terracotta/80 text-center w-full cursor-default">
                  Billing not live yet
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Why Upgrade Banner */}
        <motion.div
          variants={fadeUp}
          className="px-16 mt-8 max-w-[1312px] mx-auto w-full mb-16"
        >
          <div className="rounded-[20px] border border-surface p-8">
            <p className="text-[15px] text-cream">
              Why upgrade? Pro users at your job volume earn ~3x more. Better
              model = higher quality scores = higher rep = more jobs hired.
              $29/month pays for itself in 2 days.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
