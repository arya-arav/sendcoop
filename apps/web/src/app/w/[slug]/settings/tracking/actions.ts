"use server";

import {
  rotateIntegrationSecret,
  setAffiliateDomains,
  setIntegrationConfig,
  setUtmSettings,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

/** One domain (or link) per line; saved normalized, without duplicates. */
export async function saveAffiliateDomainsAction(slug: string, text: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const domains = await setAffiliateDomains(workspace.id, text.slice(0, 20_000).split(/[\s,]+/));
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const, domains };
}

const utmSchema = z.object({
  addUtm: z.boolean(),
  trackOpens: z.boolean(),
  attributionWindowDays: z.number().int().min(1, "Use 1 to 90 days.").max(90, "Use 1 to 90 days."),
  utmSource: z
    .string()
    .trim()
    .min(1, "Enter a source, e.g. newsletter.")
    .max(50)
    .regex(/^[\w.-]+$/, "Use letters, numbers, dots, dashes or underscores."),
});

export async function saveUtmSettingsAction(slug: string, input: z.input<typeof utmSchema>) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const parsed = utmSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]!.message };
  await setUtmSettings(workspace.id, parsed.data);
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const };
}

export async function rotatePostbackKeyAction(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  await rotateIntegrationSecret(workspace.id, "postback");
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const };
}

/** One IP or IPv4 range (CIDR) per line; empty allows any. */
export async function savePostbackIpsAction(slug: string, text: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const entries = [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((e) => e.trim())
        .filter(Boolean),
    ),
  ];
  const valid = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12][0-9]|3[0-2]))?$|^[0-9a-f:]+$/i;
  const bad = entries.find((e) => !valid.test(e));
  if (bad) return { ok: false as const, error: `“${bad}” isn't an IP address or range.` };
  await setIntegrationConfig(workspace.id, "postback", { allowedIps: entries.slice(0, 50) });
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const, ips: entries.slice(0, 50) };
}
