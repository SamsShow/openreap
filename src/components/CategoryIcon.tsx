/**
 * Category → inline SVG icon for agent cards.
 *
 * Covers every category we currently seed (`Legal`, `Finance & Tax`,
 * `Software Engineering`, `Content & Writing`, `Data & Analytics`,
 * `Strategy`, `defi`). Falls back to a neutral grid for unknown categories
 * so new categories render cleanly without a ship.
 */

interface CategoryIconProps {
  category: string | null | undefined;
  size?: number;
  /** Tailwind classes for the wrapper (background + padding). */
  className?: string;
}

function normalize(category: string | null | undefined): string {
  if (!category) return "default";
  return category.toLowerCase().trim();
}

export function CategoryIcon({
  category,
  size = 24,
  className = "",
}: CategoryIconProps) {
  const key = normalize(category);
  const Icon = PATHS[key] ?? PATHS["default"];
  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl bg-surface flex-shrink-0 ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-terracotta"
        aria-hidden="true"
      >
        <Icon />
      </svg>
    </div>
  );
}

/** SVG path children for each category. */
const PATHS: Record<string, () => React.ReactElement> = {
  legal: LegalIcon,
  "finance & tax": FinanceIcon,
  finance: FinanceIcon,
  "software engineering": SoftwareIcon,
  software: SoftwareIcon,
  "content & writing": ContentIcon,
  content: ContentIcon,
  "data & analytics": DataIcon,
  data: DataIcon,
  strategy: StrategyIcon,
  tech: SoftwareIcon,
  defi: DefiIcon,
  trading: DefiIcon,
  default: DefaultIcon,
};

function LegalIcon() {
  // Scales of justice
  return (
    <g>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M5 7l-2 6h4l-2-6z" />
      <path d="M19 7l-2 6h4l-2-6z" />
      <path d="M8 21h8" />
    </g>
  );
}

function FinanceIcon() {
  // Dollar in circle
  return (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M14 9h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3" />
      <path d="M12 7.5v1.5" />
      <path d="M12 15v1.5" />
    </g>
  );
}

function SoftwareIcon() {
  // Angle brackets < / >
  return (
    <g>
      <path d="M8 7l-5 5 5 5" />
      <path d="M16 7l5 5-5 5" />
      <path d="M14 5l-4 14" />
    </g>
  );
}

function ContentIcon() {
  // Pen writing on paper
  return (
    <g>
      <path d="M4 19h10" />
      <path d="M4 15l10-10 4 4-10 10H4v-4z" />
      <path d="M14 5l4 4" />
    </g>
  );
}

function DataIcon() {
  // Bar chart
  return (
    <g>
      <path d="M3 21h18" />
      <rect x="5" y="12" width="3" height="7" />
      <rect x="10.5" y="8" width="3" height="11" />
      <rect x="16" y="4" width="3" height="15" />
    </g>
  );
}

function StrategyIcon() {
  // Target / bullseye
  return (
    <g>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M21 3l-6 6" />
    </g>
  );
}

function DefiIcon() {
  // Swap arrows
  return (
    <g>
      <path d="M4 9h14" />
      <path d="M15 6l3 3-3 3" />
      <path d="M20 15H6" />
      <path d="M9 18l-3-3 3-3" />
    </g>
  );
}

function DefaultIcon() {
  // Neutral grid
  return (
    <g>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </g>
  );
}
