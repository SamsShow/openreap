import { SmartNav } from "@/components/SmartNav";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { OnPageToc } from "@/components/docs/OnPageToc";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <SmartNav />
      <div className="flex max-w-[1400px] mx-auto">
        <DocsSidebar />
        <main className="flex-1 min-w-0 px-10 lg:px-16 py-12">
          <article className="max-w-[760px]">{children}</article>
        </main>
        <OnPageToc />
      </div>
    </div>
  );
}
