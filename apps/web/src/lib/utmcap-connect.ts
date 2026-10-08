import { getIntegrationSecret, rememberUtmcapDomains, saveUtmcapConnection } from "@sendcoop/db";
import { UtmcapClient, UtmcapError } from "@sendcoop/utmcap";

// One-click UTMCAP setup (D56). With the user's API key, Sendcoop registers
// itself in their UTMCAP account as a traffic source, like an ad network:
//   - the click id (sc_cid) is its external id, and sub1–sub4 carry the email
//     campaign, automation, list or segment, and link;
//   - its postback URL is Sendcoop's /pb/utmcap, so UTMCAP reports approved
//     conversions on those clicks back to us;
// and subscribes a webhook to conversion.created/updated, for status changes
// and chargebacks. Not a "use server" file: it takes a workspace id as given.

export const SENDCOOP_TOKEN_MACROS = {
  sub1: "{email_campaign}",
  sub2: "{automation}",
  sub3: "{audience}",
  sub4: "{link}",
};

const trackingUrl = () => (process.env.TRACKING_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** The postback URL UTMCAP calls; {…} are UTMCAP's macros for the source postback. */
export function utmcapPostbackUrl(key: string) {
  return `${trackingUrl()}/pb/utmcap?key=${key}&sc_cid={external_id}&ucid={utmcap_id}&payout={payout}&status={status}`;
}

export function utmcapWebhookUrl(key: string) {
  return `${trackingUrl()}/wh/utmcap/${key}`;
}

const MESSAGES: Record<string, string> = {
  unauthorized: "UTMCAP didn't accept that API key. Copy it again from Settings → API in UTMCAP.",
  read_only_key: "That key is read-only. Make a key with write access in UTMCAP (Settings → API).",
  plan_limit: "Your UTMCAP plan doesn't include the API or webhooks (Growth and up).",
  too_many: "Your UTMCAP account already has 10 webhook endpoints. Remove one, then connect again.",
  invalid_url:
    "UTMCAP needs a public https address for Sendcoop; this install's tracking URL isn't one.",
  network: "UTMCAP didn't answer. Try again in a minute.",
};

export async function connectUtmcap(workspaceId: string, workspaceName: string, apiKey: string) {
  const client = new UtmcapClient({ apiKey });
  const key = await getIntegrationSecret(workspaceId, "utmcap");
  const postbackUrl = utmcapPostbackUrl(key);
  try {
    // Reuse the source from an earlier connection (same postback key).
    const sources = await client.listTrafficSources();
    const source =
      sources.find((s) => s.postback_url?.includes(`key=${key}&`)) ??
      (await client.createTrafficSource(
        {
          name: sources.some((s) => s.name === "Sendcoop")
            ? `Sendcoop (${workspaceName})`
            : "Sendcoop",
          external_id_param: "sc_cid",
          token_macros: SENDCOOP_TOKEN_MACROS,
          postback_url: postbackUrl,
          notes:
            "Email clicks from Sendcoop. Created by Sendcoop; it reports conversions back to it.",
          tags: ["email", "sendcoop"],
        },
        `sendcoop-source-${workspaceId}`,
      ));
    const webhook = await client.createWebhook(
      {
        url: utmcapWebhookUrl(key),
        events: ["conversion.created", "conversion.updated"],
        name: `Sendcoop (${workspaceName})`,
      },
      `sendcoop-webhook-${workspaceId}-${Date.now()}`,
    );
    // Links to the account's tracking domains become UTMCAP links (sc_cid, sub1-4).
    const campaigns = await client.listCampaigns().catch(() => []);
    const domains = campaigns.flatMap((c) => (c.domain ? [c.domain.split(":")[0]!] : []));
    await rememberUtmcapDomains(workspaceId, domains);
    await saveUtmcapConnection(workspaceId, {
      apiKey,
      sourceId: source.id,
      sourceName: source.name,
      webhookId: webhook.id,
      webhookSecret: webhook.secret,
    });
    return { ok: true as const, sourceName: source.name };
  } catch (error) {
    if (error instanceof UtmcapError) {
      return { ok: false as const, error: MESSAGES[error.code] ?? `UTMCAP said: ${error.message}` };
    }
    throw error;
  }
}
