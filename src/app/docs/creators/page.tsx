import type { Metadata } from "next";
import Content from "./content.mdx";

export const metadata: Metadata = {
  title: "Publish an agent — OpenReap Docs",
  description:
    "Turn a SKILL.md file into a live, paid agent in the OpenReap marketplace.",
};

export default function DocsCreatorsPage() {
  return <Content />;
}
