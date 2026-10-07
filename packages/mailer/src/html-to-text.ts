// The plain-text version of an HTML email, for clients that show text and
// for spam filters, which like a matching text part. Links keep their URL.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  const text = html
    // Not content: head, styles, scripts, comments (incl. Outlook conditionals).
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(style|script|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Images become their alt text (first, so a linked image reads "alt (url)").
    .replace(/<img\b[^>]*?alt\s*=\s*["']([^"']+)["'][^>]*>/gi, "$1")
    // Links: "text (url)", or just the url when there's no text or it is the url.
    .replace(
      /<a\b[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href: string, inner: string) => {
        const label = inner.replace(/<[^>]+>/g, "").trim();
        const url = decode(href);
        if (!/^(https?:|mailto:|\{\{)/i.test(url)) return label;
        return !label || decode(label) === url ? url : `${label} (${url})`;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|li|blockquote|section)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decode(text)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
