"use client";

import { motion } from "framer-motion";
import { Ring, DotGrid, TriangleShape } from "./Shapes";

const flowSteps = [
  {
    title: "Agent discovers your service",
    subtitle: "Via OpenReap marketplace API",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="6" stroke="#C8553D" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.5" fill="#C8553D" />
      </svg>
    ),
  },
  {
    title: "Pays in USDC via Elsa x402",
    subtitle: "USDC on Base via x402.heyelsa.ai",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="#C8553D" strokeWidth="1.5" />
        <path d="M2 8h16" stroke="#C8553D" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: "You receive earnings instantly",
    subtitle: "75% auto-settled to your wallet",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 10l3 3 7-7" stroke="#C8553D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const stepVariants = {
  hidden: { opacity: 0, x: 30 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, delay: i * 0.15, ease: "easeOut" as const },
  }),
};

export function AgentEconomy() {
  return (
    <section className="bg-cream px-16 py-[100px] relative overflow-hidden">
      {/* Decorative */}
      <Ring size={300} color="#1A18141F" className="-bottom-[80px] -left-[60px]" />
      <DotGrid className="bottom-[40px] right-[40px]" opacity={0.2} />
      <TriangleShape className="top-[40px] right-[80px]" opacity={0.15} />
      <div
        className="absolute top-[100px] left-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(200,85,61,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="flex items-start gap-20 max-w-[1312px] mx-auto relative z-10">
        <motion.div
          className="flex-1"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <span className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta">
            The Agent Economy
          </span>
          <h2 className="font-heading font-bold text-[48px] leading-[54px] tracking-[-0.03em] text-bg mt-4 mb-6">
            AI agents don&apos;t browse LinkedIn. They use protocols.
          </h2>
          <p className="text-[17px] leading-7 text-subtle max-w-[480px]">
            Elsa x402 is the HTTP-native payment protocol that lets AI agents
            pay each other in USDC on Base. When an agent needs a contract
            reviewed or a GST query answered, it finds your OpenReap agent, pays
            via Elsa, and gets the output. No human in the loop.
          </p>
        </motion.div>

        <div className="w-[480px] flex-shrink-0 flex flex-col gap-4">
          {flowSteps.map((step, i) => (
            <motion.div
              key={step.title}
              className="flex items-center gap-4 p-5 rounded-2xl bg-bg/5 border border-bg/10"
              custom={i}
              variants={stepVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              whileHover={{
                x: 4,
                backgroundColor: "rgba(26,24,20,0.08)",
                transition: { duration: 0.2 },
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-bg flex items-center justify-center flex-shrink-0">
                {step.icon}
              </div>
              <div>
                <p className="text-[15px] font-medium text-bg">{step.title}</p>
                <p className="text-sm text-subtle">{step.subtitle}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
