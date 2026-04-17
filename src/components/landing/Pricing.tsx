"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Ring, CrossShape, GlowOrb } from "./Shapes";

const freeFeatures = [
  "OpenRouter model included",
  "Unlimited skill uploads",
  "Elsa x402 payments (USDC)",
  "Earnings dashboard",
  "BYOK for lower fees",
];

const proFeatures = [
  "Claude Sonnet & Opus models",
  "Priority marketplace listing",
  "Higher reputation multiplier",
  "Advanced analytics & insights",
  "Dedicated support",
];

export function Pricing() {
  return (
    <section id="pricing" className="px-16 py-[100px] relative overflow-hidden">
      {/* Decorative */}
      <Ring size={160} color="#F0E6D30F" className="top-[40px] left-[80px]" />
      <CrossShape className="bottom-[60px] right-[100px]" opacity={0.08} />
      <GlowOrb size={500} className="top-[50px] left-1/2 -translate-x-1/2" />

      <div className="flex flex-col gap-16 max-w-[1312px] mx-auto relative z-10">
        <motion.div
          className="max-w-[585px]"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <span className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta">
            Pricing
          </span>
          <h2 className="font-heading font-bold text-[48px] leading-[54px] tracking-[-0.03em] text-cream mt-4">
            Start free. Scale when ready.
          </h2>
          <p className="text-[17px] leading-7 text-muted mt-4 max-w-[520px]">
            Free to start — OpenReap provides the model via OpenRouter. Bring
            your own API key for lower fees. Upgrade for Claude-quality outputs.
          </p>
        </motion.div>

        <div className="flex gap-6">
          {/* Free tier */}
          <motion.div
            className="flex-1 flex flex-col gap-7 rounded-[20px] p-9 border border-surface shadow-[0_8px_32px_#00000040]"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{ y: -4, transition: { duration: 0.3 } }}
          >
            <div>
              <h3 className="font-heading font-bold text-[28px] text-cream">
                Free
              </h3>
              <p className="text-sm text-muted mt-2">
                Everything you need to start earning from your expertise.
              </p>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-heading font-bold text-[52px] leading-[58px] text-cream">
                $0
              </span>
              <span className="text-[15px] text-muted">/month</span>
            </div>

            <div className="h-px bg-surface" />

            <ul className="flex flex-col gap-3">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <CheckIcon />
                  <span className="text-[15px] text-cream">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/auth"
              className="mt-auto flex items-center justify-center py-3.5 rounded-full border border-surface text-[15px] text-cream hover:bg-surface/50 transition-colors"
            >
              Get Started Free
            </Link>
          </motion.div>

          {/* Pro tier */}
          <motion.div
            className="flex-1 flex flex-col gap-7 rounded-[20px] p-9 bg-surface border-[1.5px] border-terracotta shadow-[0_8px_40px_#C8553D26,0_0_80px_#C8553D14]"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            viewport={{ once: true }}
            whileHover={{
              y: -4,
              boxShadow:
                "0 12px 48px rgba(200,85,61,0.2), 0 0 100px rgba(200,85,61,0.1)",
              transition: { duration: 0.3 },
            }}
          >
            <div>
              <h3 className="font-heading font-bold text-[28px] text-cream">
                Pro
              </h3>
              <p className="text-sm text-muted mt-2">
                Claude-quality outputs, better reputation scores, and priority
                listing.
              </p>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-heading font-bold text-[52px] leading-[58px] text-cream">
                $29
              </span>
              <span className="text-[15px] text-muted">/month</span>
            </div>

            <div className="h-px bg-border" />

            <ul className="flex flex-col gap-3">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <CheckIcon />
                  <span className="text-[15px] text-cream">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/auth"
              className="mt-auto flex items-center justify-center py-3.5 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] hover:brightness-110 transition-all"
            >
              Upgrade to Pro
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <path d="M3.5 8l3 3 6-6" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
