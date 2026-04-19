"use client";

import { useEffect, useState } from "react";

type Heading = { id: string; text: string; level: 2 | 3 };

export function OnPageToc() {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("article h2[id], article h3[id]")
    );
    const collected: Heading[] = nodes.map((node) => ({
      id: node.id,
      text: node.textContent ?? "",
      level: node.tagName === "H2" ? 2 : 3,
    }));
    // One-time DOM extraction after MDX mount; React 19 flags the sync
    // setState-in-effect pattern, but the headings can only be read post-render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeadings(collected);

    if (collected.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  if (headings.length === 0) return <div className="w-56 shrink-0" />;

  return (
    <aside className="hidden xl:block w-56 shrink-0">
      <nav className="sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto pl-4 py-10">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted mb-3">
          On this page
        </p>
        <ul className="space-y-1.5 border-l border-border">
          {headings.map((h) => {
            const active = h.id === activeId;
            return (
              <li key={h.id} style={{ paddingLeft: h.level === 3 ? 16 : 0 }}>
                <a
                  href={`#${h.id}`}
                  className={`block -ml-px pl-4 py-0.5 text-[13px] border-l transition-colors ${
                    active
                      ? "text-cream border-terracotta"
                      : "text-muted border-transparent hover:text-cream"
                  }`}
                >
                  {h.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
