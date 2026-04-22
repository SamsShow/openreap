"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useConfig } from "wagmi";
import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import { SmartNav } from "@/components/SmartNav";
import { ErrorCard } from "@/components/ErrorCard";
import { CodeBlock } from "@/components/CodeBlock";
import { Erc8004Badge } from "@/components/Erc8004Badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { AgentResultCard } from "@/components/AgentResultCard";
import { motion } from "framer-motion";
import { signX402Payment } from "@/lib/x402-client";
import {
  X402ClientError,
  classifySignError,
} from "@/lib/x402-errors";

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1 },
  }),
};

const slideUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.3 } },
};

interface AgentData {
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
  model: string;
  skill_md: string;
  owner_id: string;
  is_reap_agent?: boolean;
}

const findings = [
  {
    severity: "HIGH",
    badgeClass: "bg-red-500/15 text-red-400",
    text: "Clause 7.2 \u2014 Unlimited indemnity without cap. Recommend adding liability ceiling of 2x contract value.",
  },
  {
    severity: "MED",
    badgeClass: "bg-yellow-500/15 text-yellow-400",
    text: "Clause 3.1 \u2014 Non-compete extends to 36 months. Standard is 12-18 months in most jurisdictions.",
  },
  {
    severity: "LOW",
    badgeClass: "bg-blue-500/15 text-blue-400",
    text: "Clause 5.4 \u2014 Governing law is Delaware. Consider adding local arbitration clause for enforcement.",
  },
];

function buildJsSnippet(endpoint: string) {
  return `// 1. Probe the agent without payment — you'll get HTTP 402 + x402 requirements
const probe = await fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: "Your task description" }),
});
const { accepts } = await probe.json(); // x402 v1 envelope

// 2. Sign an EIP-3009 transferWithAuthorization for accepts[0]
//    (USDC on Base mainnet — see https://eips.ethereum.org/EIPS/eip-3009)
const xPayment = await signX402Payment(accepts[0]); // base64 JSON

// 3. Retry with the x-payment header — the server settles on-chain via the
//    Elsa x402 facilitator and runs the agent
const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payment": xPayment,
  },
  body: JSON.stringify({ input: "Your task description" }),
});

const { output, job_id, tx_hash } = await response.json();`;
}

function buildCurlSnippet(endpoint: string) {
  return `# 1. Probe — get x402 requirements
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"Your task description"}'
# HTTP/1.1 402
# {"x402Version":1,"accepts":[{"scheme":"exact","network":"base",...}]}

# 2. Sign the EIP-3009 auth client-side, then retry with x-payment
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -H "x-payment: $X_PAYMENT_HEADER" \\
  -d '{"input":"Your task description"}'`;
}

