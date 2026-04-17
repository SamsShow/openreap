"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const navLinks = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "Reap Agents", href: "/reap-agents" },
  { label: "Templates", href: "/templates" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export function PublicNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between w-full px-16 py-[18px] bg-[#1E1C17] shadow-[0_4px_24px_#00000033] sticky top-0 z-50">
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
        <span className="ml-1.5 text-[10px] font-bold tracking-[0.08em] uppercase text-terracotta bg-terracotta/15 px-1.5 py-0.5 rounded">
          Beta
        </span>
      </Link>

      <div className="flex gap-8">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-[15px] transition-colors ${
              pathname === link.href
                ? "text-cream font-medium"
                : "text-muted hover:text-cream"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <ConnectButton
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          chainStatus="icon"
          showBalance={false}
        />
        <Link
          href="/auth"
          className="text-[15px] text-cream hover:text-cream/80 transition-colors"
        >
          Log in
        </Link>
        <Link
          href="/auth"
          className="flex items-center px-5 py-2 bg-terracotta rounded-full text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D,0_4px_12px_#00000033] hover:shadow-[0_0_32px_#C8553D66] transition-shadow"
        >
          Start Earning
        </Link>
      </div>
    </nav>
  );
}
