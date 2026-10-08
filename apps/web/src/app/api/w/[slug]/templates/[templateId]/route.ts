import { getTemplate, updateTemplate } from "@sendcoop/db";
import { z } from "zod";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";
import { buildContent, contentSchema, readJsonBody } from "@/lib/email-content";

// Saves a template from any of its editors. A route handler rather than a
// server action: designs can be a few megabytes, above the server action
// limit.

const metaSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(100, "Keep the name under 100 characters."),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters.").default(""),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string; templateId: string }> },
) {
  const { slug, templateId } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!z.uuid().safeParse(templateId).success) return jsonError(404, "Template not found.");

  let data: unknown;
  try {
    data = await readJsonBody(request);
  } catch {
    return jsonError(400, "The template couldn't be read, or is too large.");
  }
  const meta = metaSchema.safeParse(data);
  const input = contentSchema.safeParse(data);
  if (!meta.success) return jsonError(400, meta.error.issues[0]?.message ?? "Invalid template.");
  if (!input.success) return jsonError(400, input.error.issues[0]?.message ?? "Invalid template.");

  const template = await getTemplate(access.workspace.id, templateId);
  if (!template) return jsonError(404, "Template not found.");
  if (template.editor !== input.data.editor) {
    return jsonError(409, "This template uses a different editor. Reload the page.");
  }

  const { content, warnings } = await buildContent(input.data);
  await updateTemplate(access.workspace.id, templateId, { ...meta.data, ...content });
  return Response.json({ ok: true, warnings });
}
