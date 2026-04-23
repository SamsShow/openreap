"use client";

import Image from "next/image";

export type AgentCardData = {
  id: string;
  name: string;
  tagline: string;
  priceUsdc: number;
  slug: string;
  year?: number;
  artworkSrc?: string;
  logoSrc?: string;
};

const FRONT_SCRATCHES = [
  { y1: 120, y2: 105 },
  { y1: 240, y2: 232 },
  { y1: 380, y2: 372 },
  { y1: 520, y2: 528 },
  { y1: 660, y2: 652 },
  { y1: 800, y2: 808 },
  { y1: 900, y2: 892 },
] as const;

const BACK_SCRATCHES = FRONT_SCRATCHES;

function Crown({ color, size = 1 }: { color: string; size?: number }) {
  const tall = 18 * size;
  const dot = 5 * size;
  const gap = 4 * size;
  const w = 5 * size;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height: tall + dot }}>
      {[tall, dot, tall + 4, dot, tall, dot, tall + 4, dot, tall].map((h, i) => (
        <div
          key={i}
          style={{
            width: w,
            height: h,
            background: color,
            alignSelf: i % 2 === 1 ? "flex-start" : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function AgentCardFront({ data }: { data: AgentCardData }) {
  const artwork = data.artworkSrc || "/images/pixelhandshake.png";
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        width: 360,
        height: 490,
        borderRadius: 20,
        padding: 20,
        gap: 14,
        background:
          "linear-gradient(155deg,#E8E8EC 0%,#C8C8CC 35%,#D8D8DC 60%,#BFBFC4 100%)",
        boxShadow:
          "0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.15)",
      }}
    >
      {/* Brushed grain */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, rgba(0,0,0,0.04) 1px, rgba(255,255,255,0.06) 2px, rgba(0,0,0,0.03) 3px)",
          opacity: 0.7,
        }}
      />
      {/* Scratches */}
      <svg
        className="pointer-events-none absolute inset-0 w-full h-full"
        viewBox="0 0 720 980"
        preserveAspectRatio="none"
      >
        <g stroke="rgba(255,255,255,0.35)" strokeWidth={0.6} fill="none">
          {FRONT_SCRATCHES.map((s, i) => (
            <line key={`l-${i}`} x1={20 + i * 8} y1={s.y1} x2={680 + (i % 3) * 6} y2={s.y2} />
          ))}
        </g>
        <g stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} fill="none">
          {FRONT_SCRATCHES.map((s, i) => (
            <line key={`d-${i}`} x1={10 + i * 6} y1={s.y1 + 40} x2={690} y2={s.y2 + 36} />
          ))}
        </g>
      </svg>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div
          className="font-mono text-[13px] font-semibold whitespace-nowrap"
          style={{ color: "#1A1A1E", letterSpacing: "0.18em" }}
        >
          {data.id}
        </div>
        <Crown color="#1A1A1E" size={0.55} />
      </div>

      {/* Artwork */}
      <div
        className="relative z-10 w-full overflow-hidden"
        style={{
          aspectRatio: "1 / 1",
          borderRadius: 4,
          background: "linear-gradient(180deg,#0A0A0C 0%,#1C1410 100%)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.25)",
        }}
      >
        <div
          className="absolute top-2 left-2 font-mono text-[9px] z-10"
          style={{ letterSpacing: "0.2em", color: "rgba(255,255,255,0.22)" }}
        >
          REAP·CODA
        </div>
        <Image
          src={artwork}
          alt={data.name}
          fill
          sizes="360px"
          className="object-cover"
          unoptimized
        />
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-auto flex items-end justify-between">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div
            className="truncate"
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              fontSize: 30,
              lineHeight: "32px",
              color: "#0A0A0C",
              letterSpacing: "-0.01em",
            }}
          >
            {data.name}
          </div>
          <div
            className="font-mono text-[9px] font-medium uppercase"
            style={{ color: "#2A2A2E", letterSpacing: "0.16em", maxWidth: 170, lineHeight: "13px" }}
          >
            {data.tagline}
          </div>
          <div
            className="font-mono text-[9px] mt-1"
            style={{ color: "rgba(26,26,30,0.55)", letterSpacing: "0.16em" }}
          >
            {data.slug.slice(0, 8)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className="font-mono text-[9px]"
            style={{ color: "rgba(26,26,30,0.55)", letterSpacing: "0.18em" }}
          >
            {data.year || new Date().getFullYear()}
          </div>
          <div
            className="font-mono text-[13px] font-semibold"
            style={{
              padding: "8px 12px",
              background: "#0A0A0C",
              color: "#F2F2F4",
              borderRadius: 4,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            ${data.priceUsdc.toFixed(2)} / task
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentCardBack({ data }: { data: AgentCardData }) {
  const logo = data.logoSrc || "/images/logo.png";
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        width: 360,
        height: 490,
        borderRadius: 20,
        padding: 20,
        gap: 14,
        background:
          "linear-gradient(155deg,#2C2C30 0%,#1A1A1E 35%,#232326 60%,#141416 100%)",
        boxShadow:
          "0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)",
      }}
    >
      {/* Brushed grain */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.05) 1px, rgba(0,0,0,0.08) 2px, rgba(255,255,255,0.03) 3px)",
          opacity: 0.8,
        }}
      />
      {/* Scratches */}
      <svg
        className="pointer-events-none absolute inset-0 w-full h-full"
        viewBox="0 0 720 980"
        preserveAspectRatio="none"
      >
        <g stroke="rgba(255,255,255,0.18)" strokeWidth={0.6} fill="none">
          {BACK_SCRATCHES.map((s, i) => (
            <line key={`l-${i}`} x1={20 + i * 8} y1={s.y1} x2={680 + (i % 3) * 6} y2={s.y2} />
          ))}
        </g>
        <g stroke="rgba(0,0,0,0.45)" strokeWidth={0.5} fill="none">
          {BACK_SCRATCHES.map((s, i) => (
            <line key={`d-${i}`} x1={10 + i * 6} y1={s.y1 + 40} x2={690} y2={s.y2 + 36} />
          ))}
        </g>
      </svg>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <Crown color="rgba(230,230,234,0.55)" size={0.55} />
        <div
          className="font-mono text-[10px] uppercase"
          style={{ color: "rgba(230,230,234,0.45)", letterSpacing: "0.32em" }}
        >
          Certified · Agent
        </div>
      </div>

      {/* Seal */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="relative" style={{ width: 190, height: 190 }}>
          <div className="absolute inset-0 rounded-full" style={{ border: "1.5px solid rgba(230,230,234,0.45)" }} />
          <div className="absolute rounded-full" style={{ inset: 7, border: "1px solid rgba(230,230,234,0.22)" }} />
          <svg className="absolute inset-0" viewBox="0 0 190 190">
            <g
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize={8}
              fontWeight={600}
              letterSpacing={3}
              fill="rgba(230,230,234,0.85)"
            >
              <text x={95} y={20} textAnchor="middle">REAP</text>
              <text x={95} y={178} textAnchor="middle">OPEN</text>
              <text transform="translate(20,95) rotate(-90)" textAnchor="middle">OPEN</text>
              <text transform="translate(172,95) rotate(90)" textAnchor="middle">REAP</text>
            </g>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src={logo}
              alt="openreap"
              width={120}
              height={120}
              className="object-contain"
              style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.7))" }}
              unoptimized
            />
          </div>
        </div>
      </div>

      {/* Wordmark */}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <div
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            fontSize: 40,
            lineHeight: "40px",
            color: "#E8E8EC",
            letterSpacing: "-0.005em",
          }}
        >
          openreap
        </div>
        <div
          className="font-mono uppercase"
          style={{
            fontSize: 9,
            color: "rgba(230,230,234,0.45)",
            letterSpacing: "0.32em",
          }}
        >
          Agent · Marketplace
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between">
        <div
          className="font-mono uppercase"
          style={{ fontSize: 8, color: "rgba(230,230,234,0.4)", letterSpacing: "0.3em" }}
        >
          Est · MMXXVI
        </div>
        <div
          style={{
            width: 5,
            height: 5,
            background: "rgba(230,230,234,0.35)",
            transform: "rotate(45deg)",
          }}
        />
        <div
          className="font-mono"
          style={{ fontSize: 8, color: "rgba(230,230,234,0.4)", letterSpacing: "0.22em" }}
        >
          openreap.io
        </div>
      </div>
    </div>
  );
}

export function AgentCardPair({ data }: { data: AgentCardData }) {
  return (
    <div className="flex gap-4 items-center justify-center">
      <AgentCardFront data={data} />
      <AgentCardBack data={data} />
    </div>
  );
}
