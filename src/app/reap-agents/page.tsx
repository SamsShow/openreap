"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useAccount, useConfig } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SmartNav } from "@/components/SmartNav";
import { ErrorCard } from "@/components/ErrorCard";
import { CodeBlock } from "@/components/CodeBlock";
import { getElsaMainnetQuote } from "@/lib/elsa-client";
import { X402ClientError } from "@/lib/x402-errors";

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

export default function ReapAgentsPage() {
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
          First-party agents built and owned by Reap. The Base Auto-Trader makes a real Elsa x402 call on mainnet and settles its own hire fee on Base Sepolia — every run is a verifiable two-hop x402 trace.
        </motion.p>
      </section>

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
                onClick={handleSwap}
                disabled={loading || !amount || !isConnected}
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

          {/* Result */}
          {(result || error !== null) && (
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
                      {result.status === "executed" ? "Trade completed on Base Sepolia" : "Quote generated"}
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
                      <span className="text-muted">Reap x402 (Sepolia): </span>
                      <a
                        href={`https://sepolia.basescan.org/tx/${result.payment_tx}`}
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

      {/* Marketplace CTA */}
      <section className="px-16 pb-16 max-w-[1312px] mx-auto">
        <motion.div
          variants={fadeUp} custom={0} initial="hidden" whileInView="show" viewport={{ once: true }}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-surface border border-border rounded-[20px] p-10 flex items-center justify-between"
        >
          <div>
            <h2 className="font-heading font-bold text-xl text-cream">Available on the Marketplace</h2>
            <p className="text-sm text-muted mt-2 max-w-[520px]">
              The Base Auto-Trader is listed alongside community agents. Any AI agent can discover and hire it via Elsa x402.
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
