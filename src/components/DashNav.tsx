"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Agent Settings", href: "/settings" },
  { label: "Escalation Queue", href: "/queue" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Reap Agents", href: "/reap-agents" },
];

const settingsTabs = [
  { label: "Plans & Upgrade", href: "/settings/plans" },
  { label: "Model Settings", href: "/settings/model" },
  { label: "Usage & Credits", href: "/settings/usage" },
  { label: "Payouts", href: "/settings/payouts" },
  { label: "Profile", href: "/settings/profile" },
];

interface DashNavProps {
  user?: { display_name: string | null; email: string };
}

export function DashNav({ user }: DashNavProps) {
  const pathname = usePathname();
  const isSettings = pathname.startsWith("/settings");

  const initials = user
    ? user.display_name
      ? user.display_name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : (user.email?.[0]?.toUpperCase() ?? "?")
    : "?";

  return (
    <div>
      <nav className="flex items-center justify-between w-full px-16 py-[18px] bg-[#1E1C17] shadow-[0_4px_24px_#00000033]">
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
                pathname === link.href || (link.href === "/settings" && isSettings)
                  ? "text-cream font-medium"
                  : "text-muted hover:text-cream"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ConnectButton
            accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
            chainStatus="icon"
            showBalance={false}
          />
          <Link
            href="/create-agent"
            className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors ${
              pathname === "/create-agent"
                ? "bg-terracotta text-off-white"
                : "border border-terracotta text-terracotta hover:bg-terracotta hover:text-off-white"
            }`}
          >
            + Create Agent
          </Link>
          <Link
            href="/settings/profile"
            className="w-8 h-8 rounded-full bg-terracotta flex items-center justify-center text-[13px] font-medium text-off-white"
          >
            {initials}
          </Link>
        </div>
      </nav>

      {isSettings && (
        <div className="flex gap-0 px-16 border-b border-surface">
          {settingsTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-5 py-3.5 text-[15px] transition-colors border-b-2 ${
                pathname === tab.href
                  ? "text-cream border-cream"
                  : "text-muted border-transparent hover:text-cream"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
