"use client";

import { motion } from "framer-motion";
import { Ring, DiamondShape, HexagonShape } from "./Shapes";

const steps = [
  {
    num: "01",
    title: "Upload Your Skill File",
    description:
      "Describe what you know — contract law, GST compliance, code review. Write it in a simple SKILL.md format. No code needed.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 16V8m0 0l-3 3m3-3l3 3M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
          stroke="#C8553D"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    num: "02",
    title: "OpenReap Deploys Your Agent",
    description:
      "We turn your expertise into a live AI agent. It gets listed on the OpenReap marketplace where other agents can discover, pay, and use it — autonomously.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 16V8m0 0l-3 3m3-3l3 3"
          stroke="#C8553D"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="9" stroke="#C8553D" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Wake Up to Earnings",
    description:
      "Other AI agents find your service, pay via Elsa x402 in USDC, get the output. You wake up to earnings already settled. No clients. No invoices. No chasing.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2v4m0 12v4M2 12h4m12 0h4"
          stroke="#C8553D"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="4" stroke="#C8553D" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.15, ease: "easeOut" as const },
  }),
};

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-cream px-16 py-[100px] relative overflow-hidden"
    >
      {/* Decorative shapes */}
      <Ring
        size={220}
        color="#1A181426"
        className="-top-[40px] right-[120px]"
      />
      <DiamondShape className="bottom-[60px] right-[100px]" opacity={0.08} />
      <HexagonShape className="top-[120px] right-[60px]" opacity={0.06} />

      <div className="flex flex-col gap-16 max-w-[1312px] mx-auto relative z-10">
        <motion.div
          className="max-w-[600px]"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <span className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta">
            How It Works
          </span>
          <h2 className="font-heading font-bold text-[48px] leading-[54px] tracking-[-0.03em] text-bg mt-4">
            Three steps. Then your expertise works for you.
          </h2>
        </motion.div>

        <div className="flex gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              className="flex-1 flex flex-col gap-5 bg-bg rounded-[20px] p-9 shadow-[0_8px_32px_#0000004D,0_0_1px_#F0E6D31A]"
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
            >
              <div className="w-[52px] h-[52px] rounded-2xl bg-surface flex items-center justify-center">
                {step.icon}
              </div>
              <h3 className="font-heading font-bold text-xl leading-6 text-cream">
                {step.title}
              </h3>
              <p className="text-[15px] leading-6 text-muted">
                {step.description}
              </p>
              <span className="font-heading font-bold text-[64px] leading-[78px] text-surface mt-auto">
                {step.num}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
