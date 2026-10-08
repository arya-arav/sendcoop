import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP_GUIDES, readGuide } from "@/lib/help";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_GUIDES.map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await readGuide((await params).slug);
  return guide ? { title: guide.title, description: guide.summary } : {};
}

export default async function HelpGuide({ params }: Props) {
  const guide = await readGuide((await params).slug);
  if (!guide) notFound();
  return (
    <article>
      <Link href="/help" className="text-sm text-muted-foreground hover:text-foreground">
        Help
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{guide.title}</h1>
      {/* Our own Markdown from src/content/help, rendered at build time. */}
      <div className="help-prose mt-6" dangerouslySetInnerHTML={{ __html: guide.html }} />
    </article>
  );
}
