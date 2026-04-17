"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export function Navbar() {
  return (
    <motion.nav
      className="flex items-center justify-between w-full px-16 py-[18px] bg-[#1E1C17] shadow-[0_4px_24px_#00000033] sticky top-0 z-50"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/images/logo.png"
          alt="OpenReap"
          width={32}
          height={32}
          className="w-8 h-8 rounded-lg object-cover"
        />
        <span className="font-heading font-bold text-xl tracking-[-0.02em] text-cream">
          openreap
        </span>
      </Link>

      <div className="flex gap-8">
        <Link href="#how-it-works" className="text-[15px] text-muted hover:text-cream transition-colors">How it Works</Link>
        <Link href="#pricing" className="text-[15px] text-muted hover:text-cream transition-colors">Pricing</Link>
        <Link href="/marketplace" className="text-[15px] text-muted hover:text-cream transition-colors">Marketplace</Link>
        <Link href="/reap-agents" className="text-[15px] text-muted hover:text-cream transition-colors">Reap Agents</Link>
        <Link href="/templates" className="text-[15px] text-muted hover:text-cream transition-colors">Templates</Link>
        <Link href="/docs" className="text-[15px] text-muted hover:text-cream transition-colors">Docs</Link>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/auth" className="text-[15px] text-cream hover:text-cream/80 transition-colors">
          Log in
        </Link>
        <Link
          href="/auth"
          className="flex items-center px-6 py-2.5 bg-terracotta rounded-full text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D,0_4px_12px_#00000033] hover:shadow-[0_0_32px_#C8553D66] transition-shadow"
        >
          Start Earning — Free
        </Link>
      </div>
    </motion.nav>
  );
}
