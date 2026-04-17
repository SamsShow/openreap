"use client";

import { motion } from "framer-motion";

export function Ring({
  size,
  color = "#F0E6D30F",
  dashed = false,
  className = "",
}: {
  size: number;
  color?: string;
  dashed?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        border: `${size > 200 ? 2.5 : 1.5}px ${dashed ? "dashed" : "solid"} ${color}`,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      viewport={{ once: true }}
    />
  );
}

export function GlowOrb({
  size,
  className = "",
}: {
  size: number;
  className?: string;
}) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle, rgba(200,85,61,0.06) 0%, transparent 70%)",
      }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
      viewport={{ once: true }}
    />
  );
}

export function DotGrid({
  className = "",
  opacity = 0.15,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      style={{ opacity }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity }}
      transition={{ duration: 1, delay: 0.3 }}
      viewport={{ once: true }}
    >
      <div className="flex flex-col gap-[18px]">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex gap-[18px]">
            {[0, 1, 2, 3, 4].map((col) => (
              <div
                key={col}
                className="w-1 h-1 rounded-full bg-cream"
              />
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function CrossShape({
  className = "",
  opacity = 0.12,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      style={{ opacity }}
      initial={{ opacity: 0, rotate: -45 }}
      whileInView={{ opacity, rotate: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 4v24M4 16h24" stroke="#F0E6D3" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

export function DiamondShape({
  className = "",
  opacity = 0.08,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      style={{ opacity }}
      initial={{ opacity: 0, rotate: 0 }}
      whileInView={{ opacity, rotate: 45 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <rect x="6" y="6" width="32" height="32" rx="4" stroke="#C8553D" strokeWidth="2" />
      </svg>
    </motion.div>
  );
}

export function HexagonShape({
  className = "",
  opacity = 0.06,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      style={{ opacity }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity }}
      transition={{ duration: 1 }}
      viewport={{ once: true }}
    >
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
        <path
          d="M26 4L46 16v20L26 48 6 36V16L26 4z"
          stroke="#F0E6D3"
          strokeWidth="2"
        />
      </svg>
    </motion.div>
  );
}

export function TriangleShape({
  className = "",
  opacity = 0.12,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      style={{ opacity }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity }}
      transition={{ duration: 1 }}
      viewport={{ once: true }}
    >
      <svg width="40" height="36" viewBox="0 0 40 36" fill="none">
        <path d="M20 2L38 34H2L20 2z" stroke="#C8553D" strokeWidth="2" />
      </svg>
    </motion.div>
  );
}

export function SmallDot({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute w-3 h-3 rounded-full bg-[#C8553D1F] pointer-events-none ${className}`}
    />
  );
}
