"use server";

import {
  applyTemplateToDraft,
  type CampaignDraftChanges,
  countAudience,
  createDraftCampaign,
  getCampaign,
  listSendingDomains,
  listSendingServers,
  queueCampaign,
  scheduleCampaign,
  unscheduleCampaign,
  updateDraftCampaign,
} from "@sendcoop/db";
import { enqueueCampaign } from "@sendcoop/queue";
import { htmlToText } from "@sendcoop/mailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { cleanAudience } from "@/lib/campaign-audience";
import { campaignReadiness } from "@/lib/campaign-ready";
import { sendCampaignTest } from "@/lib/campaign-test";
import { STARTER_HTML, STARTER_TEXT } from "@/lib/code-starters";
import { compileMjml } from "@/lib/compile-mjml";
import { emailFromBlocks } from "@/lib/email-blocks";
import { canManage } from "@/lib/permissions";
import { withinRateLimit } from "@/lib/rate-limit";
import { findStarter } from "@/lib/starters";
import { requireMemberWorkspace } from "@/lib/workspace";

const NO_PERMISSION = "Only workspace owners and admins can change campaigns.";

async function managerWorkspace(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

/** Starts a draft and opens the builder at step 1. */
export async function createCampaignAction(slug: string) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { error: NO_PERMISSION };
  const campaign = await createDraftCampaign(workspace.id, workspace.name);
  redirect(`/w/${slug}/campaigns/${campaign.id}/recipients`);
}

/** How many people an audience reaches right now (the builder's live count). */
export async function countRecipientsAction(slug: string, audience: unknown) {
  const { workspace } = await requireMemberWorkspace(slug);
  const clean = await cleanAudience(workspace.id, audience);
  if (!clean) return { ok: false as const };
  return { ok: true as const, count: await countAudience(workspace.id, clean) };
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the campaign a name.")
  .max(100, "Keep the name under 100 characters.");

export async function saveRecipientsAction(
  slug: string,
  campaignId: string,
  input: { name: string; audience: unknown },
) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false as const, error: NO_PERMISSION };
  if (!z.uuid().safeParse(campaignId).success) return { ok: false as const, error: "Not found." };
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false as const, error: name.error.issues[0]!.message };
  const audience = await cleanAudience(workspace.id, input.audience);
  if (!audience) return { ok: false as const, error: "Choose who gets this campaign." };

  const saved = await updateDraftCampaign(workspace.id, campaignId, { name: name.data, audience });
  if (!saved) return { ok: false as const, error: "This campaign has already been sent." };
  revalidatePath(`/w/${slug}/campaigns`);
  return { ok: true as const, count: await countAudience(workspace.id, audience) };
}

const envelopeSchema = z.object({
  subject: z.string().trim().max(200, "Keep the subject under 200 characters."),
  preheader: z.string().trim().max(200, "Keep the preview text under 200 characters."),
  fromName: z.string().trim().min(1, "Enter a From name.").max(100),
  fromLocal: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._+-]{1,64}$/, "Use letters, numbers, dots or dashes before the @."),
  sendingDomainId: z.uuid("Choose a sending domain.").nullable(),
  sendingServerId: z.uuid("Choose a sending server.").nullable(),
  replyTo: z.union([z.literal(""), z.email("Enter a valid reply-to address.")]),
});

/** Step 2: subject, preview text and sender. */
export async function saveEnvelopeAction(
  slug: string,
  campaignId: string,
  input: z.input<typeof envelopeSchema>,
) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false as const, error: NO_PERMISSION };
  if (!z.uuid().safeParse(campaignId).success) return { ok: false as const, error: "Not found." };
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]!.message };
  const { replyTo, sendingDomainId, sendingServerId, ...rest } = parsed.data;

  // Only this workspace's domains and servers.
  const [domains, servers] = await Promise.all([
    listSendingDomains(workspace.id),
    listSendingServers(workspace.id),
  ]);
  if (sendingDomainId && !domains.some((d) => d.id === sendingDomainId)) {
    return { ok: false as const, error: "Choose one of this workspace's sending domains." };
  }
  if (sendingServerId && !servers.some((s) => s.id === sendingServerId)) {
    return { ok: false as const, error: "Choose one of this workspace's sending servers." };
  }
  const saved = await updateDraftCampaign(workspace.id, campaignId, {
    ...rest,
    sendingDomainId,
    sendingServerId,
    replyTo: replyTo || null,
  });
  if (!saved) return { ok: false as const, error: "This campaign has already been sent." };
  revalidatePath(`/w/${slug}/campaigns/${campaignId}/content`);
  return { ok: true as const };
}

export type ContentSource =
  | { kind: "template"; templateId: string }
  | { kind: "starter"; starterId: string }
  | { kind: "visual" | "html" | "text" };

/**
 * Sets the email's content: copied from a template or gallery starter (then
 * stays here), or a fresh design or code to write (opens the editor).
 */
