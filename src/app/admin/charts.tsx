"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Row = { day: string; sessions: number; jobs: number; usdcCents: number };

const CREAM = "#F0E6D3";
const TERRACOTTA = "#C8553D";
const BORDER = "rgba(240, 230, 211, 0.1)";
const MUTED = "#8A8478";

function shortDay(iso: string): string {
  // "2026-04-20" -> "04-20"
  return iso.slice(5);
}

function usdFromCents(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(1)}K`;
  return `$${d.toFixed(d % 1 === 0 ? 0 : 0)}`;
}

const tooltipStyle = {
  background: "#1A1814",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: CREAM,
  fontSize: 12,
};

const axisProps = {
  stroke: MUTED,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: BORDER },
};

export function SessionsChart({ data }: { data: Row[] }) {
  const view = data.map((r) => ({ x: shortDay(r.day), v: r.sessions }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={view} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} width={40} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: BORDER }} />
        <Line type="monotone" dataKey="v" stroke={TERRACOTTA} strokeWidth={2} dot={false} name="sessions" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function JobsChart({ data }: { data: Row[] }) {
  const view = data.map((r) => ({ x: shortDay(r.day), v: r.jobs }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={view} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} width={40} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: BORDER }} />
        <Line type="monotone" dataKey="v" stroke={CREAM} strokeWidth={2} dot={false} name="jobs" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function UsdcChart({ data }: { data: Row[] }) {
  const view = data.map((r) => ({ x: shortDay(r.day), v: r.usdcCents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={view} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" {...axisProps} />
        <YAxis {...axisProps} width={40} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(200,85,61,0.08)" }}
          formatter={(v) => usdFromCents(Number(v) * 100)}
        />
        <Bar dataKey="v" fill={TERRACOTTA} radius={[2, 2, 0, 0]} name="usdc" />
      </BarChart>
    </ResponsiveContainer>
  );
}
