// "Sent with Sendcoop" (the plans editor): emails from plans without the
// "No Sendcoop footer" feature carry a small line linking to Sendcoop, below
// the unsubscribe link.

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function withBranding(
  body: { html: string; text: string },
  siteUrl: string,
): { html: string; text: string } {
  const href = escapeHtml(`${siteUrl.replace(/\/$/, "")}/?ref=email`);
  let html = body.html;
  if (html.trim()) {
    const line =
      `<p style="margin:8px 0 0;font:11px/1.5 Arial,Helvetica,sans-serif;color:#9ca3af;text-align:center">` +
      `Sent with <a href="${href}" style="color:#9ca3af">Sendcoop</a></p>`;
    const end = html.search(/<\/body>(?![\s\S]*<\/body>)/i);
    html = end === -1 ? html + line : html.slice(0, end) + line + html.slice(end);
  }
  const text = `${body.text.trimEnd()}\nSent with Sendcoop: ${siteUrl.replace(/\/$/, "")}\n`;
  return { html, text };
}
