import mjml2html from "mjml";

// Compiles a design's MJML into the HTML that is sent. Done on the server
// with the official compiler, so what we send never depends on the browser.

/** Gmail cuts off ("clips") messages whose HTML is bigger than this. */
export const GMAIL_CLIP_BYTES = 102 * 1024;

export async function compileMjml(source: string) {
  const { html, errors } = await mjml2html(source, {
    validationLevel: "soft",
    // Never read files from the server (<mj-include>), whatever the version default.
    ignoreIncludes: true,
  });
  const bytes = Buffer.byteLength(html);
  return {
    html,
    errors: errors.map((e) => e.formattedMessage),
    bytes,
    clipped: bytes > GMAIL_CLIP_BYTES,
  };
}
