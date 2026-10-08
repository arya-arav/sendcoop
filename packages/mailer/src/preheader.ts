// The preheader: the short line most inboxes show after the subject. It is
// hidden text at the very top of the HTML, followed by invisible padding so
// the inbox doesn't fill the rest of the preview with the email's first words.

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Zero-width non-joiner and non-breaking space, repeated.
const FILLER = "&zwnj;&nbsp;".repeat(80);

export function withPreheader(html: string, preheader: string) {
  if (!html.trim() || !preheader.trim()) return html;
  const block =
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">` +
    `${escapeHtml(preheader.trim())}${FILLER}</div>`;
  const body = html.match(/<body\b[^>]*>/i);
  return body ? html.replace(body[0], body[0] + block) : block + html;
}
