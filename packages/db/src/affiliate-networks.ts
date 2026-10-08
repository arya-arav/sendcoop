// Browser-safe: no runtime imports. Recognizes affiliate links by network,
// so emails can report which links earn money, and (D38) pass the click id
// in the network's sub-id parameter for postback attribution.

export type AffiliateNetwork = {
  id: string;
  name: string;
  /** Where the network puts our click id, so its postback can return it. */
  subidParam: string;
  matches: (url: URL) => boolean;
};

const hostIs = (url: URL, ...domains: string[]) =>
  domains.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`));

export const AFFILIATE_NETWORKS: AffiliateNetwork[] = [
  {
    id: "clickbank",
    name: "ClickBank",
    subidParam: "tid",
    matches: (u) => hostIs(u, "hop.clickbank.net") || /\.hop\.clickbank\.net$/.test(u.hostname),
  },
  {
    id: "digistore24",
    name: "Digistore24",
    subidParam: "sid1",
    matches: (u) =>
      (hostIs(u, "digistore24.com") && u.pathname.startsWith("/redir/")) ||
      hostIs(u, "checkout-ds24.com"),
  },
  {
    id: "impact",
    name: "Impact",
    subidParam: "subId1",
    matches: (u) => hostIs(u, "sjv.io", "pxf.io", "evyy.net", "7eer.net", "ojrq.net", "r7c3.net"),
  },
  {
    id: "cj",
    name: "CJ",
    subidParam: "sid",
    matches: (u) =>
      hostIs(
        u,
        "anrdoezrs.net",
        "dpbolvw.net",
        "jdoqocy.com",
        "kqzyfj.com",
        "tkqlhce.com",
        "qksrv.net",
        "emjcd.com",
      ),
  },
  {
    id: "awin",
    name: "Awin",
    subidParam: "clickref",
    matches: (u) => hostIs(u, "awin1.com"),
  },
  {
    id: "shareasale",
    name: "ShareASale",
    subidParam: "afftrack",
    matches: (u) => hostIs(u, "shareasale.com") && u.pathname.startsWith("/r.cfm"),
  },
  {
    id: "maxbounty",
    name: "MaxBounty",
    subidParam: "s1",
    matches: (u) => /^afflat\d*[a-z0-9]*\.com$/.test(u.hostname.replace(/^www\./, "")),
  },
  {
    id: "tune",
    name: "TUNE (HasOffers)",
    subidParam: "aff_sub",
    matches: (u) => u.pathname === "/aff_c" && u.searchParams.has("offer_id"),
  },
  {
    id: "everflow",
    name: "Everflow",
    subidParam: "sub1",
    // Everflow links live on each network's own domain; their parameters give them away.
    matches: (u) => u.searchParams.has("oid") && u.searchParams.has("affid"),
  },
  {
    id: "amazon",
    name: "Amazon Associates",
    subidParam: "ascsubtag",
    matches: (u) =>
      hostIs(u, "amzn.to") ||
      (/(^|\.)amazon\.[a-z.]+$/.test(u.hostname) && u.searchParams.has("tag")),
  },
];

export type LinkKind = { isAffiliate: boolean; networkId: string | null };

/** Normalizes "Shop.Example.com", "https://shop.example.com/x" etc. to "shop.example.com". */
export function normalizeDomain(input: string) {
  const value = input.trim().toLowerCase();
  if (!value) return "";
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return "";
  }
}

/**
 * Whether a link is an affiliate link: a known network's, or on one of the
 * workspace's own affiliate domains (subdomains included).
 */
/** Links to these hosts are UTMCAP campaign links (the workspace's UTMCAP tracking domains). */
export function classifyLink(
  href: string,
  affiliateDomains: string[] = [],
  utmcapDomains: string[] = [],
): LinkKind {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { isAffiliate: false, networkId: null };
  }
  const host = url.hostname.replace(/^www\./, "");
  if (utmcapDomains.some((d) => d && host === d.replace(/^www\./, "").toLowerCase())) {
    return { isAffiliate: true, networkId: "utmcap" };
  }
  const network = AFFILIATE_NETWORKS.find((n) => n.matches(url));
  if (network) return { isAffiliate: true, networkId: network.id };
  const custom = affiliateDomains.some((d) => d && (host === d || host.endsWith(`.${d}`)));
  return { isAffiliate: custom, networkId: custom ? "custom" : null };
}

export function networkName(id: string | null) {
  if (id === "custom") return "Your affiliate domain";
  if (id === "utmcap") return "UTMCAP";
  return AFFILIATE_NETWORKS.find((n) => n.id === id)?.name ?? null;
}
