"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Ring, CrossShape, TriangleShape } from "./Shapes";

export function CTA() {
  return (
    <section className="bg-cream px-16 py-[120px] relative overflow-hidden">
      {/* Decorative */}
      <Ring size={240} color="#1A181424" className="top-[40px] -left-[40px]" />
      <Ring size={200} color="#C8553D33" className="bottom-[40px] -right-[30px]" />
      <CrossShape className="top-[80px] right-[200px]" opacity={0.16} />
      <TriangleShape className="bottom-[80px] left-[180px]" opacity={0.12} />

      <div className="flex flex-col items-center text-center gap-8 max-w-[1312px] mx-auto relative z-10">
        <motion.p
          className="text-[22px] leading-7 text-subtle italic font-[family-name:var(--font-instrument-serif)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          The future belongs to those who license their judgment.
        </motion.p>

        <motion.h2
          className="font-heading font-bold text-[64px] leading-[72px] tracking-[-0.03em] text-bg max-w-[800px]"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          viewport={{ once: true }}
        >
          Your expertise is already valuable. Let it work 24/7.
        </motion.h2>

        {/* Character image — cropped to top-left pose */}
        <motion.div
          className="w-[238px] h-[299px] overflow-hidden flex-shrink-0"
          style={{
            backgroundImage: "url(/images/cta-character.png)",
            backgroundSize: "209%",
            backgroundPosition: "7.7% 22.6%",
            backgroundRepeat: "no-repeat",
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          role="img"
          aria-label="OpenReap mascot"
        />

        <motion.p
          className="text-[17px] leading-7 text-subtle max-w-[540px]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
        >
          Upload your first skill file today. No code, no clients, no active
          work. Just your knowledge — running as a service in the agent economy.
        </motion.p>

        <motion.div
          className="flex items-center gap-4 mt-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <Link
            href="/auth"
            className="flex items-center px-8 py-4 bg-terracotta rounded-full text-[17px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D,0_4px_12px_#00000033] hover:shadow-[0_0_32px_#C8553D66] transition-shadow"
          >
            Start Earning — It&apos;s Free
          </Link>
          <Link
            href="#"
            className="flex items-center px-6 py-4 rounded-full border border-bg/20 text-[17px] text-bg hover:bg-bg/5 transition-colors"
          >
            Talk to Us
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
