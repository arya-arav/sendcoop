// Browser-safe. The postback URL to paste into each affiliate network: our
// /pb endpoint with the workspace's key, and the network's own macros, which
// it fills in when it reports a sale.

export type PostbackMacros = {
  /** The sub-id the network returns: our click id. */
  cid: string;
  payout: string;
  txid: string;
  status?: string;
  currency?: string;
};

export type PostbackTemplate = {
  /** AFFILIATE_NETWORKS id, or "custom". */
  id: string;
  name: string;
  /** null when the network has no postback URL setting for affiliates. */
  macros: PostbackMacros | null;
  /** Where to paste it in the network, or what to do instead. */
  instructions: string;
};

export function postbackUrl(
  trackingUrl: string,
  key: string,
  template: { id: string; macros: PostbackMacros },
) {
  const { cid, payout, txid, status, currency } = template.macros;
  const params = [
    `key=${key}`,
    `cid=${cid}`,
    `payout=${payout}`,
    `txid=${txid}`,
    ...(status ? [`status=${status}`] : []),
    ...(currency ? [`currency=${currency}`] : []),
    `network=${template.id}`,
  ];
  // Macros stay as written: networks look for them literally.
  return `${trackingUrl.replace(/\/$/, "")}/pb?${params.join("&")}`;
}

const CHECK = "Some networks rename macros; if yours differ, use the custom option.";

/**
 * Per-network postback setups. Macros are from each network's own docs
 * (October 2026). Where only third-party docs were available the
 * instructions say to check the names.
 */
export const POSTBACK_TEMPLATES: PostbackTemplate[] = [
  {
    id: "clickbank",
    name: "ClickBank",
    macros: {
      cid: "{tid}",
      payout: "{affiliate_earnings}",
      txid: "{receipt_id}",
      status: "{event_type}",
    },
    instructions:
      "In ClickBank: Integrations > Postback/Pixels > Custom Postback/Pixel. Earnings are in USD; refunds and chargebacks reverse the sale.",
  },
  {
    id: "digistore24",
    name: "Digistore24",
    macros: {
      cid: "{sid1}",
      payout: "{amount_affiliate}",
      txid: "{transaction_id}",
      status: "{transaction_type}",
      currency: "{currency}",
    },
    instructions: `In Digistore24: Sales & partners > Integrations > Set up S2S postback. ${CHECK}`,
  },
  {
    id: "impact",
    name: "Impact",
    macros: {
      cid: "{SubId1}",
      payout: "{Payout}",
      txid: "{ActionId}",
      status: "{Status}",
      currency: "{Currency}",
    },
    instructions: `On Impact the brand sets up postbacks for its partners: send this URL to your contact at the brand. ${CHECK}`,
  },
  {
    id: "cj",
    name: "CJ",
    macros: null,
    instructions:
      "CJ doesn't offer publisher postbacks. Its sales arrive through the CJ API instead (coming later); emails still get CJ's sid with the click id.",
  },
  {
    id: "awin",
    name: "Awin",
    macros: {
      cid: "!!!clickRef!!!",
      payout: "!!!commission!!!",
      txid: "!!!transactionId!!!",
      currency: "!!!transactionCurrency!!!",
    },
    instructions:
      "In Awin: Toolbox > Transaction Notifications (you may need to ask Awin support to turn it on). Macros are case-sensitive.",
  },
  {
    id: "shareasale",
    name: "ShareASale",
    macros: null,
    instructions:
      "ShareASale has no affiliate postback, and its programs have moved to Awin: use the Awin postback for them. Emails still get ShareASale's afftrack with the click id.",
  },
  {
    id: "everflow",
    name: "Everflow",
    macros: {
      cid: "{sub1}",
      payout: "{payout_amount}",
      txid: "{transaction_id}",
      currency: "{currency}",
    },
    instructions: "In Everflow: your partner postbacks (globally, or per offer).",
  },
  {
    id: "tune",
    name: "TUNE (HasOffers)",
    macros: {
      cid: "{aff_sub}",
      payout: "{payout}",
      txid: "{transaction_id}",
      currency: "{currency}",
    },
    instructions:
      "In the TUNE network's partner area: Postback / Conversion URL (globally or per offer).",
  },
  {
    id: "maxbounty",
    name: "MaxBounty",
    macros: { cid: "#S1#", payout: "#RATE#", txid: "#LEADID#" },
    instructions: `In MaxBounty: profile settings (global postback) or an offer's Sub-ID & Callbacks. ${CHECK}`,
  },
];
