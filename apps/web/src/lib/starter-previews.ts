import { renderContent } from "@sendcoop/mailer";
import { compileMjml } from "./compile-mjml";
import { STARTERS } from "./starters";

// Compiled HTML of every starter, for the gallery's thumbnails, with merge
// tags shown as their fallbacks ("Hi there"). Starters only change with a
// deploy, so they are compiled once per process.

const cache = new Map<string, Promise<Map<string, string>>>();

export function starterPreviews(assets: string) {
  let previews = cache.get(assets);
  if (!previews) {
    previews = Promise.all(
      STARTERS.map(async (s) => {
        const { html } = await compileMjml(s.mjml(assets));
        return [s.id, renderContent(html, {}, { html: true, keep: ["unsubscribe_url"] })] as const;
      }),
    ).then((entries) => new Map(entries));
    cache.set(assets, previews);
  }
  return previews;
}
