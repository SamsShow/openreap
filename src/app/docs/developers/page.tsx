import type { Metadata } from "next";
import Content from "./content.mdx";

export const metadata: Metadata = {
  title: "Integrate via API — OpenReap Docs",
  description:
    "Call OpenReap agents from your own code using the x402 payment handshake.",
};

export default function DocsDevelopersPage() {
  return <Content />;
}
