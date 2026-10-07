// What Gmail and Yahoo require of bulk senders since 2024: a one-click
// unsubscribe (RFC 8058) in the headers, covered by the DKIM signature, and
// a visible unsubscribe link in the message itself.

/** The List-Unsubscribe headers for the one-click endpoint. */
export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

const PLACEHOLDER = /\{\{\s*unsubscribe_url\s*\}\}/g;
// search() ignores the g flag's lastIndex, unlike test().
const hasPlaceholder = (value: string) => value.search(PLACEHOLDER) !== -1;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Puts the unsubscribe link into a message: wherever the design has
 * {{unsubscribe_url}}, or else as a footer at the end.
 */
export function withUnsubscribeLink(
  body: { html: string; text: string },
  pageUrl: string,
): { html: string; text: string } {
  const href = escapeHtml(pageUrl);
  let html: string;
  if (hasPlaceholder(body.html)) {
    html = body.html.replace(PLACEHOLDER, href);
  } else {
    const footer =
      `<p style="margin:32px 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#6b7280;text-align:center">` +
      `Don't want these emails? <a href="${href}" style="color:#6b7280">Unsubscribe</a></p>`;
    const end = body.html.search(/<\/body>(?![\s\S]*<\/body>)/i);
    html =
      end === -1 ? body.html + footer : body.html.slice(0, end) + footer + body.html.slice(end);
  }
  const text = hasPlaceholder(body.text)
    ? body.text.replace(PLACEHOLDER, pageUrl)
    : `${body.text.trimEnd()}\n\n--\nUnsubscribe: ${pageUrl}\n`;
  return { html, text };
}
