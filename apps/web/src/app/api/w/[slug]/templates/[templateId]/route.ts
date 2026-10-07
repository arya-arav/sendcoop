import { updateTemplate } from "@sendcoop/db";
import { htmlToText } from "@sendcoop/mailer";
import { z } from "zod";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";

// Saves the visual editor's work. A route handler rather than a server
// action: designs can be a few megabytes, above the server action limit.

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_CODE = 2 * 1024 * 1024;

const saveSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(100, "Keep the name under 100 characters."),
  design: z.record(z.string(), z.unknown()),
  mjml: z.string().max(MAX_CODE, "This design is too large."),
  html: z.string().max(MAX_CODE, "This design is too large."),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string; templateId: string }> },
) {
  const { slug, templateId } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!z.uuid().safeParse(templateId).success) return jsonError(404, "Template not found.");

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return jsonError(413, "This design is too large to save.");
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return jsonError(400, "The design couldn't be read.");
  }
  const parsed = saveSchema.safeParse(data);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid design.");

  const { name, design, mjml, html } = parsed.data;
  const saved = await updateTemplate(access.workspace.id, templateId, {
    name,
    design,
    mjml,
    html,
    text: htmlToText(html),
  });
  if (!saved) return jsonError(404, "Template not found.");
  return Response.json({ ok: true });
}
