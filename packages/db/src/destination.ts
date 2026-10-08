// Browser-safe. Where a click actually goes: the link's URL plus what lets
// the next hop attribute the visit to this email.
//
// - Ordinary links and the workspace's own affiliate domains get UTM tags
//   (kept if the link already has its own) and sc_cid, the click id, which
//   landing pages, stores and UTMCAP pick up.
// - UTMCAP campaign links get sc_cid (the Sendcoop traffic source's external
//   id) and sub1-sub4: email campaign, automation, list or segment, link.
// - Known affiliate networks' links get the click id in the network's sub-id
//   parameter instead (and nothing else, since networks' redirects can drop
//   or choke on extra parameters). The network's postback returns it.

import { AFFILIATE_NETWORKS } from "./affiliate-networks";

export type DestinationOptions = {
  clickId: string;
  networkId: string | null;
  campaignName: string;
  /** The link's text, for utm_content. */
  label: string | null;
  position: number;
  addUtm: boolean;
  utmSource: string;
  /** The campaign's lists or segments, for UTMCAP's sub3. */
  audience?: string | null;
  /** The automation it was sent by, for UTMCAP's sub2 (automations arrive in phase 7). */
  automationName?: string | null;
};

/** "October Promo: 40% off!" -> "october-promo-40-off" */
export function slugForUtm(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "email"
  );
}

export function decorateDestination(url: string, options: DestinationOptions): string {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return url;
  }

  if (options.networkId === "utmcap") {
    const subs: Record<string, string | null | undefined> = {
      sc_cid: options.clickId,
      sub1: slugForUtm(options.campaignName),
      sub2: options.automationName ? slugForUtm(options.automationName) : null,
      sub3: options.audience ? slugForUtm(options.audience) : null,
      sub4: options.label ? slugForUtm(options.label) : `link-${options.position + 1}`,
    };
    for (const [key, value] of Object.entries(subs)) {
      if (value) target.searchParams.set(key, value);
    }
    return target.toString();
  }

  const network = AFFILIATE_NETWORKS.find((n) => n.id === options.networkId);
  if (network) {
    // The click id must reach the network's postback, so it replaces any value there.
    target.searchParams.set(network.subidParam, options.clickId);
    return target.toString();
  }

  if (options.addUtm) {
    const utm: Record<string, string> = {
      utm_source: options.utmSource,
      utm_medium: "email",
      utm_campaign: slugForUtm(options.campaignName),
      utm_content: options.label ? slugForUtm(options.label) : `link-${options.position + 1}`,
    };
    for (const [key, value] of Object.entries(utm)) {
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    }
  }
  target.searchParams.set("sc_cid", options.clickId);
  return target.toString();
}
