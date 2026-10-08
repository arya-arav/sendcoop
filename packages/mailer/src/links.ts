// The trackable links in an email, in the order they appear: <a href> in
// HTML, or bare URLs in a plain-text email. Not tracked: mailto/tel links,
// anchors, and the unsubscribe link.

export type ExtractedLink = {
  /** As written in the email (merge tags included), entities decoded. */
  url: string;
  /** The link text, or an image's alt text; null for bare URLs. */
  label: string | null;
  /** 0-based order of appearance; each occurrence is its own link. */
  position: number;
};

const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const BARE_URL = /https?:\/\/[^\s<>"')\]]+/g;

const decode = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");

export function isTrackable(url: string) {
  return /^https?:\/\//i.test(url) && !/unsubscribe_url/i.test(url);
}

function labelOf(inner: string) {
  const text = inner
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text) return decode(text).slice(0, 200);
  const alt = inner.match(/<img\b[^>]*?\balt\s*=\s*(["'])(.*?)\1/i)?.[2];
  return alt ? decode(alt).slice(0, 200) : null;
}

export function extractLinks(html: string, text: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  if (html.trim()) {
    for (const match of html.matchAll(ANCHOR)) {
      const url = decode(match[2]!.trim());
      if (isTrackable(url)) links.push({ url, label: labelOf(match[3]!), position: links.length });
    }
    return links;
  }
  for (const match of text.matchAll(BARE_URL)) {
    // Trailing punctuation belongs to the sentence, not the URL.
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (isTrackable(url)) links.push({ url, label: null, position: links.length });
  }
  return links;
}

/**
 * Puts tracked URLs into an email: each trackable link, by its position in
 * the HTML (or plain text), gets the URL `track` returns for it (null keeps
 * it as is). In the text version of an HTML email, URLs are matched to the
 * HTML's links by address.
 */
export function rewriteLinks(
  body: { html: string; text: string },
  track: (position: number, url: string) => string | null,
): { html: string; text: string } {
  if (!body.html.trim()) {
    let position = 0;
    const text = body.text.replace(BARE_URL, (match) => {
      const url = match.replace(/[.,;:!?]+$/, "");
      if (!isTrackable(url)) return match;
      const tracked = track(position++, url);
      return tracked ? tracked + match.slice(url.length) : match;
    });
    return { html: "", text };
  }

  let position = 0;
  const byUrl = new Map<string, string>();
  const html = body.html.replace(ANCHOR, (whole, quote: string, rawHref: string) => {
    const url = decode(rawHref.trim());
    if (!isTrackable(url)) return whole;
    const tracked = track(position++, url);
    if (!tracked) return whole;
    if (!byUrl.has(url)) byUrl.set(url, tracked);
    return whole.replace(`${quote}${rawHref}${quote}`, `${quote}${tracked}${quote}`);
  });
  const text = body.text.replace(BARE_URL, (match) => {
    const url = match.replace(/[.,;:!?]+$/, "");
    const tracked = byUrl.get(url);
    return tracked ? tracked + match.slice(url.length) : match;
  });
  return { html, text };
}
