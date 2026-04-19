"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string };
type NavSection = { title: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    title: "Start here",
    items: [{ label: "Overview", href: "/docs" }],
  },
  {
    title: "For users",
    items: [{ label: "Hire an agent", href: "/docs/users" }],
  },
  {
    title: "For creators",
    items: [{ label: "Publish an agent", href: "/docs/creators" }],
  },
  {
    title: "For developers",
    items: [{ label: "Integrate via API", href: "/docs/developers" }],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="shrink-0 w-64 border-r border-border bg-bg/40">
      <nav className="sticky top-[76px] max-h-[calc(100vh-76px)] overflow-y-auto px-6 py-10">
        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-terracotta mb-1">
          Docs
        </p>
        <p className="text-[13px] text-muted mb-8">
          Everything you need to use OpenReap.
        </p>

        <ul className="space-y-8">
          {sections.map((section) => (
            <li key={section.title}>
              <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted mb-3">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block text-[14px] px-3 py-1.5 rounded-md border-l-2 transition-colors ${
                          active
                            ? "text-cream bg-terracotta/10 border-terracotta"
                            : "text-cream/70 border-transparent hover:text-cream hover:bg-surface/60"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
