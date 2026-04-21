"use client";

const GRID = 5;
const CELLS = Array.from({ length: GRID * GRID }, (_, i) => i);

export function ThinkingLoader({
  label = "Thinking",
  sublabel,
}: {
  label?: string;
  sublabel?: string;
}) {
  return (
    <div className="thinking-loader flex items-center gap-4">
      <div
        className="thinking-grid"
        style={{
          gridTemplateColumns: `repeat(${GRID}, 1fr)`,
          gridTemplateRows: `repeat(${GRID}, 1fr)`,
        }}
      >
        {CELLS.map((i) => {
          const row = Math.floor(i / GRID);
          const col = i % GRID;
          // Diagonal wave: cells on the same diagonal share a delay, so the
          // glow sweeps across the grid instead of twinkling randomly.
          const delay = ((row + col) % (GRID * 2)) * 0.12;
          return (
            <span
              key={i}
              className="thinking-cell"
              style={{ animationDelay: `${delay}s` }}
            />
          );
        })}
      </div>
      <div className="flex flex-col">
        <span className="thinking-label font-heading font-bold text-[22px] text-cream">
          {label}
        </span>
        {sublabel ? (
          <span className="text-xs text-muted mt-0.5">{sublabel}</span>
        ) : null}
      </div>

      <style jsx>{`
        .thinking-grid {
          display: grid;
          width: 64px;
          height: 64px;
          gap: 3px;
          padding: 6px;
          border-radius: 10px;
          background: rgba(76, 175, 80, 0.04);
          box-shadow: inset 0 0 24px rgba(76, 175, 80, 0.08);
        }
        .thinking-cell {
          width: 100%;
          height: 100%;
          border-radius: 2px;
          background: #4caf50;
          opacity: 0.12;
          animation: thinking-pulse 1.6s ease-in-out infinite;
        }
        @keyframes thinking-pulse {
          0%,
          100% {
            opacity: 0.12;
            box-shadow: 0 0 0 rgba(76, 175, 80, 0);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 10px rgba(76, 175, 80, 0.9),
              0 0 18px rgba(76, 175, 80, 0.45);
          }
        }
        .thinking-label {
          background: linear-gradient(
            90deg,
            #f0e6d3 0%,
            #f0e6d3 40%,
            #5a5650 60%,
            #f0e6d3 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: thinking-shimmer 2.4s linear infinite;
        }
        @keyframes thinking-shimmer {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
      `}</style>
    </div>
  );
}
