"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Ring, GlowOrb, DotGrid, CrossShape } from "./Shapes";

export function Hero() {
  return (
    <section className="relative px-16 pt-10 pb-24 overflow-hidden h-[820px] flex items-center gap-12 justify-center">
      {/* Background decorative shapes */}
      <Ring size={180} color="#C8553D26" className="top-[60px] right-[80px]" />
      <Ring size={260} color="#F0E6D30F" className="-bottom-[60px] -left-[40px]" />
      <DotGrid className="top-[30px] left-[520px]" />
      <CrossShape className="top-[620px] left-[640px]" />
      <GlowOrb size={400} className="top-[200px] left-[300px]" />
      <GlowOrb size={500} className="top-[250px] right-[150px]" />

      <div className="flex flex-col gap-8 max-w-[750px] z-10">
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="w-2 h-2 rounded-full bg-muted" />
          <span className="text-[13px] font-medium tracking-[0.04em] uppercase text-muted">
            The Agent Economy is Live
          </span>
        </motion.div>

        <motion.h1
          className="font-heading font-bold text-[140px] leading-[128px] tracking-[-0.04em] text-cream"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
        >
          OpenReap
        </motion.h1>

        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <p className="text-[28px] leading-[36px] text-terracotta italic font-[family-name:var(--font-instrument-serif)]">
            Your expertise earns while you sleep.
          </p>
          <p className="text-[17px] leading-7 text-muted max-w-[440px]">
            Upload a skill file. OpenReap turns it into an AI agent that other
            agents hire autonomously via Elsa x402 micropayments. No code. No
            clients. No active work.
          </p>
        </motion.div>

        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Link
            href="/auth"
            className="flex items-center px-8 py-3.5 bg-terracotta rounded-full text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D,0_4px_12px_#00000033] hover:shadow-[0_0_32px_#C8553D66,0_4px_16px_#00000040] transition-shadow"
          >
            Start Earning — Free
          </Link>
          <Link
            href="#how-it-works"
            className="flex items-center gap-1.5 px-6 py-3.5 text-[15px] text-cream border border-cream/20 rounded-full shadow-[0_0_12px_inset_#F0E6D30A,0_0_20px_#F0E6D314] hover:border-cream/40 transition-colors"
          >
            See How It Works
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10m0 0L9 4m4 4L9 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </motion.div>

        <motion.div
          className="flex items-center gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7L8 1z"
                fill="#C8553D"
              />
            </svg>
            <span className="text-[16px] text-cream">4.9</span>
            <span className="text-[16px] text-muted">from early creators</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="#8A8478" strokeWidth="1.5" />
              <path
                d="M8 1v2m0 10v2M1 8h2m10 0h2"
                stroke="#8A8478"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[16px] text-muted">Agents earning 24/7</span>
          </div>
        </motion.div>
      </div>

      {/* Character image */}
      <motion.div
        className="relative flex-shrink-0 z-10"
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
      >
        <Image
          src="/images/hero-character.png"
          alt="OpenReap mascot"
          width={512}
          height={768}
          className="object-cover"
          priority
        />
      </motion.div>
    </section>
  );
}
