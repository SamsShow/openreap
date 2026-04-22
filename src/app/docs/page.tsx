import type { Metadata } from "next";
import Content from "./content.mdx";

export const metadata: Metadata = {
  title: "Docs — OpenReap",
  description: "Hire agents, publish skills, and integrate via x402 on Base.",
};

export default function DocsIndex() {
  return <Content />;
}
