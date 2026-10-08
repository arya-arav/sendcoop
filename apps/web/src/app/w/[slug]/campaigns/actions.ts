"use server";

import {
  applyTemplateToDraft,
  type CampaignDraftChanges,
  cancelCampaign,
  countAudience,
  createDraftCampaign,
  featureProblem,
  getCampaign,
  getTemplate,
  getVariantB,
  listSendingDomains,
  listSendingServers,
  pauseCampaign,
  queueCampaign,
  scheduleCampaign,
  setAbTest,
  setCampaignCost,
  unscheduleCampaign,
  updateDraftCampaign,
  type VariantB,
} from "@sendcoop/db";
import { enqueueCampaign } from "@sendcoop/queue";
import { htmlToText } from "@sendcoop/mailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { cleanAudience } from "@/lib/campaign-audience";
import { resumeCampaignSending } from "@/lib/campaign-control";
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

const abSchema = z.object({
  enabled: z.boolean(),
  testPercent: z.number().int().min(10).max(50),
  waitHours: z.number().int().min(1).max(72),
  metric: z.enum(["clicks", "revenue"]),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters."),
  preheader: z.string().trim().max(200),
  /** "same" (A's email), "keep" (B's current email), or "template:<id>" / "starter:<id>". */
  content: z.string().max(100),
});

/** Turns the A/B test on (saving variant B) or off. */
export async function saveAbTestAction(
  slug: string,
  campaignId: string,
  input: z.input<typeof abSchema>,
) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false as const, error: NO_PERMISSION };
  const parsed = abSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]!.message };
  const campaign = z.uuid().safeParse(campaignId).success
    ? await getCampaign(workspace.id, campaignId)
    : null;
  if (!campaign || campaign.status !== "draft") {
    return { ok: false as const, error: "This campaign isn't a draft." };
  }
  const a = parsed.data;
  if (a.enabled) {
    const blocked = await featureProblem(workspace.id, "abTests");
    if (blocked) return { ok: false as const, error: blocked };
  }
  if (!a.enabled) {
    await setAbTest(workspace.id, campaign.id, null);
    revalidatePath(`/w/${slug}/campaigns/${campaign.id}/content`);
    return { ok: true as const };
  }
  if (!a.subject) return { ok: false as const, error: "Write version B's subject." };

  // Version B's email: A's, B's current one, or a template's or starter's.
  let content: VariantB | null = null;
  if (a.content === "same") {
    content = { ...campaign, subject: "", preheader: "" };
  } else if (a.content === "keep") {
    const existing = await getVariantB(campaign.id);
    if (existing) content = existing;
  } else if (a.content.startsWith("template:")) {
    const template = await getTemplate(workspace.id, a.content.slice(9));
    if (template) content = { ...template, subject: "", preheader: "" };
  } else if (a.content.startsWith("starter:")) {
    const starter = findStarter(a.content.slice(8));
    if (starter) {
      const mjml = starter.mjml(`${appUrl()}/email`);
      const { html } = await compileMjml(mjml);
      content = {
        editor: "visual",
        design: null,
        mjml,
        html,
        text: htmlToText(html),
        subject: "",
        preheader: "",
      };
    }
  }
  if (!content) return { ok: false as const, error: "Choose version B's email." };

  const { editor, design, mjml, html, text } = content;
  await setAbTest(workspace.id, campaign.id, {
    settings: { testPercent: a.testPercent, waitMinutes: a.waitHours * 60, metric: a.metric },
    variant: { subject: a.subject, preheader: a.preheader, editor, design, mjml, html, text },
  });
  revalidatePath(`/w/${slug}/campaigns/${campaign.id}/content`);
  return { ok: true as const };
}

/** Pause, resume or cancel, from the campaign page or the list. */
export async function controlCampaignAction(
  slug: string,
  campaignId: string,
  command: "pause" | "resume" | "cancel",
) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false as const, error: NO_PERMISSION };
  if (!z.uuid().safeParse(campaignId).success) return { ok: false as const, error: "Not found." };
  const done =
    command === "pause"
      ? (await pauseCampaign(workspace.id, campaignId)) !== null
      : command === "resume"
        ? await resumeCampaignSending(workspace.id, campaignId)
        : await cancelCampaign(workspace.id, campaignId);
  if (!done) {
    return { ok: false as const, error: "The campaign's status changed. Refresh the page." };
  }
  revalidatePath(`/w/${slug}/campaigns`);
  revalidatePath(`/w/${slug}/campaigns/${campaignId}`);
  return { ok: true as const };
}

/** What the campaign cost, for ROI in revenue reports. Empty clears it. */
export async function setCampaignCostAction(slug: string, campaignId: string, raw: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const text = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  const cost = text === "" ? null : Number(text);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 1e9)) {
    return { ok: false as const, error: "Enter an amount, e.g. 250, or leave it empty." };
  }
  const saved = await setCampaignCost(
    workspace.id,
    campaignId,
    cost === null ? null : Math.round(cost * 100) / 100,
  );
  if (!saved) return { ok: false as const, error: "This campaign doesn't exist anymore." };
  revalidatePath(`/w/${slug}/campaigns/${campaignId}`);
  revalidatePath(`/w/${slug}/revenue`);
  return { ok: true as const };
}
