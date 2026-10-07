import { GMAIL_CLIP_BYTES } from "./compile-mjml";

// Quick checks on a saved email's HTML, shown next to its preview: the
// things that most often break an email in Gmail and Outlook.

export type EmailCheck = { id: string; ok: boolean; label: string; detail: string };

export function checkEmail(html: string): EmailCheck[] {
  const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;
  const bytes = Buffer.byteLength(html);
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = images.filter((img) => !/\balt\s*=\s*"[^"]+"/i.test(img)).length;
  return [
    {
      id: "size",
      ok: bytes <= GMAIL_CLIP_BYTES,
      label: "Size",
      detail:
        bytes <= GMAIL_CLIP_BYTES
          ? `${kb(bytes)}, under Gmail's ${kb(GMAIL_CLIP_BYTES)} limit.`
          : `${kb(bytes)}: Gmail shows only the first ${kb(GMAIL_CLIP_BYTES)} and hides the rest, including the unsubscribe link.`,
    },
    {
      id: "outlook",
      ok: /<!--\[if mso/i.test(html),
      label: "Outlook",
      detail: /<!--\[if mso/i.test(html)
        ? "Uses table layouts with Outlook fallbacks."
        : "No Outlook fallbacks: layouts may break in Outlook on Windows.",
    },
    {
      id: "alt",
      ok: noAlt === 0,
      label: "Image descriptions",
      detail:
        noAlt === 0
          ? `All ${images.length} images have alt text, shown when images are blocked.`
          : `${noAlt} of ${images.length} images have no alt text. Many inboxes block images until the reader allows them.`,
    },
    {
      id: "unsubscribe",
      ok: true,
      label: "Unsubscribe link",
      detail: /\{\{\s*unsubscribe_url\s*\}\}/.test(html)
        ? "The design has its own unsubscribe link."
        : "Added automatically at the bottom when sent.",
    },
  ];
}
