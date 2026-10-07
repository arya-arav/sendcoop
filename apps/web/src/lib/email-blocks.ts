// Content blocks for the visual editor, written in MJML so they compile to
// the table layouts and Outlook conditionals that render the same in Gmail,
// Outlook, Apple Mail and Yahoo. Each block is one full-width section.
// Shared by the editor (browser), new templates and tests (server).

export type EmailBlock = { id: string; label: string; mjml: string };

const INK = "#18181b";
const BODY = "#3f3f46";
const MUTED = "#71717a";
const FONT = "Arial, Helvetica, sans-serif";

/** `assets` is the absolute URL of the app's /email folder (placeholder images). */
export function emailBlocks(assets: string): EmailBlock[] {
  return [
    {
      id: "sc-header",
      label: "Header",
      mjml: `<mj-section background-color="#ffffff" padding="24px 24px 8px">
  <mj-column>
    <mj-image src="${assets}/logo.png" alt="Your logo" width="160px" align="center" padding="0" />
  </mj-column>
</mj-section>`,
    },
    {
      id: "sc-text",
      label: "Text",
      mjml: `<mj-section background-color="#ffffff" padding="16px 24px">
  <mj-column>
    <mj-text font-family="${FONT}" font-size="24px" font-weight="700" line-height="1.3" color="${INK}">Your headline</mj-text>
    <mj-text font-family="${FONT}" font-size="16px" line-height="1.6" color="${BODY}">Tell readers what this email is about and why it matters to them. Keep it short and clear.</mj-text>
  </mj-column>
</mj-section>`,
    },
    {
      id: "sc-button",
      label: "Button",
      mjml: `<mj-section background-color="#ffffff" padding="8px 24px 24px">
  <mj-column>
    <mj-button href="https://example.com" font-family="${FONT}" font-size="16px" font-weight="700" background-color="${INK}" color="#ffffff" border-radius="6px" inner-padding="14px 28px">Shop now</mj-button>
  </mj-column>
</mj-section>`,
    },
    {
      id: "sc-image",
      label: "Image",
      mjml: `<mj-section background-color="#ffffff" padding="0">
  <mj-column>
    <mj-image src="${assets}/image.png" alt="Describe the image for people who can't see it" href="https://example.com" padding="0" />
  </mj-column>
</mj-section>`,
    },
    {
      id: "sc-product",
      label: "Product",
      // Two columns on desktop, stacked on phones.
      mjml: `<mj-section background-color="#ffffff" padding="16px 24px">
  <mj-column width="40%" vertical-align="middle">
    <mj-image src="${assets}/product.png" alt="Product name" href="https://example.com/product" padding="0 0 12px" />
  </mj-column>
  <mj-column width="60%" vertical-align="middle">
    <mj-text font-family="${FONT}" font-size="18px" font-weight="700" line-height="1.3" color="${INK}" padding="0 0 0 16px">Product name</mj-text>
    <mj-text font-family="${FONT}" font-size="14px" line-height="1.5" color="${BODY}" padding="8px 0 0 16px">One or two lines on why it's worth it.</mj-text>
    <mj-text font-family="${FONT}" font-size="20px" font-weight="700" color="${INK}" padding="12px 0 0 16px"><span style="color:#a1a1aa;font-weight:400;text-decoration:line-through">$59</span> $39</mj-text>
    <mj-button href="https://example.com/product" align="left" font-family="${FONT}" font-size="15px" font-weight="700" background-color="#16a34a" color="#ffffff" border-radius="6px" inner-padding="12px 24px" padding="16px 0 0 16px">Buy now</mj-button>
  </mj-column>
</mj-section>`,
    },
    {
      id: "sc-footer",
      label: "Footer",
      // A postal address and unsubscribe link are required by law (CAN-SPAM, GDPR).
      mjml: `<mj-section padding="24px">
  <mj-column>
    <mj-text align="center" font-family="${FONT}" font-size="12px" line-height="1.6" color="${MUTED}">Your Company, 123 Street, City, Country<br />You're getting this email because you signed up on our website.<br /><a href="{{unsubscribe_url}}" style="color:${MUTED}">Unsubscribe</a></mj-text>
  </mj-column>
</mj-section>`,
    },
  ];
}

/** A whole email from block ids, for new templates and the gallery. */
export function emailFromBlocks(assets: string, ids: string[]) {
  const blocks = new Map(emailBlocks(assets).map((b) => [b.id, b.mjml]));
  return `<mjml>
  <mj-body background-color="#f4f4f5" width="600px">
${ids.map((id) => blocks.get(id) ?? "").join("\n")}
  </mj-body>
</mjml>`;
}
