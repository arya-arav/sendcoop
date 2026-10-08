"use server";

import {
  getIntegrationSecret,
  rotateIntegrationSecret,
  setAffiliateDomains,
  setIntegrationConfig,
  setWebhookSigningSecret,
  setUtmSettings,
} from "@sendcoop/db";
import { randomBytes } from "node:crypto";
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

/**
 * Sends a made-up sale to our own postback endpoint, the way a network
 * would, and reports how long it took to be recorded. It's marked as a test
 * and credited to no email, so reports don't count it.
 */
export async function sendTestPostbackAction(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can send tests." };
  }
  const key = await getIntegrationSecret(workspace.id, "postback");
  const tracking = (process.env.TRACKING_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const txid = `test-${randomBytes(6).toString("hex")}`;
  const url = `${tracking}/pb?key=${key}&cid=sc_test&payout=1.00&txid=${txid}&network=test&test=1`;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return {
      ok: false as const,
      error: `The tracking server at ${tracking} didn't answer. Check that it's running and reachable.`,
    };
  }
  const ms = Math.round(performance.now() - started);
  const body = (await response.text()).slice(0, 200);
  revalidatePath(`/w/${slug}/settings/tracking`);
  if (response.status === 403) {
    return {
      ok: false as const,
      error: "Your IP allowlist blocked the test, which comes from Sendcoop's own server.",
    };
  }
  if (!response.ok || !body.startsWith("ok")) {
    return { ok: false as const, error: `The postback was refused: ${response.status} ${body}` };
  }
  return { ok: true as const, ms, txid };
}

export async function rotateApiSecretAction(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  await rotateIntegrationSecret(workspace.id, "api");
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const };
}

/** The secret Shopify signs its webhooks with, from the Shopify admin's webhooks page. */
export async function saveShopifySecretAction(slug: string, secret: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const value = secret.trim();
  if (!/^[\w-]{16,200}$/.test(value)) {
    return {
      ok: false as const,
      error:
        "Paste the signing secret from Shopify's webhooks page (a long string of letters and numbers).",
    };
  }
  await setWebhookSigningSecret(workspace.id, "shopify", value);
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const };
}
