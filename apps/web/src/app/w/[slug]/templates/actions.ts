"use server";

import { createTemplate, deleteTemplate } from "@sendcoop/db";
import { htmlToText } from "@sendcoop/mailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { appUrl } from "@/lib/app-url";
import { compileMjml } from "@/lib/compile-mjml";
import { emailFromBlocks } from "@/lib/email-blocks";
import { findStarter } from "@/lib/starters";

const NO_PERMISSION = "Only workspace owners and admins can change templates.";

/**
 * Creates a visual template, from a gallery starter or from scratch (a
 * simple layout), and opens it in the editor.
 */
export async function createTemplateAction(slug: string, starterId?: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { error: NO_PERMISSION };
  const assets = `${appUrl()}/email`;
  const starter = starterId ? findStarter(starterId) : null;
  if (starterId && !starter) return { error: "That starter no longer exists." };
  const mjml = starter
    ? starter.mjml(assets)
    : emailFromBlocks(assets, ["sc-header", "sc-text", "sc-button", "sc-footer"]);
  const { html } = await compileMjml(mjml);
  const template = await createTemplate(workspace.id, {
    name: starter?.name ?? "Untitled template",
    subject: starter?.subject ?? "",
    editor: "visual",
    mjml,
    html,
    text: htmlToText(html),
  });
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
