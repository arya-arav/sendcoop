import { and, asc, eq } from "drizzle-orm";
import { classifyLink, normalizeDomain } from "../affiliate-networks";
import { getDb } from "../client";
import { links, trackingSettings } from "../schema";

export async function getAffiliateDomains(workspaceId: string): Promise<string[]> {
  const [row] = await getDb()
    .select({ domains: trackingSettings.affiliateDomains })
    .from(trackingSettings)
    .where(eq(trackingSettings.workspaceId, workspaceId));
  return row?.domains ?? [];
}

/** Saves the workspace's affiliate domains (normalized, deduplicated). */
export async function setAffiliateDomains(workspaceId: string, domains: string[]) {
  const clean = [...new Set(domains.map(normalizeDomain).filter(Boolean))].slice(0, 200);
  await getDb()
    .insert(trackingSettings)
    .values({ workspaceId, affiliateDomains: clean })
    .onConflictDoUpdate({ target: trackingSettings.workspaceId, set: { affiliateDomains: clean } });
  return clean;
}

/**
 * Stores a campaign version's links, marking affiliate ones. Safe to repeat
 * (a retried prepare step keeps the existing rows).
 */
export async function storeCampaignLinks(
  workspaceId: string,
  campaignId: string,
  variant: "a" | "b",
  found: { url: string; label: string | null; position: number }[],
) {
  if (found.length === 0) return;
  const domains = await getAffiliateDomains(workspaceId);
  await getDb()
    .insert(links)
    .values(
      found.map((link) => ({
        workspaceId,
        campaignId,
        variant,
        position: link.position,
        url: link.url.slice(0, 2000),
        label: link.label,
        ...classifyLink(link.url, domains),
      })),
    )
    .onConflictDoNothing();
}

export async function listCampaignLinks(workspaceId: string, campaignId: string) {
  return getDb()
    .select()
    .from(links)
    .where(and(eq(links.workspaceId, workspaceId), eq(links.campaignId, campaignId)))
    .orderBy(asc(links.variant), asc(links.position));
}

export async function getUtmSettings(workspaceId: string) {
  const [row] = await getDb()
    .select({ addUtm: trackingSettings.addUtm, utmSource: trackingSettings.utmSource })
    .from(trackingSettings)
    .where(eq(trackingSettings.workspaceId, workspaceId));
  return row ?? { addUtm: true, utmSource: "sendcoop" };
}

export async function setUtmSettings(
  workspaceId: string,
  settings: { addUtm: boolean; utmSource: string },
) {
  await getDb()
    .insert(trackingSettings)
    .values({ workspaceId, ...settings })
    .onConflictDoUpdate({ target: trackingSettings.workspaceId, set: settings });
}
