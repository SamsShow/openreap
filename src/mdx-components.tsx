import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";

const components: MDXComponents = {
  h1: ({ children, id }) => (
    <h1
      id={id}
      className="font-heading text-[40px] leading-[1.1] tracking-[-0.02em] text-cream mt-2 mb-6"
    >
      {children}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2
      id={id}
      className="font-heading text-[26px] leading-tight tracking-[-0.01em] text-cream mt-14 mb-4 scroll-mt-24"
    >
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3
      id={id}
      className="font-heading text-[19px] leading-snug text-cream mt-10 mb-3 scroll-mt-24"
    >
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[15.5px] leading-[1.75] text-cream/85 my-5">
      {children}
    </p>
  ),
  a: ({ href, children }) => {
    const isInternal =
      typeof href === "string" && (href.startsWith("/") || href.startsWith("#"));
    if (isInternal) {
      return (
        <Link
          href={href as string}
          className="text-terracotta hover:text-terracotta/80 underline underline-offset-[3px] decoration-terracotta/40 hover:decoration-terracotta/80"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-terracotta hover:text-terracotta/80 underline underline-offset-[3px] decoration-terracotta/40 hover:decoration-terracotta/80"
      >
        {children}
      </a>
    );
  },
  ul: ({ children }) => (
    <ul className="list-disc pl-6 my-5 space-y-2 text-[15.5px] leading-[1.7] text-cream/85 marker:text-terracotta/60">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 my-5 space-y-2 text-[15.5px] leading-[1.7] text-cream/85 marker:text-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-l-2 border-terracotta/60 bg-terracotta/5 pl-5 pr-4 py-3 rounded-r-md text-cream/90 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-0 border-t border-border" />,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[14px] text-cream/85">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface/60 text-left text-[12px] uppercase tracking-wider text-muted">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 font-medium border-b border-border">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 border-b border-border/60 align-top">{children}</td>
  ),
  code: ({ children, className }) => {
    if (className) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-surface text-cream font-mono text-[0.88em]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => {
    type CodeChild = { props?: { children?: string; className?: string } };
    const child = children as CodeChild | undefined;
    const codeContent = child?.props?.children ?? "";
    const lang = child?.props?.className?.replace("language-", "");
    const code =
      typeof codeContent === "string"
        ? codeContent.replace(/\n$/, "")
        : String(codeContent);
    return <CodeBlock code={code} label={lang} />;
  },
  CodeBlock,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
