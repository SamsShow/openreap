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

interface Escalation {
  id: string;
  input_payload: { text: string };
  status: string;
  price_cents: number;
  created_at: string;
  agent_name: string;
}

interface User {
  display_name: string | null;
  email: string;
}

const columns = [
  { label: "AGENT", width: "w-[200px]" },
  { label: "INPUT PREVIEW", width: "flex-1" },
  { label: "PRICE", width: "w-[80px]" },
  { label: "TIME", width: "w-[80px]" },
  { label: "ACTIONS", width: "w-[200px]" },
];

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const rowVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function QueuePage() {
  const router = useRouter();
  const [rejectionReason, setRejectionReason] = useState("");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleUnauth = (res: Response) => {
      if (res.status === 401) {
        router.push("/auth");
        return null;
      }
      return res.json();
    };

    Promise.all([
      fetch("/api/queue").then(handleUnauth),
      fetch("/api/user/me").then(handleUnauth),
    ])
      .then(([queueData, userData]) => {
        if (queueData) setEscalations(queueData.escalations);
        if (userData?.user) setUser(userData.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const handleApprove = async (id: string) => {
    const res = await fetch(`/api/queue/${id}/approve`, { method: "POST" });
    if (res.status === 401) {
      router.push("/auth");
      return;
    }
    if (res.ok) {
      setEscalations((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleReject = async (id: string) => {
    const res = await fetch(`/api/queue/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectionReason }),
    });
    if (res.status === 401) {
      router.push("/auth");
      return;
    }
    if (res.ok) {
      setEscalations((prev) => prev.filter((e) => e.id !== id));
      setRejectionReason("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg font-body opacity-0">
        <DashNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg font-body">
      <DashNav user={user ?? undefined} />

      {/* Header */}
      <motion.div
        className="px-16 py-8 max-w-[1312px] mx-auto"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center">
          <h1 className="font-heading font-bold text-[28px] text-cream">
            Escalation Queue
          </h1>
          <span className="bg-terracotta/15 text-terracotta text-[13px] font-medium px-3 py-1 rounded-full ml-4">
            {escalations.length} pending
          </span>
        </div>
        <p className="text-[15px] text-muted mt-2">
          Jobs that matched escalation conditions in your SKILL.md. Review,
          approve, or reject.
        </p>
      </motion.div>

      {/* Table */}
      <div className="px-16 max-w-[1312px] mx-auto">
        <div className="rounded-[20px] border border-surface overflow-clip">
          {/* Header row */}
          <div className="px-6 py-4 border-b border-surface flex bg-surface/50">
            {columns.map((col) => (
              <span
                key={col.label}
                className={`text-[12px] font-medium tracking-[0.06em] uppercase text-muted ${col.width}`}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Data rows */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {escalations.map((item, i) => (
              <motion.div
                key={item.id}
                variants={rowVariant}
                whileHover={{ backgroundColor: "rgba(42, 38, 32, 0.5)" }}
                className={`px-6 py-5 flex items-center ${
                  i < escalations.length - 1 ? "border-b border-surface" : ""
                }`}
              >
                {/* Agent */}
                <div className="w-[200px] flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="font-medium text-[15px] text-cream">
                    {item.agent_name}
                  </span>
                </div>

                {/* Input Preview */}
                <span className="flex-1 text-[14px] text-muted line-clamp-2 pr-4">
                  {item.input_payload.text}
                </span>

                {/* Price */}
                <span className="w-[80px] text-[15px] text-cream">
                  {formatCents(item.price_cents)}
                </span>

                {/* Time */}
                <span className="w-[80px] text-sm text-muted">
                  {timeAgo(item.created_at)}
                </span>

                {/* Actions */}
                <div className="w-[200px] flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(item.id)}
                    className="px-5 py-2 bg-success/20 text-success text-sm rounded-full font-medium transition-colors hover:bg-success/30"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    className="px-4 py-2 border border-border text-sm text-muted rounded-full transition-colors hover:text-cream hover:border-cream/30"
                  >
                    Reject
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Rejection reason */}
      <div className="px-16 mt-6 max-w-[1312px] mx-auto pb-16">
        <div className="rounded-[20px] border border-surface p-8">
          <p className="text-[14px] text-muted">
            Rejecting a job? Add a reason so the requesting agent can retry with
            better input.
          </p>
          <input
            type="text"
            placeholder="Rejection reason (optional)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="mt-3 w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-cream placeholder:text-subtle outline-none focus:border-cream/30 transition-colors"
          />
          <p className="mt-3 text-[12px] text-muted/70 italic">
            Note: x402 payments are non-refundable by protocol. Rejecting a job
            means the caller loses their fee — use only for out-of-scope or
            abusive inputs.
          </p>
        </div>
      </div>
    </div>
  );
}
