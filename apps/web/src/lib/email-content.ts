import { htmlToText } from "@sendcoop/mailer";
import { z } from "zod";
import { compileMjml, GMAIL_CLIP_BYTES } from "./compile-mjml";

// Saving an email's content from any editor, for templates and campaigns
// alike: validated per editor kind, visual designs compiled from MJML on the
// server, the text version derived from HTML, and warnings about the result.

export const MAX_CONTENT_BODY_BYTES = 5 * 1024 * 1024;
const MAX_CODE = 2 * 1024 * 1024;
const TOO_LARGE = "This email is too large.";

export const contentSchema = z.discriminatedUnion("editor", [
  z.object({
    editor: z.literal("visual"),
    design: z.record(z.string(), z.unknown()),
    mjml: z.string().max(MAX_CODE, TOO_LARGE),
  }),
  z.object({ editor: z.literal("html"), html: z.string().max(MAX_CODE, TOO_LARGE) }),
  z.object({ editor: z.literal("text"), text: z.string().max(MAX_CODE, TOO_LARGE) }),
]);

export type ContentInput = z.infer<typeof contentSchema>;

const kb = (bytes: number) => Math.ceil(bytes / 1024);

/** Things to fix in an email's HTML that don't stop it being saved. */
function htmlWarnings(html: string) {
  const warnings: string[] = [];
  const bytes = Buffer.byteLength(html);
  if (bytes > GMAIL_CLIP_BYTES) {
    warnings.push(
      `Gmail cuts off emails over ${kb(GMAIL_CLIP_BYTES)} KB and this one is ${kb(bytes)} KB. Remove some content so the end (and your unsubscribe link) shows.`,
    );
  }
  if (/<script\b/i.test(html)) {
    warnings.push(
      "Scripts don't run in any email client and make emails look like spam. Remove them.",
    );
  }
  return warnings;
}

/** The columns to store for saved content, and what to warn about. */
export async function buildContent(input: ContentInput) {
  if (input.editor === "visual") {
    const { html, errors } = await compileMjml(input.mjml);
    return {
      content: { design: input.design, mjml: input.mjml, html, text: htmlToText(html) },
      warnings: [...htmlWarnings(html), ...errors.slice(0, 5)],
    };
  }
  if (input.editor === "html") {
    return {
      content: { html: input.html, text: htmlToText(input.html) },
      warnings: htmlWarnings(input.html),
    };
  }
  // Plain text: sent without an HTML part.
  return { content: { html: "", text: input.text }, warnings: [] };
}

/** Reads a JSON request body with a size limit. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > MAX_CONTENT_BODY_BYTES) throw new Error("too large");
  return JSON.parse(body);
}
