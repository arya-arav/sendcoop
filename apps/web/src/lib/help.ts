import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

// The help center (D83): guides written in Markdown under src/content/help,
// rendered at build time. Only our own files are rendered, so their HTML is
// trusted.

export const HELP_GUIDES = [
  { slug: "getting-started", section: "Start here" },
  { slug: "dns", section: "Start here" },
  { slug: "sending-servers", section: "Start here" },
  { slug: "affiliate-networks", section: "Track sales" },
  { slug: "shopify", section: "Track sales" },
  { slug: "woocommerce", section: "Track sales" },
  { slug: "utmcap", section: "Track sales" },
  { slug: "api", section: "Developers" },
] as const;

export type HelpSlug = (typeof HELP_GUIDES)[number]["slug"];

const folder = () => path.join(process.cwd(), "src", "content", "help");

/** A guide's title (its first "# " line), summary (the next paragraph) and HTML body. */
export async function readGuide(slug: string) {
  if (!HELP_GUIDES.some((g) => g.slug === slug)) return null;
  const source = await readFile(path.join(folder(), `${slug}.md`), "utf8").catch(() => null);
  if (source === null) return null;
  const [heading = "", ...rest] = source.replace(/\r\n/g, "\n").trim().split("\n");
  const title = heading.replace(/^#\s+/, "").trim();
  const body = rest.join("\n").trim();
  const summary = body.split("\n\n")[0]?.replace(/\n/g, " ").trim() ?? "";
  const html = await marked.parse(body, { gfm: true });
  return { slug, title, summary, html };
}

export async function listGuides() {
  const guides = await Promise.all(
    HELP_GUIDES.map(async (g) => {
      const guide = await readGuide(g.slug);
      return guide ? { ...guide, section: g.section } : null;
    }),
  );
  return guides.filter((g) => g !== null);
}
