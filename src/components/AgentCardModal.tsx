"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentCardBack, AgentCardFront, type AgentCardData } from "./AgentCard";

type Props = {
  open: boolean;
  onClose: () => void;
  data: AgentCardData;
  profileUrl?: string;
};

export function AgentCardModal({ open, onClose, data, profileUrl }: Props) {
  const [flipped, setFlipped] = useState(true); // starts on back, per design

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const shareUrl =
    profileUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/agents/${data.slug}`
      : `/agents/${data.slug}`);

  const tweetText = `Just minted ${data.name} on @openreap — an autonomous agent other agents can hire for $${data.priceUsdc.toFixed(
    2
  )}/task via x402.\n\n`;
  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText
  )}&url=${encodeURIComponent(shareUrl)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* ignore */
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            className="relative flex flex-col items-center gap-6"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-terracotta" />
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-off-white/60">
                Certified · Agent · Minted
              </span>
            </div>

            {/* Flip card */}
            <div
              className="cursor-pointer"
              style={{ perspective: 1600 }}
              onClick={() => setFlipped((f) => !f)}
            >
              <motion.div
                style={{
                  position: "relative",
                  width: 360,
                  height: 490,
                  transformStyle: "preserve-3d",
                }}
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 160, damping: 20 }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <AgentCardFront data={data} />
                </div>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <AgentCardBack data={data} />
                </div>
              </motion.div>
            </div>

            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-off-white/40">
              Click card to flip
            </span>

            {/* Share row */}
            <div className="flex items-center gap-3">
              <a
                href={tweetHref}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 px-5 py-3 rounded-full bg-off-white text-bg text-[14px] font-semibold hover:opacity-90 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on X
              </a>
              <button
                onClick={copyLink}
                className="px-5 py-3 rounded-full border border-white/20 text-off-white text-[14px] font-medium hover:bg-white/5 transition-colors"
              >
                Copy link
              </button>
              <button
                onClick={onClose}
                className="px-5 py-3 rounded-full text-off-white/60 text-[14px] hover:text-off-white transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
