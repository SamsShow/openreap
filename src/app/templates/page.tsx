"use client";

import Link from "next/link";
import { SmartNav } from "@/components/SmartNav";
import { motion, type Variants } from "framer-motion";

const templates = [
  {
    role: "Lawyer",
    skillType: "Contract Review",
    description:
      "Reviews NDAs, service agreements, vendor contracts. Flags indemnity clauses and risk areas.",
    code: `name: contract-reviewer\nprice: 5\nskill: Review contracts for...\nescalate_if: liability > 100K`,
    downloads: 342,
  },
  {
    role: "Tax Accountant",
    skillType: "Tax Query",
    description:
      "Handles tax return queries, eligibility checks, and compliance flags for small businesses and freelancers.",
    code: `name: tax-assistant\nprice: 3\nskill: Answer tax queries...\nescalate_if: revenue > 500K`,
    downloads: 518,
  },
  {
    role: "Senior Developer",
    skillType: "Code Review",
    description:
      "Reviews PRs for security flaws, refactoring opportunities, and team convention enforcement.",
    code: `name: code-reviewer\nprice: 12\nskill: Review code for...\nescalate_if: critical_vuln`,
    downloads: 189,
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

function DocumentIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 2H11.5L16 6.5V16C16 16.5304 15.7893 17.0391 15.4142 17.4142C15.0391 17.7893 14.5304 18 14 18H6C5.46957 18 4.96086 17.7893 4.58579 17.4142C4.21071 17.0391 4 16.5304 4 16V4C4 3.46957 4.21071 2.96086 4.58579 2.58579C4.96086 2.21071 5.46957 2 6 2Z"
        stroke="#C8553D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 2V7H16"
        stroke="#C8553D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 13H12"
        stroke="#C8553D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 10H12"
        stroke="#C8553D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TemplatesPage() {
  return (
    <main className="min-h-screen bg-bg">
      <SmartNav />

      {/* Hero Section */}
      <motion.section
        className="px-16 py-16 max-w-[1312px] mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.p
          className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta"
          variants={fadeUp}
        >
          SKILL TEMPLATES
        </motion.p>
        <motion.h1
          className="font-heading font-bold text-[48px] leading-[54px] tracking-[-0.03em] text-cream max-w-[600px] mt-4"
          variants={fadeUp}
        >
          Start with a template. Edit 5 lines. Upload.
        </motion.h1>
        <motion.p
          className="text-[17px] leading-7 text-muted max-w-[600px] mt-4"
          variants={fadeUp}
        >
          Pre-built SKILL.md files for every profession. Download, customize
          with your expertise, and deploy your agent in minutes.
        </motion.p>
      </motion.section>

      {/* Template Cards */}
      <motion.section
        className="px-16 max-w-[1312px] mx-auto pb-24"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="grid grid-cols-3 gap-6">
          {templates.map((template) => (
            <motion.div
              key={template.role}
              className="rounded-[20px] border border-surface overflow-clip"
              variants={fadeUp}
              whileHover={{ y: -6, transition: { duration: 0.25 } }}
            >
              {/* Top section */}
              <div className="p-8">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center shrink-0">
                    <DocumentIcon />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-heading font-bold text-[17px] text-cream">
                      {template.role}
                    </span>
                    <span className="text-sm text-muted">
                      {template.skillType}
                    </span>
                  </div>
                </div>
                <p className="text-[15px] leading-6 text-muted mt-4">
                  {template.description}
                </p>
              </div>

              {/* Code preview section */}
              <div className="px-8 py-5 bg-surface/50">
                <span className="text-[12px] font-medium tracking-[0.06em] uppercase text-muted">
                  SKILL.MD PREVIEW
                </span>
                <pre className="font-mono text-[13px] leading-5 text-muted mt-2 whitespace-pre-wrap">
                  {template.code}
                </pre>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 flex justify-between items-center border-t border-surface">
                <span className="text-sm text-muted">
                  {template.downloads} downloads
                </span>
                <Link
                  href={`/create-agent?template=${encodeURIComponent(template.code)}`}
                  className="px-5 py-2 bg-terracotta rounded-full text-[14px] font-medium text-off-white cursor-pointer hover:opacity-90 transition-opacity"
                >
                  Use this template
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </main>
  );
}
