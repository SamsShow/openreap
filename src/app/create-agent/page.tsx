"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { DashNav } from "@/components/DashNav";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const SAMPLE_SKILL = `## meta
name: "Commercial Contract Review"
version: "1.0"
author: "Sarah Mitchell, Attorney"
price_usdc: 5.00
category: "legal"
model_tier: "standard"

## service
description: |
  Reviews NDAs, service agreements, and vendor contracts for tech startups. Flags risk clauses, indemnity issues, and suggests protective edits. Specializes in SaaS and technology contracts.

accepts:
  - NDA and confidentiality agreements
  - Service and vendor agreements
  - Software license agreements

rejects:
  - Documents longer than 20 pages
  - Non-English documents

## output_format
{
  "risk_score": "Low|Medium|High",
  "flagged_clauses": [{"clause": "...", "issue": "...", "fix": "..."}],
  "summary": "2-3 sentence plain English"
}

## examples
example_1:
  input: "NDA with unlimited liability and no term limit"
  output: '{"risk_score":"High","flagged_clauses":[{"clause":"Unlimited liability","issue":"No cap on indemnity","fix":"Add liability ceiling of 2x contract value"}],"summary":"High-risk NDA with uncapped liability."}'

example_2:
  input: "Standard SaaS agreement, Indian jurisdiction"
  output: '{"risk_score":"Low","flagged_clauses":[],"summary":"Standard agreement with appropriate protections."}'

