"use client";

import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  /** Small label shown above the block (e.g. "cURL", "JavaScript"). */
  label?: string;
}

export function CodeBlock({ code, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  return (
    <div className="rounded-xl bg-bg border border-border overflow-hidden">
      {(label || true) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/40">
          {label && (
            <span className="text-[11px] font-medium tracking-wider uppercase text-muted">
              {label}
            </span>
          )}
          <button
            onClick={copy}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted hover:text-cream hover:border-terracotta/60 transition-colors ml-auto"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre className="p-4 text-[12px] leading-5 text-cream font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
