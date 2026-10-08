import { AFFILIATE_NETWORKS } from "@sendcoop/db/affiliate-networks";
import Link from "next/link";
import { HELP_GUIDES, listGuides } from "@/lib/help";

export const dynamic = "force-static";

export default async function HelpIndex() {
  const guides = await listGuides();
  const sections = [...new Set(HELP_GUIDES.map((g) => g.section))];
  return (
    <div className="grid gap-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Help</h1>
        <p className="mt-2 text-muted-foreground">
          Set up Sendcoop, connect your sending, and track the sales your emails make.
        </p>
      </div>
      {sections.map((section) => (
        <section key={section} aria-labelledby={`help-${section}`} className="grid gap-3">
          <h2 id={`help-${section}`} className="text-lg font-semibold">
            {section}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {guides
              .filter((g) => g.section === section)
              .map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/help/${g.slug}`}
                    className="block h-full rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium">{g.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{g.summary}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="help-networks" className="grid gap-3">
        <h2 id="help-networks" className="text-lg font-semibold">
          Affiliate networks
        </h2>
        <ul className="flex flex-wrap gap-2">
          {AFFILIATE_NETWORKS.map((n) => (
            <li key={n.id}>
              <Link
                href={`/help/networks/${n.id}`}
                className="block rounded-full border px-3 py-1 text-sm hover:bg-muted/50"
              >
                {n.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
