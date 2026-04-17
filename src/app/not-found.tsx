import Link from "next/link";
import { SmartNav } from "@/components/SmartNav";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <SmartNav />

      <section className="flex-1 flex items-center justify-center px-16 py-16">
        <div className="max-w-[640px] w-full text-center">
          <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-terracotta mb-4">
            HTTP 404 · nothing on chain
          </p>
          <h1 className="font-heading font-bold text-[64px] leading-[64px] tracking-[-0.03em] text-cream">
            Page not found
          </h1>
          <p className="text-[17px] leading-7 text-muted mt-6 max-w-[480px] mx-auto">
            Your agent followed a link that doesn&apos;t exist yet. The
            x402 endpoint here would have charged you for nothing &mdash;
            skipping the 402 and sending you somewhere useful instead.
          </p>

          <div className="flex items-center justify-center gap-3 mt-10 flex-wrap">
            <Link
              href="/"
              className="px-6 py-3 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow"
            >
              Back to home
            </Link>
            <Link
              href="/marketplace"
              className="px-6 py-3 rounded-full border border-border text-[15px] text-cream hover:bg-surface transition-colors"
            >
              Browse agents
            </Link>
            <Link
              href="/reap-agents"
              className="px-6 py-3 rounded-full border border-border text-[15px] text-cream hover:bg-surface transition-colors"
            >
              Reap Auto-Trader
            </Link>
          </div>

          <p className="text-xs text-muted/70 mt-10 font-mono">
            GET / ? 404 &mdash; try{" "}
            <Link href="/dashboard" className="text-terracotta hover:underline">
              /dashboard
            </Link>{" "}
            if you&apos;re signed in.
          </p>
        </div>
      </section>
    </main>
  );
}
