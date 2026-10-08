import { ArrowLeft, FilePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appUrl } from "@/lib/app-url";
import { canManage } from "@/lib/permissions";
import { starterPreviews } from "@/lib/starter-previews";
import { STARTERS, type StarterCategory } from "@/lib/starters";
import { cn } from "@/lib/utils";
import { requireMemberWorkspace } from "@/lib/workspace";
import { UseStarterButton } from "../template-actions";

export const metadata: Metadata = { title: "New template" };

const CATEGORIES: StarterCategory[] = ["Affiliate", "Ecommerce", "Lead generation", "Newsletter"];

export default async function NewTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const { slug } = await params;
  const { role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) notFound();
  const wanted = [(await searchParams).category].flat()[0];
  const category = CATEGORIES.find((c) => c === wanted);
  const starters = category ? STARTERS.filter((s) => s.category === category) : STARTERS;
  const previews = await starterPreviews(`${appUrl()}/email`);
  const base = `/w/${slug}/templates/new`;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <Link
        href={`/w/${slug}/templates`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Templates
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
        <p className="text-sm text-muted-foreground">
          Start from a ready-made design and make it yours, or start from scratch.
        </p>
      </div>

      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        {[undefined, ...CATEGORIES].map((c) => (
          <Link
            key={c ?? "all"}
            href={c ? `${base}?category=${encodeURIComponent(c)}` : base}
            aria-current={c === category ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              c === category ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            {c ?? "All"}
          </Link>
        ))}
      </nav>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!category && (
          <li>
            <Card className="h-full">
              <div className="flex h-64 items-center justify-center bg-muted/40">
                <FilePlus className="size-10 text-muted-foreground" aria-hidden="true" />
              </div>
              <CardHeader>
                <CardTitle>
                  <h2>Blank</h2>
                </CardTitle>
                <CardDescription>
                  A logo, a headline, a button and a footer to build on.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <UseStarterButton slug={slug} label="Start from scratch" />
              </CardContent>
            </Card>
          </li>
        )}
        {starters.map((starter) => (
          <li key={starter.id}>
            <Card className="h-full overflow-hidden pt-0">
              {/* A scaled-down render of the email; decorative, not interactive. */}
              <div
                className="relative h-64 overflow-hidden border-b bg-[#f4f4f5]"
                aria-hidden="true"
              >
                <iframe
                  title={`${starter.name} preview`}
                  sandbox=""
                  tabIndex={-1}
                  loading="lazy"
                  srcDoc={previews.get(starter.id)}
                  className="pointer-events-none absolute top-0 left-1/2 h-[1100px] w-[640px] origin-top -translate-x-1/2 scale-[0.48] border-0"
                />
              </div>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>
                    <h2>{starter.name}</h2>
                  </CardTitle>
                  <Badge variant="secondary">{starter.category}</Badge>
                </div>
                <CardDescription>{starter.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <UseStarterButton
                  slug={slug}
                  starterId={starter.id}
                  label="Use this starter"
                  name={starter.name}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