export default function AgentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.id as string;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const { address, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const { openConnectModal } = useConnectModal();

  const [hireInput, setHireInput] = useState("");
  const [hireLoading, setHireLoading] = useState(false);
  const [hireProgress, setHireProgress] = useState("");
  const [hireResult, setHireResult] = useState<Record<string, unknown> | null>(
    null
  );
  const [hireError, setHireError] = useState<unknown>(null);

  async function handleHire(currentAgent: AgentData) {
    if (!isConnected || !address) {
      setHireError(
        new X402ClientError(
          "wallet_not_connected",
          "Connect your wallet",
          "You need a connected wallet before you can hire this agent."
        )
      );
      return;
    }
    if (!hireInput.trim()) {
      setHireError(
        new X402ClientError(
          "invalid_input",
          "Tell the agent what to do",
          "Describe the task in the box above and try again."
        )
      );
      return;
    }

    setHireError(null);
    setHireResult(null);
    setHireLoading(true);
    setHireProgress("Probing agent for payment details...");

    try {
      const probe = await fetch(`/api/agents/${currentAgent.slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: hireInput }),
      });

      if (probe.status !== 402) {
        const data = await probe.json();
        setHireResult(data);
        return;
      }

      const envelope = await probe.json();
      const requirements = envelope.accepts?.[0];
      if (!requirements) {
        throw new X402ClientError(
          "agent_error",
          "Agent 402 was empty",
          "The agent returned 402 but no payment requirements. Retry in a moment.",
          { details: envelope }
        );
      }

      setHireProgress("Sign the payment in your wallet...");
      let signed;
      try {
        signed = await signX402Payment(wagmiConfig, address, requirements);
      } catch (signErr) {
        throw classifySignError(signErr);
      }

      setHireProgress("Settling on-chain and running agent...");
      const res = await fetch(`/api/agents/${currentAgent.slug}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-payment": signed.header,
        },
        body: JSON.stringify({ input: hireInput }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const reason = (data.reason as string) ?? "";
        // Facilitator reverted because the payer's USDC balance on the asset
        // contract is less than the hire fee — reclassify with an actionable
        // message instead of dumping the raw viem trace.
        if (/exceeds balance|insufficient/i.test(reason)) {
          const priceUsd = Number(currentAgent.price_cents) / 100;
          const short = address
            ? `${address.slice(0, 6)}…${address.slice(-4)}`
            : "your wallet";
          throw new X402ClientError(
            "insufficient_funds",
            "Not enough USDC on Base mainnet",
            `Your wallet ${short} doesn't hold $${priceUsd.toFixed(2)} USDC on Base mainnet. Fund it and retry.`,
            {
              hint:
                "Fund your wallet with USDC on Base mainnet. The token contract is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 — any other 'USDC' on Base won't work. A Coinbase withdraw or bridge from mainnet ETH is fastest.",
              details: data,
            }
          );
        }
        // Payment settled but the LLM provider (OpenRouter) rejected the
        // call. x402 is non-refundable, so be honest with the user.
        if (data.error === "service_unavailable") {
          throw new X402ClientError(
            "agent_error",
            "Agent couldn't complete the job",
            `The payment settled on-chain but the LLM provider (${
              (data.model as string) || "upstream"
            }) rejected the call. ${
              (data.hint as string) ??
              "Retry — most failures are transient."
            }`,
            {
              hint:
                typeof data.reason === "string"
                  ? `Provider said: ${data.reason}`
                  : undefined,
              details: data,
            }
          );
        }
        throw new X402ClientError(
          "facilitator_failed",
          "Agent rejected the payment",
          (data.error as string) || `Agent returned HTTP ${res.status}.`,
          { details: data }
        );
      }
      setHireResult(data);
    } catch (err) {
      setHireError(err);
    } finally {
      setHireProgress("");
      setHireLoading(false);
    }
  }

  useEffect(() => {
    async function fetchAgent() {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          // First-party Reap agents have their own dedicated page with a
          // swap-specific UI and no hire fee — route users there instead of
          // the generic LLM-agent profile.
          if (data.agent?.is_reap_agent) {
            router.replace("/reap-agents");
            return;
          }
          setAgent(data.agent);
        }
      } catch (err) {
        console.error("Failed to fetch agent:", err);
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetchAgent();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <SmartNav />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-surface border-t-terracotta rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="min-h-screen bg-bg">
        <SmartNav />
        <div className="flex flex-col items-center justify-center py-32">
          <h1 className="font-heading font-bold text-[28px] text-cream">Agent not found</h1>
          <p className="text-muted mt-2">The agent you are looking for does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const priceDisplay = `$${Number(agent.price_cents) / 100}`;
  const stats = [
    { value: Number(agent.jobs_completed).toLocaleString(), label: "Jobs Done" },
    { value: `${parseFloat(String(agent.reputation_score)).toFixed(1)}%`, label: "Reputation" },
    { value: priceDisplay, label: "Per Task", highlight: true },
    { value: parseFloat(String(agent.avg_rating)).toFixed(1), label: "Avg Rating" },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <SmartNav />

      {/* Agent Header */}
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="px-16 py-10 max-w-[1312px] mx-auto flex items-start gap-6"
      >
        {/* Icon */}
        <CategoryIcon
          category={agent.category}
          size={36}
          className="w-20 h-20 rounded-2xl"
        />

        {/* Info Column */}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-heading font-bold text-[36px] text-cream">
              {agent.name}
            </h1>
            <span className="bg-success/15 text-success text-[13px] font-medium px-3 py-1 rounded-full">
              LIVE
            </span>
          </div>
          <p className="text-[15px] text-muted mt-1">by {agent.creator_name}</p>
          <p className="text-[17px] leading-7 text-muted mt-3 max-w-[640px]">
            {agent.description}
          </p>
        </div>

        {/* CTA Button */}
        <a
          href="#hire-panel"
          className="px-8 py-3 bg-terracotta rounded-full text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow flex-shrink-0"
        >
          Hire This Agent &mdash; {priceDisplay}
        </a>
      </motion.div>

      {/* Stats Row */}
      <div className="px-16 max-w-[1312px] mx-auto grid grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={i}
            className="rounded-[20px] border border-surface p-8 text-center"
          >
            <div
              className={`font-heading font-bold text-[32px] ${
                stat.highlight ? "text-terracotta" : "text-cream"
              }`}
            >
              {stat.value}
            </div>
            <div className="text-sm text-muted mt-1 flex items-center justify-center gap-2">
              {stat.label}
              {stat.label === "Reputation" && (
                <Erc8004Badge variant="compact" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Content Area */}
      <div className="px-16 py-10 max-w-[1312px] mx-auto flex gap-8">
        {/* Left: Sample Output */}
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="visible"
          className="flex-1"
        >
          <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-4">
            Sample Output
          </p>
          <div className="rounded-[20px] border border-surface p-8">
            <h2 className="font-heading font-bold text-[22px] text-cream mb-6">
              Contract Review: Acme Corp NDA
            </h2>
            <div className="flex flex-col gap-4">
              {findings.map((finding) => (
                <div
                  key={finding.severity}
                  className="flex items-start gap-3"
                >
                  <span
                    className={`${finding.badgeClass} text-[12px] font-bold px-2.5 py-1 rounded flex-shrink-0`}
                  >
                    {finding.severity}
                  </span>
                  <p className="text-[15px] leading-6 text-muted">
                    {finding.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right: How to Hire */}
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="visible"
          className="w-[420px] flex-shrink-0"
        >
          <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-4">
            How to Hire This Agent
          </p>
          <HireEndpointDocs slug={agent.slug} />

          {/* Share Row */}
          <div className="flex items-center gap-2 mt-4">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="flex-shrink-0"
            >
              <path
                d="M12 5.5C13.1046 5.5 14 4.60457 14 3.5C14 2.39543 13.1046 1.5 12 1.5C10.8954 1.5 10 2.39543 10 3.5C10 4.60457 10.8954 5.5 12 5.5Z"
                stroke="#8A8478"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 10C5.10457 10 6 9.10457 6 8C6 6.89543 5.10457 6 4 6C2.89543 6 2 6.89543 2 8C2 9.10457 2.89543 10 4 10Z"
                stroke="#8A8478"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 14.5C13.1046 14.5 14 13.6046 14 12.5C14 11.3954 13.1046 10.5 12 10.5C10.8954 10.5 10 11.3954 10 12.5C10 13.6046 10.8954 14.5 12 14.5Z"
                stroke="#8A8478"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.8 9.1L10.2 11.4"
                stroke="#8A8478"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.2 4.6L5.8 6.9"
                stroke="#8A8478"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm text-muted">
              Share this agent as proof of your expertise
            </p>
          </div>
        </motion.div>
      </div>

      {/* Live Hire Panel */}
      <div id="hire-panel" className="px-16 pb-16 max-w-[1312px] mx-auto">
        <div className="rounded-[20px] border border-surface bg-bg p-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta mb-2">
                Hire via Elsa x402 · Base mainnet
              </p>
              <h3 className="font-heading font-bold text-[22px] text-cream">
                Pay {priceDisplay} in USDC and run it now
              </h3>
              <p className="text-sm text-muted mt-2 max-w-[640px]">
                Your connected wallet signs an EIP-3009 authorization for USDC
                on Base mainnet, the same x402 protocol Elsa runs. We settle it
                on-chain via Elsa&apos;s x402 facilitator, then run the agent. No
                server-side keys.
              </p>
            </div>
            <ConnectButton
              accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
              chainStatus="icon"
              showBalance={false}
            />
          </div>

          <div className="mt-6">
            <label className="text-xs text-muted mb-2 block">
              What do you want this agent to do?
            </label>
            <textarea
              value={hireInput}
              onChange={(e) => setHireInput(e.target.value)}
              placeholder="e.g. Review this NDA for risk clauses..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-cream outline-none focus:border-terracotta/50 font-mono"
            />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={
                !isConnected
                  ? () => openConnectModal?.()
                  : () => handleHire(agent)
              }
              disabled={hireLoading || (isConnected && !hireInput.trim())}
              className="px-6 py-3 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {hireLoading
                ? hireProgress || "Working..."
                : !isConnected
                  ? "Connect Wallet"
                  : `Hire & Run — ${priceDisplay}`}
            </button>
            {hireProgress && !hireLoading ? null : (
              <p className="text-xs text-muted">
                Payment goes to Reap treasury on Base mainnet
              </p>
            )}
          </div>

          {hireLoading ? (
            <div className="mt-6 rounded-xl bg-surface/60 border border-border p-5">
              <ThinkingLoader
                sublabel={hireProgress || "Waiting for the agent..."}
              />
            </div>
          ) : null}

          {hireError ? (
            <div className="mt-6">
              <ErrorCard
                error={hireError}
                onRetry={() => handleHire(agent)}
                fundingAddress={address as `0x${string}` | undefined}
              />
            </div>
          ) : null}

          {hireResult && (
            <div className="mt-6">
              <AgentResultCard result={hireResult} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HireEndpointDocs({ slug }: { slug: string }) {
  const [tab, setTab] = useState<"curl" | "js">("js");
  const apiBase =
    (typeof window !== "undefined" && window.location.origin) ||
    "https://openreap.ai";
  const endpoint = `${apiBase}/api/agents/${slug}/run`;

  return (
    <div className="rounded-[20px] border border-surface p-6 flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted">x402 Endpoint</p>
        <div className="bg-bg rounded-xl px-4 py-3 mt-2">
          <code className="font-mono text-[13px] text-cream break-all">
            POST {endpoint}
          </code>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1 border-b border-surface">
          {(
            [
              { key: "js", label: "JavaScript" },
              { key: "curl", label: "cURL" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-[12px] transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "text-cream border-terracotta"
                  : "text-muted border-transparent hover:text-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <CodeBlock
            code={tab === "js" ? buildJsSnippet(endpoint) : buildCurlSnippet(endpoint)}
            label={tab === "js" ? "JavaScript" : "cURL"}
          />
        </div>
      </div>

      <div className="text-xs text-muted">
        Payment settles as USDC on Base mainnet via Elsa&apos;s x402 facilitator. See the
        <a
          href="https://x402.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-terracotta hover:underline"
        >
          {" "}x402 spec
        </a>{" "}
        for the EIP-3009 signing format.
      </div>
    </div>
  );
}
