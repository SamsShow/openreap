"use client";

import { useState } from "react";

type Unknown = Record<string, unknown>;

interface Props {
  result: Unknown;
}

export function AgentResultCard({ result }: Props) {
  const output = (result.output ?? result) as unknown;
  const txHash = typeof result.tx_hash === "string" ? result.tx_hash : null;
  const jobId = typeof result.job_id === "string" ? result.job_id : null;
  const model = typeof result.model === "string" ? result.model : null;
  const tokens = typeof result.tokens === "number" ? result.tokens : null;

  return (
    <div className="rounded-xl bg-surface p-5 flex flex-col gap-4">
      <OutputBody output={output} />

      {(jobId || model || tokens !== null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono text-muted pt-3 border-t border-border">
          {jobId && (
            <span>
              job <span className="text-cream">{jobId.slice(0, 8)}</span>
            </span>
          )}
          {model && (
            <span>
              model <span className="text-cream">{model}</span>
            </span>
          )}
          {tokens !== null && (
            <span>
              tokens <span className="text-cream">{tokens.toLocaleString()}</span>
            </span>
          )}
        </div>
      )}

      {txHash && (
        <a
          href={`https://basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-terracotta hover:underline text-xs font-mono self-start"
        >
          View settlement tx on BaseScan ↗
        </a>
      )}
    </div>
  );
}

function OutputBody({ output }: { output: unknown }) {
  if (typeof output === "string") {
    return <MarkdownText text={output} />;
  }

  if (!output || typeof output !== "object") {
    return <RawJson value={output} />;
  }

  const obj = output as Unknown;

  // Agent signalled out-of-scope — render as a soft callout rather than an
  // error, since the payment settled and the agent just declined the job.
  if (obj.error === "out_of_scope") {
    const msg =
      (typeof obj.message === "string" && obj.message) ||
      (typeof obj.reason === "string" && obj.reason) ||
      "This request is out of scope for this agent.";
    return (
      <Callout tone="warn" title="Out of scope">
        {msg}
      </Callout>
    );
  }

  if (typeof obj.error === "string") {
    const msg =
      (typeof obj.message === "string" && obj.message) ||
      (typeof obj.reason === "string" && obj.reason) ||
      obj.error;
    return (
      <Callout tone="error" title={obj.error}>
        {msg}
      </Callout>
    );
  }

  // Structured findings list — the contract-review skills return this shape.
  if (Array.isArray(obj.findings)) {
    return <FindingsList findings={obj.findings as Unknown[]} />;
  }

  // Common "just text" output shapes. Agents vary, so we try a few keys.
  for (const key of ["answer", "summary", "text", "message", "output"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim().length > 0) {
      return <MarkdownText text={v} />;
    }
  }

  return <RawJson value={obj} />;
}

function MarkdownText({ text }: { text: string }) {
  return (
    <p className="text-[15px] leading-7 text-cream whitespace-pre-wrap break-words">
      {text}
    </p>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "warn" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "warn"
      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
      : "bg-red-500/10 border-red-500/30 text-red-300";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-1">
        {title.replace(/_/g, " ")}
      </p>
      <p className="text-[14px] leading-6 text-cream">{children}</p>
    </div>
  );
}

function FindingsList({ findings }: { findings: Unknown[] }) {
  return (
    <div className="flex flex-col gap-3">
      {findings.map((f, i) => {
        const sev = String(f.severity ?? "").toUpperCase();
        const text = String(f.text ?? f.message ?? f.description ?? "");
        const badge =
          sev === "HIGH"
            ? "bg-red-500/15 text-red-400"
            : sev === "MED" || sev === "MEDIUM"
              ? "bg-yellow-500/15 text-yellow-400"
              : "bg-blue-500/15 text-blue-400";
        return (
          <div key={i} className="flex items-start gap-3">
            {sev && (
              <span
                className={`${badge} text-[11px] font-bold px-2 py-0.5 rounded flex-shrink-0`}
              >
                {sev}
              </span>
            )}
            <p className="text-[14px] leading-6 text-cream">{text}</p>
          </div>
        );
      })}
    </div>
  );
}

function RawJson({ value }: { value: unknown }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] font-mono text-muted hover:text-cream mb-2"
      >
        {open ? "▾" : "▸"} raw response
      </button>
      {open && (
        <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-cream/80 bg-bg rounded-lg p-3">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
