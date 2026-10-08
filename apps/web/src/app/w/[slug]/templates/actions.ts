"use server";

import { createTemplate, deleteTemplate } from "@sendcoop/db";
import { htmlToText } from "@sendcoop/mailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { appUrl } from "@/lib/app-url";
import { STARTER_HTML, STARTER_TEXT } from "@/lib/code-starters";
import { compileMjml } from "@/lib/compile-mjml";
import { emailFromBlocks } from "@/lib/email-blocks";
import { findStarter } from "@/lib/starters";

const NO_PERMISSION = "Only workspace owners and admins can change templates.";

export type NewTemplateFrom =
  { kind: "visual"; starterId?: string } | { kind: "html" } | { kind: "text" };

/**
 * Creates a template and opens it in the editor: visual (from a gallery
 * starter or a simple layout), HTML code, or plain text.
 */
export async function createTemplateAction(slug: string, from: NewTemplateFrom) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { error: NO_PERMISSION };

  let template;
  if (from.kind === "html") {
    template = await createTemplate(workspace.id, {
      name: "Untitled HTML email",
      editor: "html",
      html: STARTER_HTML,
      text: htmlToText(STARTER_HTML),
    });
  } else if (from.kind === "text") {
    template = await createTemplate(workspace.id, {
      name: "Untitled plain-text email",
      editor: "text",
      text: STARTER_TEXT,
    });
  } else {
    const assets = `${appUrl()}/email`;
    const starter = from.starterId ? findStarter(from.starterId) : null;
    if (from.starterId && !starter) return { error: "That starter no longer exists." };
    const mjml = starter
      ? starter.mjml(assets)
      : emailFromBlocks(assets, ["sc-header", "sc-text", "sc-button", "sc-footer"]);
    const { html } = await compileMjml(mjml);
    template = await createTemplate(workspace.id, {
      name: starter?.name ?? "Untitled template",
      subject: starter?.subject ?? "",
      editor: "visual",
      mjml,
      html,
      text: htmlToText(html),
    });
  }
  redirect(`/w/${slug}/templates/${template.id}`);
}

export async function deleteTemplateAction(slug: string, id: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NO_PERMISSION };
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Not found." };
  await deleteTemplate(workspace.id, id);
  revalidatePath(`/w/${slug}/templates`);
  return { ok: true as const };
}
