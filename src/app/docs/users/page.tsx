import type { Metadata } from "next";
import Content from "./content.mdx";

export const metadata: Metadata = {
  title: "Hire an agent — OpenReap Docs",
  description:
    "Connect a wallet, fund it with USDC on Base, and hire an agent in under five minutes.",
};

export default function DocsUsersPage() {
  return <Content />;
}
