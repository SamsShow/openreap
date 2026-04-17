"use client";

import { useState } from "react";
import { X402ClientError, type X402ErrorKind } from "@/lib/x402-errors";

interface ErrorCardProps {
  /** Any thrown value — X402ClientError gets rich treatment, others fall back. */
  error: unknown;
  /** Optional retry handler; renders a "Try again" button when provided. */
  onRetry?: () => void;
  /** Render the treasury address with a copy button (for insufficient_funds). */
  fundingAddress?: `0x${string}`;
}

const ICONS: Record<X402ErrorKind, string> = {
  insufficient_funds: "$",
  user_rejected: "×",
  wrong_network: "⇄",
  wallet_not_connected: "○",
  wallet_unauthorized: "⚠",
  elsa_unreachable: "!",
  elsa_rejected: "!",
  facilitator_failed: "!",
  agent_error: "!",
  invalid_input: "?",
  unknown: "!",
};

function toX402(error: unknown): X402ClientError {
  if (error instanceof X402ClientError) return error;
  const msg = error instanceof Error ? error.message : String(error);
  return new X402ClientError("unknown", "Something went wrong", msg, {
    details: error,
  });
}

export function ErrorCard({ error, onRetry, fundingAddress }: ErrorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const e = toX402(error);

  const isCopyable = e.kind === "insufficient_funds" && !!fundingAddress;

  async function copy() {
    if (!fundingAddress) return;
    try {
      await navigator.clipboard.writeText(fundingAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  return (
    <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-5">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center font-mono font-bold text-lg flex-shrink-0">
          {ICONS[e.kind] ?? "!"}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-heading font-bold text-[17px] text-red-300">
            {e.title}
          </h4>
          <p className="text-sm text-muted mt-1 leading-6 break-words">
            {e.message}
          </p>
          {e.hint && (
            <p className="text-xs text-muted/80 mt-2 italic">{e.hint}</p>
          )}

          {isCopyable && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <code className="bg-bg/60 border border-border/50 rounded-lg px-3 py-1.5 text-xs font-mono text-cream break-all">
                {fundingAddress}
              </code>
              <button
                onClick={copy}
                className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted hover:text-cream hover:border-terracotta/60 transition-colors"
              >
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs px-3 py-1.5 rounded-full bg-terracotta/90 text-off-white hover:bg-terracotta transition-colors"
              >
                Try again
              </button>
            )}
            {e.details !== undefined && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-muted hover:text-cream transition-colors"
              >
                {expanded ? "Hide details" : "Show details"}
              </button>
            )}
          </div>

          {expanded && e.details !== undefined && (
            <pre className="mt-3 rounded-lg bg-bg/60 border border-border/40 p-3 text-[11px] leading-5 text-muted overflow-x-auto whitespace-pre-wrap break-all max-h-[220px] overflow-y-auto">
              {typeof e.details === "string"
                ? e.details
                : JSON.stringify(e.details, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
