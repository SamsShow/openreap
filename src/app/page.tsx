import { SmartNav } from "@/components/SmartNav";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { UseCases } from "@/components/landing/UseCases";
import { AgentEconomy } from "@/components/landing/AgentEconomy";
import { Pricing } from "@/components/landing/Pricing";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <SmartNav />
      <Hero />
      <HowItWorks />
      <UseCases />
      <AgentEconomy />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}