export async function chooseContentAction(slug: string, campaignId: string, source: ContentSource) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { error: NO_PERMISSION };
  if (!z.uuid().safeParse(campaignId).success) return { error: "Not found." };
  const assets = `${appUrl()}/email`;

  if (source.kind === "template") {
    if (!z.uuid().safeParse(source.templateId).success) return { error: "Template not found." };
    if (!(await applyTemplateToDraft(workspace.id, campaignId, source.templateId))) {
      return { error: "That template or campaign no longer exists." };
    }
    revalidatePath(`/w/${slug}/campaigns/${campaignId}/content`);
    return { ok: true };
  }

  let changes: CampaignDraftChanges;
  if (source.kind === "starter") {
    const starter = findStarter(source.starterId);
    if (!starter) return { error: "That starter no longer exists." };
    const mjml = starter.mjml(assets);
    const { html } = await compileMjml(mjml);
    changes = { editor: "visual", design: null, mjml, html, text: htmlToText(html) };
    const campaign = await getCampaign(workspace.id, campaignId);
    if (campaign && !campaign.subject) changes.subject = starter.subject;
  } else if (source.kind === "visual") {
    const mjml = emailFromBlocks(assets, ["sc-header", "sc-text", "sc-button", "sc-footer"]);
    const { html } = await compileMjml(mjml);
    changes = { editor: "visual", design: null, mjml, html, text: htmlToText(html) };
  } else if (source.kind === "html") {
    changes = {
      editor: "html",
      design: null,
      mjml: null,
      html: STARTER_HTML,
      text: htmlToText(STARTER_HTML),
    };
  } else {
    changes = { editor: "text", design: null, mjml: null, html: "", text: STARTER_TEXT };
  }
  if (!(await updateDraftCampaign(workspace.id, campaignId, changes))) {
    return { error: "This campaign has already been sent." };
  }
  if (source.kind === "starter") {
    revalidatePath(`/w/${slug}/campaigns/${campaignId}/content`);
    return { ok: true };
  }
  redirect(`/w/${slug}/campaigns/${campaignId}/design`);
}

/** Sends the draft to one address, as a recipient would get it. */
export async function sendTestAction(slug: string, campaignId: string, to: string) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false as const, error: NO_PERMISSION };
  const address = z.email().safeParse(to.trim());
  if (!address.success) return { ok: false as const, error: "Enter a valid email address." };
  if (!(await withinRateLimit(`test-email:${workspace.id}`, 20, 3600))) {
    return { ok: false as const, error: "That's a lot of test emails. Try again in an hour." };
  }
  const campaign = z.uuid().safeParse(campaignId).success
    ? await getCampaign(workspace.id, campaignId)
    : null;
  if (!campaign) return { ok: false as const, error: "Not found." };
  const result = await sendCampaignTest(workspace.id, campaign, address.data);
  return result.ok
    ? { ok: true as const, message: `Test sent to ${address.data}.` }
    : { ok: false as const, error: result.error };
}

const launchSchema = z.discriminatedUnion("when", [
  z.object({ when: z.literal("now") }),
  z.object({
    when: z.enum(["later", "subscriber"]),
    local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time."),
    timezone: z.string().min(1).max(64),
  }),
]);

/** Step 3: sends the campaign now, or schedules it. */
export async function launchCampaignAction(
  slug: string,
  campaignId: string,
  input: z.input<typeof launchSchema>,
) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { error: NO_PERMISSION };
  const parsed = launchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const campaign = z.uuid().safeParse(campaignId).success
    ? await getCampaign(workspace.id, campaignId)
    : null;
  if (!campaign || campaign.status !== "draft") return { error: "This campaign isn't a draft." };
  const { ready, items } = await campaignReadiness(workspace.id, campaign);
  if (!ready) return { error: items.find((i) => !i.ok)!.fix };

  if (parsed.data.when === "now") {
    if (!(await queueCampaign(workspace.id, campaign.id))) {
      return { error: "This campaign isn't a draft." };
    }
    await enqueueCampaign({ campaignId: campaign.id, workspaceId: workspace.id });
  } else {
    const result = await scheduleCampaign(workspace.id, campaign.id, {
      local: `${parsed.data.local}:00`,
      timezone: parsed.data.timezone,
      perSubscriber: parsed.data.when === "subscriber",
    });
    if (!result.ok) {
      return {
        error:
          result.error === "past"
            ? "That time has already passed. Choose a time in the future."
            : result.error === "timezone"
              ? "Choose a timezone from the list."
              : "This campaign isn't a draft.",
      };
    }
  }
  revalidatePath(`/w/${slug}/campaigns`);
  redirect(`/w/${slug}/campaigns/${campaign.id}`);
}

/** Cancels a schedule: the campaign goes back to being a draft. */
export async function unscheduleCampaignAction(slug: string, campaignId: string) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { error: NO_PERMISSION };
  if (!z.uuid().safeParse(campaignId).success) return { error: "Not found." };
  if (!(await unscheduleCampaign(workspace.id, campaignId))) {
    return { error: "It has already started sending." };
  }
  revalidatePath(`/w/${slug}/campaigns`);
  redirect(`/w/${slug}/campaigns/${campaignId}/schedule`);
}