## escalate_if
- Contract value exceeds $100K
- Government entity as a party`;

type ParsedAgent = {
  meta: { name: string; price_usdc: number; category: string; model_tier: string; author: string };
  service: { description: string; accepts: string[]; rejects: string[] };
  escalate_patterns: string[];
};

type ValidationItem = { field: string; message: string; blocking: boolean };

type TestResult = {
  content?: object;
  tokens?: number;
  cost_usdc?: number;
  model?: string;
  error?: string;
};

export default function CreateAgentPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ display_name: string | null; email: string } | null>(null);
  const [skillMd, setSkillMd] = useState("");
  const [step, setStep] = useState(1);
  const [parsing, setParsing] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [parsed, setParsed] = useState<ParsedAgent | null>(null);
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [warnings, setWarnings] = useState<ValidationItem[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [agent, setAgent] = useState<{ slug: string; name: string; status: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setUser({ display_name: d.user.display_name, email: d.user.email });
        else router.push("/auth");
      })
      .catch(() => router.push("/auth"));
  }, [router]);

  async function handleParse() {
    setError("");
    setParsing(true);
    setParsed(null);
    setTestResult(null);
    setValidations([]);
    setWarnings([]);

    try {
      const res = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillMd }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setValidations(data.details.filter((e: ValidationItem) => e.blocking));
          setWarnings(data.details.filter((e: ValidationItem) => !e.blocking));
        }
        setError(data.error || "Parse failed");
        return;
      }

      setParsed(data.parsed);
      setWarnings(data.warnings || []);
      setTestResult(data.testResult);
      setAgent(data.agent);
      setStep(2);

      // All green validations
      const greens: ValidationItem[] = [
        { field: "sections", message: "Required sections present", blocking: false },
        { field: "price", message: `Valid price (${data.parsed.meta.price_usdc} USDC)`, blocking: false },
        { field: "category", message: `Category: ${data.parsed.meta.category}`, blocking: false },
        { field: "output", message: "Output format is valid JSON", blocking: false },
        { field: "examples", message: `${data.parsed.examples?.length || 0} examples found`, blocking: false },
        { field: "escalate", message: `${data.parsed.escalate_patterns?.length || 0} escalation rules`, blocking: false },
      ];
      setValidations(greens);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setParsing(false);
    }
  }

  async function handleGoLive() {
    if (!agent) return;
    setGoingLive(true);
    setError("");

    try {
      const res = await fetch(`/api/agents/${agent.slug}/approve`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to go live");
        return;
      }

      setStep(3);
      setTimeout(() => router.push(`/agents/${agent.slug}`), 2000);
    } catch {
      setError("Network error.");
    } finally {
      setGoingLive(false);
    }
  }

  const modelLabel = parsed?.meta.model_tier === "pro" ? "Claude Haiku 3.5 (pro)" : "Llama 3.1 8B (free)";

  return (
    <div className="min-h-screen bg-bg">
      <DashNav user={user || undefined} />

      <div className="max-w-[1312px] mx-auto px-16">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="pt-12 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-terracotta" />
            <span className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta">Create Your Agent</span>
          </div>
          <h1 className="font-heading font-bold text-[36px] leading-[44px] tracking-[-0.02em] text-cream">Upload your SKILL.md</h1>
          <p className="text-[15px] leading-6 text-muted max-w-[560px] mt-2">
            Paste your SKILL.md content below. We&apos;ll parse it, validate, run a test job with your first example, and show you the results before going live.
          </p>
        </motion.div>

        {/* Step Indicators */}
        <div className="flex items-center gap-0 py-8">
          {[
            { num: 1, label: "Upload SKILL.md" },
            { num: 2, label: "Review & Test" },
            { num: 3, label: "Go Live" },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center">
              {i > 0 && <div className="w-20 h-px bg-border mx-4" />}
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= s.num ? "bg-terracotta" : "border-[1.5px] border-border"}`}>
                  <span className={`font-heading font-bold text-sm ${step >= s.num ? "text-off-white" : "text-subtle"}`}>{s.num}</span>
                </div>
                <span className={`text-sm font-medium ${step >= s.num ? "text-cream" : "text-subtle"}`}>{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex gap-6 pb-8">
          {/* Left — Editor */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-cream">SKILL.md Content</span>
              <button
                onClick={() => setSkillMd(SAMPLE_SKILL)}
                className="text-[13px] text-terracotta hover:underline cursor-pointer"
              >
                Use a template →
              </button>
            </div>
            <textarea
              value={skillMd}
              onChange={(e) => setSkillMd(e.target.value)}
              placeholder="Paste your SKILL.md here..."
              className="w-full min-h-[400px] p-5 rounded-[14px] bg-bg border-[1.5px] border-border text-[13px] leading-5 text-cream font-mono placeholder:text-muted/40 outline-none focus:border-terracotta/50 resize-y"
            />
            <div className="flex gap-3">
              <button
                onClick={handleParse}
                disabled={parsing || !skillMd.trim()}
                className="px-8 py-3 bg-terracotta rounded-full text-[15px] font-medium text-off-white shadow-[0_4px_20px_#C8553D4D] hover:shadow-[0_4px_28px_#C8553D66] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {parsing ? "Parsing..." : "Parse & Test Agent"}
              </button>
              <button
                onClick={() => { setSkillMd(""); setParsed(null); setTestResult(null); setValidations([]); setStep(1); setError(""); }}
                className="px-6 py-3 rounded-full border border-border text-[15px] text-muted hover:text-cream transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Right — Validation + Parsed */}
          <div className="w-[400px] flex-shrink-0 flex flex-col gap-4">
            <span className="text-sm font-medium text-cream">Validation</span>
            <div className="flex flex-col gap-2 p-5 bg-surface rounded-[14px] border border-border min-h-[120px]">
              {validations.length === 0 && !error && (
                <span className="text-[13px] text-muted">Click &quot;Parse &amp; Test&quot; to validate</span>
              )}
              {error && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-[13px] text-red-400">{error}</span>
                </div>
              )}
              {validations.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${v.blocking ? "bg-red-400" : "bg-success"}`} />
                  <span className={`text-[13px] ${v.blocking ? "text-red-400" : "text-cream"}`}>{v.message}</span>
                </div>
              ))}
              {warnings.map((w, i) => (
                <div key={`w-${i}`} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                  <span className="text-[13px] text-yellow-400">{w.message}</span>
                </div>
              ))}
            </div>

            {parsed && (
              <>
                <span className="text-sm font-medium text-cream">Parsed Agent</span>
                <div className="flex flex-col gap-3 p-5 bg-surface rounded-[14px] border border-border">
                  {[
                    { label: "Name", value: parsed.meta.name },
                    { label: "Price", value: `$${parsed.meta.price_usdc} / job` },
                    { label: "Category", value: parsed.meta.category.charAt(0).toUpperCase() + parsed.meta.category.slice(1) },
                    { label: "Model", value: modelLabel },
                    { label: "Slug", value: agent?.slug || "—" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between">
                      <span className="text-[13px] text-muted">{row.label}</span>
                      <span className={`text-[13px] font-medium ${row.label === "Slug" ? "text-muted" : "text-cream"}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="pb-8">
            <span className="text-sm font-medium text-cream block mb-4">Test Job Output</span>
            <div className="flex flex-col gap-3 p-6 bg-surface rounded-[14px] border border-border">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold ${testResult.error ? "bg-red-500/15 text-red-400" : "bg-success/15 text-success"}`}>
                  {testResult.error ? "FAIL" : "PASS"}
                </span>
                <span className="text-[13px] text-muted">
                  Test ran with example_1 input
                  {testResult.model && ` • ${testResult.model}`}
                  {testResult.tokens && ` • ${testResult.tokens.toLocaleString()} tokens`}
                  {testResult.cost_usdc && ` • $${testResult.cost_usdc.toFixed(4)}`}
                </span>
              </div>
              <div className="p-4 bg-bg rounded-[10px]">
                <pre className="font-mono text-[13px] leading-5 text-cream whitespace-pre-wrap">
                  {testResult.error
                    ? JSON.stringify(testResult, null, 2)
                    : JSON.stringify(testResult.content, null, 2)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}

        {/* Go Live CTA */}
        {step >= 2 && agent && !testResult?.error && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-16"
          >
            {step === 3 ? (
              <div className="flex items-center justify-between p-8 bg-surface rounded-[20px] border-[1.5px] border-success shadow-[0_8px_40px_rgba(76,175,80,0.15)]">
                <div>
                  <h3 className="font-heading font-bold text-xl text-cream">Your agent is live!</h3>
                  <p className="text-sm text-muted mt-1">Redirecting to your agent profile...</p>
                </div>
                <Link
                  href={`/agents/${agent.slug}`}
                  className="px-8 py-3.5 bg-success rounded-full text-[15px] font-medium text-bg"
                >
                  View Agent →
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between p-8 bg-surface rounded-[20px] border-[1.5px] border-terracotta shadow-[0_8px_40px_#C8553D26]">
                <div>
                  <h3 className="font-heading font-bold text-xl text-cream">Ready to go live?</h3>
                  <p className="text-sm text-muted mt-1">
                    Your agent will be listed on the marketplace. Other AI agents can discover and hire it via Elsa x402.
                  </p>
                </div>
                <button
                  onClick={handleGoLive}
                  disabled={goingLive}
                  className="px-10 py-3.5 bg-terracotta rounded-full text-[16px] font-semibold text-off-white shadow-[0_4px_24px_#C8553D4D] hover:shadow-[0_4px_32px_#C8553D66] transition-shadow disabled:opacity-50 cursor-pointer flex-shrink-0"
                >
                  {goingLive ? "Publishing..." : "Go Live →"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
