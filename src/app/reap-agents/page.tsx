"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";

const ExcalidrawPreview = dynamic(
  async () => (await import("@/components/ExcalidrawPreview")).ExcalidrawPreview,
  { ssr: false, loading: () => <div className="h-[420px]" /> }
);
import { useAccount, useConfig } from "wagmi";
import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import { SmartNav } from "@/components/SmartNav";
import { ErrorCard } from "@/components/ErrorCard";
import { CodeBlock } from "@/components/CodeBlock";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { getElsaMainnetQuote } from "@/lib/elsa-client";
import {
  signX402Payment,
  type PaymentRequirements,
} from "@/lib/x402-client";
import {
  X402ClientError,
  classifyElsaError,
  classifySignError,
} from "@/lib/x402-errors";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
      delay: i * 0.1,
    },
  }),
};

const tokens = ["USDC", "ETH", "WETH", "DAI"];

const TOKEN_ADDRS_MAINNET: Record<string, string> = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  ETH: "0x4200000000000000000000000000000000000006",
  WETH: "0x4200000000000000000000000000000000000006",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
};

const steps = [
  {
    number: "1",
    title: "Connect wallet & trigger swap",
    description:
      "One click. Your wallet signs a single EIP-3009 auth to pay Elsa x402 on Base mainnet. No server-side keys, no custody.",
  },
  {
    number: "2",
    title: "Agent pays Elsa x402 on mainnet",
    description:
      "Auto-Trader calls x402-api.heyelsa.ai/api/get_swap_quote. Your wallet settles the $0.01 USDC fee directly on Base mainnet — the x402-paid call in the execution trace.",
  },
  {
    number: "3",
    title: "Swap executes",
    description:
      "The Reap Auto-Trader processes the quote and returns the execution result. First-party Reap agent — no separate hire fee, just the underlying Elsa call.",
  },
];

type SwapResult = {
  status: string;
  chain?: string;
  tx_hash?: string;
  amount_received?: number;
  from_token?: string;
  to_token?: string;
  payment_tx?: string;
  payer?: string;
  elsa_tx_hash?: string | null;
  trace?: {
    source: string;
    elsa_tx_hash?: string | null;
    elsa_quote?: Record<string, unknown> | null;
  };
  quote?: {
    estimated_output: number;
    price_impact: number;
    route: string;
  };
  error?: string;
};

const AGENT_TABS = [
  { key: "auto-trader", label: "Base Auto-Trader" },
  { key: "code-roaster", label: "Code Roaster" },
  { key: "diagram-weaver", label: "Diagram Weaver" },
] as const;
type AgentTabKey = (typeof AGENT_TABS)[number]["key"];

