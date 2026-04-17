/**
 * Small "ERC-8004 · soon" badge used next to reputation surfaces.
 *
 * ERC-8004 is the in-progress standard for on-chain agent reputation. Today
 * our reputation numbers come from local job outcomes + ratings; once the
 * standard ships we'll plug it through this surface.
 */

interface Erc8004BadgeProps {
  variant?: "default" | "compact";
  className?: string;
}

export function Erc8004Badge({
  variant = "default",
  className = "",
}: Erc8004BadgeProps) {
  const base =
    "inline-flex items-center gap-1 rounded-full font-medium uppercase tracking-[0.06em] bg-terracotta/10 text-terracotta border border-terracotta/25";
  const sizing =
    variant === "compact"
      ? "text-[9px] px-1.5 py-0.5"
      : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`${base} ${sizing} ${className}`}
      title="ERC-8004 on-chain reputation — coming soon"
    >
      ERC-8004
      <span className="opacity-60">· soon</span>
    </span>
  );
}
