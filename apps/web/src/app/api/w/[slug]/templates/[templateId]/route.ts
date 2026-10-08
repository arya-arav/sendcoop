import { getTemplate, type TemplateContent, updateTemplate } from "@sendcoop/db";
import { htmlToText } from "@sendcoop/mailer";
import { z } from "zod";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";
import { compileMjml, GMAIL_CLIP_BYTES } from "@/lib/compile-mjml";

// Saves a template from any of its editors. A route handler rather than a
// server action: designs can be a few megabytes, above the server action
// limit. For visual designs the HTML that gets sent is compiled here from
// the MJML, not taken from the browser.

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_CODE = 2 * 1024 * 1024;
const TOO_LARGE = "This email is too large.";

const common = {
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(100, "Keep the name under 100 characters."),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters.").default(""),
};

const saveSchema = z.discriminatedUnion("editor", [
  z.object({
    ...common,
    editor: z.literal("visual"),
    design: z.record(z.string(), z.unknown()),
    mjml: z.string().max(MAX_CODE, TOO_LARGE),
  }),
  z.object({ ...common, editor: z.literal("html"), html: z.string().max(MAX_CODE, TOO_LARGE) }),
  z.object({ ...common, editor: z.literal("text"), text: z.string().max(MAX_CODE, TOO_LARGE) }),
]);

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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string; templateId: string }> },
) {
  const { slug, templateId } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!z.uuid().safeParse(templateId).success) return jsonError(404, "Template not found.");

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return jsonError(413, "This email is too large to save.");
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return jsonError(400, "The template couldn't be read.");
  }
  const parsed = saveSchema.safeParse(data);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid template.");
  }
  const input = parsed.data;

  const template = await getTemplate(access.workspace.id, templateId);
  if (!template) return jsonError(404, "Template not found.");
  if (template.editor !== input.editor) {
    return jsonError(409, "This template uses a different editor. Reload the page.");
  }

  let content: TemplateContent;
  let warnings: string[];
  if (input.editor === "visual") {
    const { html, errors } = await compileMjml(input.mjml);
    content = { design: input.design, mjml: input.mjml, html, text: htmlToText(html) };
    warnings = [...htmlWarnings(html), ...errors.slice(0, 5)];
  } else if (input.editor === "html") {
    content = { html: input.html, text: htmlToText(input.html) };
    warnings = htmlWarnings(input.html);
  } else {
    // Plain text: sent without an HTML part.
    content = { html: "", text: input.text };
    warnings = [];
  }

  await updateTemplate(access.workspace.id, templateId, {
    name: input.name,
    subject: input.subject,
    ...content,
  });
  return Response.json({ ok: true, warnings });
}