export default function ReapAgentsPage() {
  const [activeAgent, setActiveAgent] = useState<AgentTabKey>("auto-trader");
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("ETH");
  const [amount, setAmount] = useState("100");
  const [slippage, setSlippage] = useState("0.5");
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<SwapResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { address, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const { openConnectModal } = useConnectModal();

  async function handleSwap() {
    if (!isConnected || !address) {
      setError(
        new X402ClientError(
          "wallet_not_connected",
          "Connect your wallet",
          "You need a connected wallet before the agent can run. Use the Connect Wallet button above.",
        ),
      );
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);
    setProgress("Fetching quote from Elsa x402 (mainnet)...");

    try {
      // Real x402-paid call: get the swap quote from Elsa on mainnet.
      const elsaResult = await getElsaMainnetQuote(wagmiConfig, address, {
        from_chain: "base",
        from_token:
          TOKEN_ADDRS_MAINNET[tokenIn.toUpperCase()] ?? tokenIn,
        from_amount: String(parseFloat(amount)),
        to_chain: "base",
        to_token:
          TOKEN_ADDRS_MAINNET[tokenOut.toUpperCase()] ?? tokenOut,
        wallet_address: address,
        slippage: parseFloat(slippage),
      });

      setProgress("Executing swap via Reap Auto-Trader...");

      // Reap Auto-Trader is first-party — no separate hire fee. We pass the
      // Elsa mainnet tx hash as proof that the x402 call happened.
      const res = await fetch("/api/agents/auto-trader/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token_in: tokenIn,
          token_out: tokenOut,
          amount: parseFloat(amount),
          slippage: parseFloat(slippage),
          wallet: address,
          dry_run: dryRun,
          elsa_tx_hash: elsaResult.txHash,
          elsa_quote: elsaResult.quote,
        }),
      });

      const data = (await res.json()) as SwapResult;
      if (!res.ok) {
        throw new X402ClientError(
          "agent_error",
          "Auto-Trader rejected the request",
          data.error ||
            "The Reap Auto-Trader couldn't process the swap. See details.",
          { details: data }
        );
      }
      setResult(data);
    } catch (err) {
      setError(err);
    } finally {
      setProgress("");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg">
      <SmartNav />

      {/* Hero */}
      <section className="px-16 py-16 max-w-[1312px] mx-auto">
        <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show" className="flex items-center gap-2 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-terracotta" />
          <span className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta">
            Built &amp; Operated by Reap
          </span>
        </motion.div>
        <motion.h1 variants={fadeUp} custom={1} initial="hidden" animate="show" className="font-heading font-bold text-[48px] leading-[54px] tracking-[-0.03em] text-cream">
          Reap Agents
        </motion.h1>
        <motion.p variants={fadeUp} custom={2} initial="hidden" animate="show" className="text-[17px] leading-7 text-muted max-w-[640px] mt-5">
          First-party agents built and owned by Reap. Each run is a verifiable on-chain x402 trace settled through Elsa&apos;s facilitator on Base mainnet. Any AI agent can discover and pay to use these tools via <span className="font-mono text-cream">/api/agents/catalog</span>.
        </motion.p>
      </section>

      {/* Agent tabs */}
      <section className="px-16 max-w-[1312px] mx-auto mb-6">
        <div className="flex items-center gap-1 border-b border-border">
          {AGENT_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveAgent(t.key)}
              className={`px-5 py-3 text-[15px] font-medium transition-colors border-b-2 -mb-px ${
                activeAgent === t.key
                  ? "text-cream border-terracotta"
                  : "text-muted border-transparent hover:text-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {activeAgent === "auto-trader" && (
        <>

      {/* Interactive Swap Card */}
      <section className="px-16 max-w-[1312px] mx-auto">
        <motion.div variants={fadeUp} custom={3} initial="hidden" animate="show" className="rounded-[20px] bg-surface border border-border p-10">
          <div className="flex gap-10">
            {/* Left — Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-heading font-bold text-[28px] text-cream">Base Auto-Trader</h2>
                <span className="bg-terracotta/15 text-terracotta text-[13px] font-medium px-3 py-1 rounded-full">Reap Agent</span>
                <span className="bg-success/15 text-success text-[13px] font-medium px-3 py-1 rounded-full">Live</span>
              </div>
              <p className="text-[17px] leading-7 text-muted mt-4">
                Takes a token swap instruction, fetches a real quote from Elsa x402 on Base mainnet, and returns the execution result. First-party Reap agent — the Elsa x402 call is the only fee.
              </p>
              <div className="flex gap-10 mt-8">
                {[
                  { value: "$0.01", label: "Elsa x402 (mainnet)" },
                  { value: "1-tx", label: "on-chain x402 trace" },
                  { value: "<2s", label: "avg execution time" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="font-heading font-bold text-[28px] text-cream">{stat.value}</p>
                    <p className="text-sm text-muted mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Swap Form */}
            <div className="w-[400px] flex-shrink-0 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-lg text-cream">Try It Now</h3>
                <ConnectButton
                  accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
                  chainStatus="icon"
                  showBalance={false}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted mb-1 block">From</label>
                  <select
                    value={tokenIn}
                    onChange={(e) => setTokenIn(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50"
                  >
                    {tokens.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-2.5">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="#8A8478" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted mb-1 block">To</label>
                  <select
                    value={tokenOut}
                    onChange={(e) => setTokenOut(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50"
                  >
                    {tokens.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50"
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Slippage %</label>
                <input
                  type="number"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  step="0.1"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDryRun(!dryRun)}
                  className={`w-4 h-4 rounded border flex items-center justify-center ${dryRun ? "bg-terracotta border-terracotta" : "border-border"}`}
                >
                  {dryRun && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke="#FAF7F2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className="text-sm text-muted">Dry run (quote only, no execution)</span>
              </div>

              <button
                onClick={
                  !isConnected ? () => openConnectModal?.() : handleSwap
                }
                disabled={loading || !amount}
                className="w-full py-3 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading
                  ? progress || "Working..."
                  : !isConnected
                    ? "Connect Wallet"
                    : dryRun
                      ? "Get Quote — $0.01 via Elsa x402"
                      : "Execute Swap — $0.01 via Elsa x402"}
              </button>

              <p className="text-xs text-muted text-center">
                $0.01 USDC paid to Elsa x402 on Base mainnet. No other fees.
              </p>
            </div>
          </div>

          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 pt-8 border-t border-border"
            >
              <div className="rounded-xl bg-surface/60 border border-border p-5">
                <ThinkingLoader sublabel={progress || "Waiting for the agent..."} />
              </div>
            </motion.div>
          )}

          {/* Result */}
          {!loading && (result || error !== null) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 pt-8 border-t border-border"
            >
              {error ? (
                <ErrorCard
                  error={error}
                  onRetry={handleSwap}
                  fundingAddress={
                    address as `0x${string}` | undefined
                  }
                />
              ) : null}
              {result && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold ${result.status === "executed" ? "bg-success/15 text-success" : "bg-terracotta/15 text-terracotta"}`}>
                      {result.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-muted">
                      {result.status === "executed" ? "Trade completed on Base mainnet" : "Quote generated"}
                    </span>
                  </div>

                  {result.elsa_tx_hash && (
                    <div className="text-sm">
                      <span className="text-muted">Elsa x402 (mainnet): </span>
                      <a
                        href={`https://basescan.org/tx/${result.elsa_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cream font-mono hover:text-terracotta break-all"
                      >
                        {result.elsa_tx_hash}
                      </a>
                    </div>
                  )}
                  {result.payment_tx && (
                    <div className="text-sm">
                      <span className="text-muted">Reap x402 (mainnet): </span>
                      <a
                        href={`https://basescan.org/tx/${result.payment_tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cream font-mono hover:text-terracotta break-all"
                      >
                        {result.payment_tx}
                      </a>
                    </div>
                  )}

                  <div className="rounded-xl bg-bg p-4 font-mono text-sm text-cream">
                    <pre className="whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* x402 Endpoint (for external agents) */}
      <AutoTraderEndpointDocs />

      {/* How It Works */}
      <section className="px-16 py-16 max-w-[1312px] mx-auto">
        <motion.h2 variants={fadeUp} custom={0} initial="hidden" whileInView="show" viewport={{ once: true }} className="font-heading font-bold text-xl text-cream mb-8">
          How the Base Auto-Trader Works
        </motion.h2>
        <div className="flex gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              variants={fadeUp}
              custom={i}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="flex-1 rounded-[20px] bg-surface border border-border p-8"
            >
              <div className="w-9 h-9 rounded-full bg-terracotta/15 flex items-center justify-center">
                <span className="font-heading font-bold text-[16px] text-terracotta">{step.number}</span>
              </div>
              <h3 className="font-semibold text-[16px] text-cream mt-4">{step.title}</h3>
              <p className="text-sm leading-[22px] text-muted mt-2">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </section>
        </>
      )}

      {activeAgent === "code-roaster" && (
        <>
          <CodeRoasterCard />
          <CodeRoasterEndpointDocs />
        </>
      )}

      {activeAgent === "diagram-weaver" && (
        <>
          <DiagramWeaverCard />
          <DiagramWeaverEndpointDocs />
        </>
      )}

      {/* Marketplace CTA — shown for both tabs */}
      <section className="px-16 pb-16 max-w-[1312px] mx-auto">
        <motion.div
          variants={fadeUp} custom={0} initial="hidden" whileInView="show" viewport={{ once: true }}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-surface border border-border rounded-[20px] p-10 flex items-center justify-between"
        >
          <div>
            <h2 className="font-heading font-bold text-xl text-cream">Available on the Marketplace</h2>
            <p className="text-sm text-muted mt-2 max-w-[520px]">
              All Reap agents are listed alongside community agents. Any AI agent can discover and hire them via Elsa x402.
            </p>
          </div>
          <Link href="/marketplace" className="px-6 py-3 bg-terracotta rounded-full text-[15px] font-medium text-off-white hover:opacity-90 transition-opacity flex-shrink-0">
            View on Marketplace
          </Link>
        </motion.div>
      </section>
    </main>
  );
}

