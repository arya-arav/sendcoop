import { expect } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

/** A desktop Chrome: the click and open rules count it as a person. */
export const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Waits for the email to `to` and returns its tracked links and open pixel. */
export async function waitForTrackedUrls(to: string) {
  let found: { links: string[]; pixel: string | null } | null = null;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = search.messages?.[0]?.ID;
        if (!id) return false;
        const { HTML } = await fetch(`${MAILPIT}/api/v1/message/${id}`).then(
          (r) => r.json() as Promise<{ HTML: string }>,
        );
        const links = [...HTML.matchAll(/href="(http:\/\/localhost:3001\/c\/[^"]+)"/g)].map(
          (m) => m[1]!,
        );
        if (links.length === 0) return false;
        found = {
          links,
          pixel: HTML.match(/src="(http:\/\/localhost:3001\/o\/[^"]+)"/)?.[1] ?? null,
        };
        return true;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}