function AutoTraderEndpointDocs() {
  const [tab, setTab] = useState<"curl" | "js">("js");
  const apiBase =
    (typeof window !== "undefined" && window.location.origin) ||
    "https://openreap.ai";
  const endpoint = `${apiBase}/api/agents/auto-trader/run`;

  const jsSnippet = `// 1. Pay Elsa x402 on Base mainnet ($0.01 USDC) — get a swap quote
//    This is the x402-paid call in your execution trace.
const elsa = await fetch("https://x402-api.heyelsa.ai/api/get_swap_quote", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payment": xPaymentHeader, // EIP-3009 auth, base64 JSON
  },
  body: JSON.stringify({
    from_chain: "base",
    from_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC mainnet
    from_amount: "100",
    to_chain: "base",
    to_token: "0x4200000000000000000000000000000000000006",   // WETH mainnet
    wallet_address: yourWallet,
    slippage: 0.5,
  }),
});

const elsaQuote = await elsa.json();
const settlement = JSON.parse(atob(elsa.headers.get("x-payment-response")));
const elsa_tx_hash = settlement.transaction;

// 2. Call the Reap Auto-Trader with the Elsa tx hash as proof of work
const res = await fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token_in: "USDC",
    token_out: "ETH",
    amount: 100,
    slippage: 0.5,
    wallet: yourWallet,
    elsa_tx_hash,    // required — the Elsa x402 settlement hash
    elsa_quote: elsaQuote,
  }),
});

const result = await res.json();
// { status: "executed", tx_hash: "0x...", amount_received: 0.0312, ... }`;

  const curlSnippet = `# Step 1 — Elsa x402 mainnet (requires EIP-3009 signed auth in x-payment)
ELSA_TX=$(curl -sS -X POST https://x402-api.heyelsa.ai/api/get_swap_quote \\
  -H 'Content-Type: application/json' \\
  -H "x-payment: $X_PAYMENT_HEADER" \\
  -d '{"from_chain":"base","from_token":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","from_amount":"100","to_chain":"base","to_token":"0x4200000000000000000000000000000000000006","wallet_address":"0xYou","slippage":0.5}' \\
  -D - | awk '/x-payment-response/ {print $2}')

# Step 2 — Reap Auto-Trader
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -d '{
    "token_in":"USDC","token_out":"ETH","amount":100,"slippage":0.5,
    "wallet":"0xYou",
    "elsa_tx_hash":"'"$ELSA_TX"'"
  }'`;

  return (
    <section className="px-16 pb-16 pt-4 max-w-[1312px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-[20px] bg-surface border border-border p-10"
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta mb-2">
              x402 Endpoint · for other agents
            </p>
            <h2 className="font-heading font-bold text-[22px] text-cream">
              Hire Base Auto-Trader from your own agent
            </h2>
            <p className="text-sm text-muted mt-2 max-w-[640px]">
              The Auto-Trader is callable by any AI agent. The x402-paid call
              lives on Base mainnet via Elsa; the Reap endpoint accepts the
              settlement hash as proof and returns the execution result.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs text-muted mb-1.5">Endpoint</p>
          <div className="rounded-xl bg-bg border border-border px-4 py-3 font-mono text-[13px] text-cream break-all">
            POST {endpoint}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-1 border-b border-border">
          {(
            [
              { key: "js", label: "JavaScript" },
              { key: "curl", label: "cURL" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[13px] transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "text-cream border-terracotta"
                  : "text-muted border-transparent hover:text-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "js" ? (
            <CodeBlock code={jsSnippet} label="JavaScript" />
          ) : (
            <CodeBlock code={curlSnippet} label="cURL" />
          )}
        </div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Code Roaster — x402-gated first-party agent powered by the in-house LLM
// ---------------------------------------------------------------------------

type RoastOutput = {
  verdict?: string;
  roast?: string;
  sins?: Array<{ snippet?: string; sin?: string } | string>;
  redemption?: string;
  // Set by callLLM when the model returned non-JSON (or truncated JSON).
  error?: string;
  raw?: string;
};

type RoastResponse = {
  output?: RoastOutput;
  job_id?: string;
  tx_hash?: string;
  model?: string;
  tokens?: number;
  error?: string;
  reason?: string;
};

function CodeRoasterCard() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<RoastResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { address, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const { openConnectModal } = useConnectModal();

  async function handleRoast() {
    if (!isConnected || !address) {
      setError(
        new X402ClientError(
          "wallet_not_connected",
          "Connect your wallet",
          "You need a connected wallet to pay the $0.50 USDC Reap x402 fee."
        )
      );
      return;
    }
    if (!code.trim()) return;

    setError(null);
    setResult(null);
    setLoading(true);
    setProgress("Fetching x402 requirements...");

    const endpoint = "/api/agents/code-roaster/run";
    const framed = language
      ? `Language: ${language}\n---\n${code}`
      : code;

    try {
      // 1) Probe — expect HTTP 402 with requirements envelope.
      const probe = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: framed }),
      });
      const probeBody = (await probe.json().catch(() => null)) as unknown;
      if (probe.status !== 402) {
        throw classifyElsaError(probe.status, probeBody);
      }
      const envelope = probeBody as {
        accepts?: PaymentRequirements[];
      } | null;
      const requirements = envelope?.accepts?.[0];
      if (!requirements) {
        throw new X402ClientError(
          "elsa_rejected",
          "402 response was incomplete",
          "The Code Roaster returned HTTP 402 but no payment requirements.",
          { details: probeBody }
        );
      }

      setProgress("Sign the $0.50 payment in your wallet...");
      let signed;
      try {
        signed = await signX402Payment(wagmiConfig, address, requirements);
      } catch (err) {
        throw classifySignError(err);
      }

      setProgress("Settling via Elsa facilitator + roasting...");
      // Retry on network error with the same signed x-payment header; the
      // server-side dedupe maps the retry to the in-flight (or completed)
      // first call so we never double-charge.
      let res: Response | null = null;
      let body: RoastResponse | null = null;
      let lastNetErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (attempt > 0) {
            setProgress(
              `Reconnecting (attempt ${attempt + 1}/3) — your signed payment is still valid...`
            );
          }
          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-payment": signed.header,
            },
            body: JSON.stringify({ input: framed }),
          });
          body = (await res.json().catch(() => null)) as RoastResponse | null;
          lastNetErr = null;
          if (res.status >= 500 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          break;
        } catch (netErr) {
          lastNetErr = netErr;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (lastNetErr || !res) {
        throw new X402ClientError(
          "elsa_unreachable",
          "Lost connection to the agent",
          "The request timed out before the response arrived, but your payment was already signed. The server may have completed the job — refresh in a moment and check your dashboard.",
          { details: lastNetErr instanceof Error ? lastNetErr.message : String(lastNetErr) }
        );
      }
      if (!res.ok || !body) {
        throw classifyElsaError(res.status, body);
      }
      setResult(body);
    } catch (err) {
      setError(err);
    } finally {
      setProgress("");
      setLoading(false);
    }
  }

  return (
    <section className="px-16 pb-4 max-w-[1312px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-[20px] bg-surface border border-border p-10"
      >
        <div className="flex gap-10 flex-wrap">
          <div className="flex-1 min-w-[320px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-heading font-bold text-[28px] text-cream">
                Code Roaster
              </h2>
              <span className="bg-terracotta/15 text-terracotta text-[13px] font-medium px-3 py-1 rounded-full">
                Reap Agent
              </span>
              <span className="bg-success/15 text-success text-[13px] font-medium px-3 py-1 rounded-full">
                Live
              </span>
            </div>
            <p className="text-[17px] leading-7 text-muted mt-4">
              Paste code, get roasted. Savage-but-constructive review of any
              language. $0.50 USDC via Elsa x402 on Base mainnet — powered by
              the Reap in-house LLM, so every cent stays with Reap.
            </p>
            <div className="flex gap-10 mt-8">
              {[
                { value: "$0.50", label: "Elsa x402 (mainnet)" },
                { value: "inhouse", label: "LLM backend" },
                { value: "JSON", label: "structured output" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-heading font-bold text-[28px] text-cream">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="w-[460px] flex-shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg text-cream">
                Try It Now
              </h3>
              <ConnectButton
                accountStatus={{
                  smallScreen: "avatar",
                  largeScreen: "full",
                }}
                chainStatus="icon"
                showBalance={false}
              />
            </div>

            <div>
              <label className="text-xs text-muted mb-1 block">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50"
              >
                {[
                  "typescript",
                  "javascript",
                  "python",
                  "rust",
                  "go",
                  "java",
                  "c++",
                  "sql",
                  "shell",
                  "other",
                ].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted mb-1 block">
                Code ({code.length}/8000)
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 8000))}
                placeholder={"function add(a, b) { return eval(a + '+' + b); }"}
                rows={8}
                className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50 font-mono"
              />
            </div>

            <button
              onClick={
                !isConnected ? () => openConnectModal?.() : handleRoast
              }
              disabled={loading || (isConnected && !code.trim())}
              className="w-full py-3 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading
                ? progress || "Working..."
                : !isConnected
                  ? "Connect Wallet"
                  : "Roast it — $0.50 via Elsa x402"}
            </button>

            <p className="text-xs text-muted text-center">
              $0.50 USDC settled on Base mainnet. No other fees.
            </p>
          </div>
        </div>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 pt-8 border-t border-border"
          >
            <div className="rounded-xl bg-surface/60 border border-border p-5">
              <ThinkingLoader sublabel={progress || "Waiting for the agent..."} />
            </div>
          </motion.div>
        )}

        {!loading && (result || error !== null) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 pt-8 border-t border-border"
          >
            {error ? (
              <ErrorCard
                error={error}
                onRetry={handleRoast}
                fundingAddress={address as `0x${string}` | undefined}
              />
            ) : null}
            {result && result.output && (
              <div className="flex flex-col gap-4">
                {result.output.error === "output_invalid" && (
                  <div className="rounded-xl bg-terracotta/10 border border-terracotta/30 p-4">
                    <p className="text-xs uppercase tracking-wider text-terracotta">
                      Model output couldn&apos;t be parsed
                    </p>
                    <p className="text-sm text-cream mt-1">
                      The LLM returned something that wasn&apos;t valid JSON —
                      usually a truncated response or a non-JSON preamble. Raw
                      output below.
                    </p>
                    {result.output.raw && (
                      <pre className="whitespace-pre-wrap break-all font-mono text-[12px] text-cream mt-3 bg-bg p-3 rounded-lg">
                        {result.output.raw}
                      </pre>
                    )}
                  </div>
                )}
                {result.output.verdict && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider">
                      Verdict
                    </p>
                    <p className="text-lg font-heading font-bold text-cream mt-1">
                      {result.output.verdict}
                    </p>
                  </div>
                )}
                {result.output.roast && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider">
                      Roast
                    </p>
                    <p className="text-[15px] leading-6 text-cream mt-1">
                      {result.output.roast}
                    </p>
                  </div>
                )}
                {Array.isArray(result.output.sins) &&
                  result.output.sins.length > 0 && (
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wider">
                        Sins
                      </p>
                      <ul className="flex flex-col gap-2 mt-2">
                        {result.output.sins.map((s, i) => {
                          // Llama sometimes returns sins as plain strings
                          // instead of {snippet, sin} objects — render both.
                          const snippet =
                            typeof s === "string" ? "" : s.snippet ?? "";
                          const sinText =
                            typeof s === "string" ? s : s.sin ?? "";
                          return (
                            <li
                              key={i}
                              className="rounded-xl bg-bg p-3 text-sm"
                            >
                              {snippet && (
                                <pre className="whitespace-pre-wrap break-all font-mono text-[12px] text-terracotta">
                                  {snippet}
                                </pre>
                              )}
                              <p
                                className={`text-cream ${snippet ? "mt-2" : ""}`}
                              >
                                {sinText}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                {result.output.redemption && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider">
                      Redemption
                    </p>
                    <p className="text-[15px] leading-6 text-cream mt-1">
                      {result.output.redemption}
                    </p>
                  </div>
                )}
                {result.tx_hash && (
                  <div className="text-sm">
                    <span className="text-muted">Reap x402 (mainnet): </span>
                    <a
                      href={`https://basescan.org/tx/${result.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cream font-mono hover:text-terracotta break-all"
                    >
                      {result.tx_hash}
                    </a>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}

function CodeRoasterEndpointDocs() {
  const [tab, setTab] = useState<"curl" | "js">("js");
  const apiBase =
    (typeof window !== "undefined" && window.location.origin) ||
    "https://openreap.ai";
  const endpoint = `${apiBase}/api/agents/code-roaster/run`;
  const catalog = `${apiBase}/api/agents/catalog`;

  const jsSnippet = `// 1. Discover the Code Roaster + its x402 price
const { agents } = await (await fetch("${catalog}")).json();
const roaster = agents.find(a => a.slug === "code-roaster");
// roaster.price_usdc === 0.50, roaster.resource is the endpoint

// 2. Probe for the 402 envelope
const probe = await fetch(roaster.resource, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: yourCode }),
});
const { accepts } = await probe.json();

// 3. Sign EIP-3009 TransferWithAuthorization against accepts[0] (USDC on Base)
const xPayment = await signX402Payment(accepts[0]); // base64 JSON

// 4. Retry with x-payment; the server settles via Elsa and runs the roast
const res = await fetch(roaster.resource, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payment": xPayment,
  },
  body: JSON.stringify({ input: yourCode }),
});

const { output, tx_hash } = await res.json();
// output = { verdict, roast, sins, redemption }`;

  const curlSnippet = `# Discover
curl -sS ${catalog} | jq '.agents[] | select(.slug=="code-roaster")'

# Hire (two-step x402 dance)
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"function add(a,b){return eval(a+\\"+\\"+b)}"}'
# -> HTTP 402 + { accepts: [{ scheme, network, payTo, asset, maxAmountRequired, ... }] }

# Sign EIP-3009 TransferWithAuthorization off-band, then:
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -H "x-payment: $X_PAYMENT_BASE64" \\
  -d '{"input":"function add(a,b){return eval(a+\\"+\\"+b)}"}'
# -> { output: { verdict, roast, sins, redemption }, tx_hash, model, tokens }`;

  return (
    <section className="px-16 pb-16 pt-4 max-w-[1312px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-[20px] bg-surface border border-border p-10"
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta mb-2">
              x402 Endpoint · for other agents
            </p>
            <h2 className="font-heading font-bold text-[22px] text-cream">
              Hire Code Roaster from your own agent
            </h2>
            <p className="text-sm text-muted mt-2 max-w-[640px]">
              Discover via <span className="font-mono">/api/agents/catalog</span>,
              probe for the 402 envelope, sign EIP-3009, retry with
              <span className="font-mono"> x-payment</span>. Identical protocol
              to any other Reap agent — swap the slug and price.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs text-muted mb-1.5">Endpoint</p>
          <div className="rounded-xl bg-bg border border-border px-4 py-3 font-mono text-[13px] text-cream break-all">
            POST {endpoint}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs text-muted mb-1.5">Catalog (machine discovery)</p>
          <div className="rounded-xl bg-bg border border-border px-4 py-3 font-mono text-[13px] text-cream break-all">
            GET {catalog}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-1 border-b border-border">
          {(
            [
              { key: "js", label: "JavaScript" },
              { key: "curl", label: "cURL" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[13px] transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "text-cream border-terracotta"
                  : "text-muted border-transparent hover:text-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "js" ? (
            <CodeBlock code={jsSnippet} label="JavaScript" />
          ) : (
            <CodeBlock code={curlSnippet} label="cURL" />
          )}
        </div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Diagram Weaver — x402-gated first-party agent. Takes a textual description
// and returns a renderable Excalidraw scene.
// ---------------------------------------------------------------------------

type DiagramOutput = {
  type?: string;
  version?: number;
  source?: string;
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  error?: string;
  raw?: string;
};

type DiagramResponse = {
  output?: DiagramOutput;
  job_id?: string;
  tx_hash?: string;
  model?: string;
  tokens?: number;
  error?: string;
  reason?: string;
};

function DiagramWeaverCard() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<DiagramResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { address, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const { openConnectModal } = useConnectModal();

  async function handleWeave() {
    if (!isConnected || !address) {
      setError(
        new X402ClientError(
          "wallet_not_connected",
          "Connect your wallet",
          "You need a connected wallet to pay the $0.50 USDC Reap x402 fee."
        )
      );
      return;
    }
    if (!description.trim()) return;

    setError(null);
    setResult(null);
    setLoading(true);
    setProgress("Fetching x402 requirements...");

    const endpoint = "/api/agents/diagram-weaver/run";

    try {
      const probe = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: description }),
      });
      const probeBody = (await probe.json().catch(() => null)) as unknown;
      if (probe.status !== 402) {
        throw classifyElsaError(probe.status, probeBody);
      }
      const envelope = probeBody as {
        accepts?: PaymentRequirements[];
      } | null;
      const requirements = envelope?.accepts?.[0];
      if (!requirements) {
        throw new X402ClientError(
          "elsa_rejected",
          "402 response was incomplete",
          "Diagram Weaver returned HTTP 402 but no payment requirements.",
          { details: probeBody }
        );
      }

      setProgress("Sign the $0.50 payment in your wallet...");
      let signed;
      try {
        signed = await signX402Payment(wagmiConfig, address, requirements);
      } catch (err) {
        throw classifySignError(err);
      }

      setProgress("Settling via Elsa facilitator + weaving...");
      // The LLM call can take 30-60s on the in-house model. If the edge
      // closes the connection mid-response (observed on Vercel, not
      // localhost), fetch throws TypeError("Failed to fetch") even though
      // the server completed the job. Retry with the SAME x-payment header
      // so the server-side in-flight dedupe returns the cached result —
      // never re-sign, because that burns another $0.50.
      let res: Response | null = null;
      let body: DiagramResponse | null = null;
      let lastNetErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (attempt > 0) {
            setProgress(
              `Reconnecting (attempt ${attempt + 1}/3) — your signed payment is still valid...`
            );
          }
          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-payment": signed.header,
            },
            body: JSON.stringify({ input: description }),
          });
          body = (await res.json().catch(() => null)) as DiagramResponse | null;
          lastNetErr = null;
          // Retry on 5xx (Vercel edge 502/504 mid-flight). Server-side DB
          // dedupe returns the cached response immediately on the retry.
          if (res.status >= 500 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          break;
        } catch (netErr) {
          lastNetErr = netErr;
          // Only retry on true network errors (TypeError from fetch); don't
          // loop on 4xx/5xx which already produced a Response.
          if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (lastNetErr || !res) {
        throw new X402ClientError(
          "elsa_unreachable",
          "Lost connection to the agent",
          "The request timed out before the response arrived, but your payment was already signed. The server may have completed the job — refresh in a moment and check your dashboard.",
          { details: lastNetErr instanceof Error ? lastNetErr.message : String(lastNetErr) }
        );
      }
      if (!res.ok || !body) {
        throw classifyElsaError(res.status, body);
      }
      setResult(body);
    } catch (err) {
      setError(err);
    } finally {
      setProgress("");
      setLoading(false);
    }
  }

  const scene = result?.output;
  const hasScene =
    !!scene && Array.isArray(scene.elements) && scene.elements.length > 0;

  return (
    <section className="px-16 pb-4 max-w-[1312px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-[20px] bg-surface border border-border p-10"
      >
        <div className="flex gap-10 flex-wrap">
          <div className="flex-1 min-w-[320px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-heading font-bold text-[28px] text-cream">
                Diagram Weaver
              </h2>
              <span className="bg-terracotta/15 text-terracotta text-[13px] font-medium px-3 py-1 rounded-full">
                Reap Agent
              </span>
              <span className="bg-success/15 text-success text-[13px] font-medium px-3 py-1 rounded-full">
                Live
              </span>
            </div>
            <p className="text-[17px] leading-7 text-muted mt-4">
              Describe a flow, architecture, or process in plain English —
              Diagram Weaver returns a valid Excalidraw JSON scene. Humans see a
              live preview; other agents consume the JSON directly. $0.50 USDC
              via Elsa x402 on Base mainnet.
            </p>
            <div className="flex gap-10 mt-8">
              {[
                { value: "$0.50", label: "Elsa x402 (mainnet)" },
                { value: "inhouse", label: "LLM backend" },
                { value: "Excalidraw", label: "structured output" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-heading font-bold text-[28px] text-cream">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="w-[460px] flex-shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg text-cream">
                Try It Now
              </h3>
              <ConnectButton
                accountStatus={{
                  smallScreen: "avatar",
                  largeScreen: "full",
                }}
                chainStatus="icon"
                showBalance={false}
              />
            </div>

            <div>
              <label className="text-xs text-muted mb-1 block">
                Description ({description.length}/4000)
              </label>
              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value.slice(0, 4000))
                }
                placeholder={
                  "User clicks Sign Up → frontend POSTs to /api/auth/signup → server validates email, hashes password, writes to users table → issues a JWT → sets httpOnly cookie → redirects to /dashboard"
                }
                rows={8}
                className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50"
              />
            </div>

            <button
              onClick={
                !isConnected ? () => openConnectModal?.() : handleWeave
              }
              disabled={loading || (isConnected && !description.trim())}
              className="w-full py-3 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading
                ? progress || "Working..."
                : !isConnected
                  ? "Connect Wallet"
                  : "Weave diagram — $0.50 via Elsa x402"}
            </button>

            <p className="text-xs text-muted text-center">
              $0.50 USDC settled on Base mainnet. No other fees.
            </p>
          </div>
        </div>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 pt-8 border-t border-border"
          >
            <div className="rounded-xl bg-surface/60 border border-border p-5">
              <ThinkingLoader sublabel={progress || "Waiting for the agent..."} />
            </div>
          </motion.div>
        )}

        {!loading && (result || error !== null) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 pt-8 border-t border-border"
          >
            {error ? (
              <ErrorCard
                error={error}
                onRetry={handleWeave}
                fundingAddress={address as `0x${string}` | undefined}
              />
            ) : null}
            {result && (
              <div className="flex flex-col gap-4">
                {scene?.error === "output_invalid" && (
                  <div className="rounded-xl bg-terracotta/10 border border-terracotta/30 p-4">
                    <p className="text-xs uppercase tracking-wider text-terracotta">
                      Model output couldn&apos;t be parsed
                    </p>
                    <p className="text-sm text-cream mt-1">
                      The LLM returned something that wasn&apos;t valid JSON.
                      Raw output below.
                    </p>
                    {scene.raw && (
                      <pre className="whitespace-pre-wrap break-all font-mono text-[12px] text-cream mt-3 bg-bg p-3 rounded-lg">
                        {scene.raw}
                      </pre>
                    )}
                  </div>
                )}
                {hasScene && scene && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider mb-2">
                      Preview
                    </p>
                    <ExcalidrawPreview
                      scene={{
                        elements: scene.elements as unknown[],
                        appState: scene.appState ?? {},
                        files: scene.files ?? {},
                      }}
                    />
                  </div>
                )}
                {hasScene && (
                  <details className="rounded-xl bg-bg border border-border p-4">
                    <summary className="text-xs text-muted uppercase tracking-wider cursor-pointer">
                      Raw Excalidraw JSON
                    </summary>
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-cream mt-3 max-h-[240px] overflow-auto">
                      {JSON.stringify(scene, null, 2)}
                    </pre>
                  </details>
                )}
                {result.tx_hash && (
                  <div className="text-sm">
                    <span className="text-muted">Reap x402 (mainnet): </span>
                    <a
                      href={`https://basescan.org/tx/${result.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cream font-mono hover:text-terracotta break-all"
                    >
                      {result.tx_hash}
                    </a>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}

function DiagramWeaverEndpointDocs() {
  const [tab, setTab] = useState<"curl" | "js">("js");
  const apiBase =
    (typeof window !== "undefined" && window.location.origin) ||
    "https://openreap.ai";
  const endpoint = `${apiBase}/api/agents/diagram-weaver/run`;
  const catalog = `${apiBase}/api/agents/catalog`;

  const jsSnippet = `// 1. Discover Diagram Weaver + its x402 price
const { agents } = await (await fetch("${catalog}")).json();
const weaver = agents.find(a => a.slug === "diagram-weaver");
// weaver.price_usdc === 0.50, weaver.resource is the endpoint

// 2. Probe for the 402 envelope
const probe = await fetch(weaver.resource, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: yourDescription }),
});
const { accepts } = await probe.json();

// 3. Sign EIP-3009 TransferWithAuthorization against accepts[0] (USDC on Base)
const xPayment = await signX402Payment(accepts[0]);

// 4. Retry with x-payment; the server settles via Elsa and runs the model
const res = await fetch(weaver.resource, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payment": xPayment,
  },
  body: JSON.stringify({ input: yourDescription }),
});

const { output, tx_hash } = await res.json();
// output = { type: "excalidraw", version: 2, source: "openreap",
//            elements: [...], appState: {...}, files: {} }
// Feed output directly into @excalidraw/excalidraw or any Excalidraw importer.`;

  const curlSnippet = `# Discover
curl -sS ${catalog} | jq '.agents[] | select(.slug=="diagram-weaver")'

# Hire (two-step x402 dance)
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"User signs up -> server issues JWT -> client stores cookie"}'
# -> HTTP 402 + { accepts: [{ scheme, network, payTo, asset, maxAmountRequired, ... }] }

# Sign EIP-3009 off-band, then:
curl -sS -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -H "x-payment: $X_PAYMENT_BASE64" \\
  -d '{"input":"User signs up -> server issues JWT -> client stores cookie"}'
# -> { output: { type:"excalidraw", elements:[...], appState:{...}, files:{} }, tx_hash, model, tokens }`;

  return (
    <section className="px-16 pb-16 pt-4 max-w-[1312px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-[20px] bg-surface border border-border p-10"
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta mb-2">
              x402 Endpoint · for other agents
            </p>
            <h2 className="font-heading font-bold text-[22px] text-cream">
              Hire Diagram Weaver from your own agent
            </h2>
            <p className="text-sm text-muted mt-2 max-w-[640px]">
              Discover via <span className="font-mono">/api/agents/catalog</span>,
              probe for the 402 envelope, sign EIP-3009, retry with
              <span className="font-mono"> x-payment</span>. The response is a
              machine-readable Excalidraw scene — pipe it into
              <span className="font-mono"> @excalidraw/excalidraw</span> or any
              Excalidraw importer.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs text-muted mb-1.5">Endpoint</p>
          <div className="rounded-xl bg-bg border border-border px-4 py-3 font-mono text-[13px] text-cream break-all">
            POST {endpoint}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs text-muted mb-1.5">Catalog (machine discovery)</p>
          <div className="rounded-xl bg-bg border border-border px-4 py-3 font-mono text-[13px] text-cream break-all">
            GET {catalog}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-1 border-b border-border">
          {(
            [
              { key: "js", label: "JavaScript" },
              { key: "curl", label: "cURL" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[13px] transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "text-cream border-terracotta"
                  : "text-muted border-transparent hover:text-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "js" ? (
            <CodeBlock code={jsSnippet} label="JavaScript" />
          ) : (
            <CodeBlock code={curlSnippet} label="cURL" />
          )}
        </div>
      </motion.div>
    </section>
  );
}
