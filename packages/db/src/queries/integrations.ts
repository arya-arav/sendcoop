import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { type IntegrationKind, integrations } from "../schema";
import { decryptSecret, encryptSecret } from "../secrets";

// Per-workspace secrets for receiving conversions: the postback key in
// affiliate networks' postback URLs, the pixel and API keys, webhook secrets.

const PREFIX: Record<IntegrationKind, string> = {
  postback: "pk",
  pixel: "px",
  api: "sk",
  shopify: "sh",
  woocommerce: "wc",
  utmcap: "ut",
  leads: "ld",
  webhooks: "whs",
};

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** "pk_" + 32 letters and digits (190 bits): safe in any URL. */
function newSecret(kind: IntegrationKind) {
  let out = "";
  while (out.length < 32) {
    for (const byte of randomBytes(40)) {
      if (byte < 248 && out.length < 32) out += ALPHABET[byte % 62];
    }
  }
  return `${PREFIX[kind]}_${out}`;
}

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** The workspace's secret of this kind, created on first use. */
export async function getIntegrationSecret(
  workspaceId: string,
  kind: IntegrationKind,
): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ secret: integrations.secretEncrypted })
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)));
  if (existing) return decryptSecret(existing.secret);
  const secret = newSecret(kind);
  const [created] = await db
    .insert(integrations)
    .values({ workspaceId, kind, secretEncrypted: encryptSecret(secret), secretHash: hash(secret) })
    .onConflictDoNothing()
    .returning({ id: integrations.id });
  // Created at the same moment elsewhere: use that one.
  return created ? secret : getIntegrationSecret(workspaceId, kind);
}

/** Replaces the secret: URLs with the old one stop working. */
export async function rotateIntegrationSecret(workspaceId: string, kind: IntegrationKind) {
  const secret = newSecret(kind);
  await getDb()
    .insert(integrations)
    .values({ workspaceId, kind, secretEncrypted: encryptSecret(secret), secretHash: hash(secret) })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.kind],
      set: { secretEncrypted: encryptSecret(secret), secretHash: hash(secret) },
    });
  return secret;
}

/** The workspace a secret belongs to (and its settings), or null. */
export async function findIntegrationBySecret(kind: IntegrationKind, secret: string) {
  if (!secret.startsWith(`${PREFIX[kind]}_`) || secret.length > 64) return null;
  const [row] = await getDb()
    .select({ workspaceId: integrations.workspaceId, config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.kind, kind), eq(integrations.secretHash, hash(secret))));
  return row ?? null;
}

export async function setIntegrationConfig(
  workspaceId: string,
  kind: IntegrationKind,
  config: Record<string, unknown>,
) {
  await getIntegrationSecret(workspaceId, kind); // make sure the row exists
  await getDb()
    .update(integrations)
    .set({ config })
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)));
}

export async function getIntegrationConfig(workspaceId: string, kind: IntegrationKind) {
  const [row] = await getDb()
    .select({ config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)));
  return row?.config ?? {};
}

/** The workspace's secret of this kind if it has one: never creates it. */
export async function readIntegrationSecret(workspaceId: string, kind: IntegrationKind) {
  const [row] = await getDb()
    .select({ secret: integrations.secretEncrypted })
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)));
  return row ? decryptSecret(row.secret) : null;
}

/**
 * A secret a platform signs its webhooks with (Shopify, WooCommerce): theirs,
 * pasted in by the user, stored encrypted in the integration's settings.
 */
export async function setWebhookSigningSecret(
  workspaceId: string,
  kind: IntegrationKind,
  secret: string | null,
) {
  const config = await getIntegrationConfig(workspaceId, kind);
  await setIntegrationConfig(workspaceId, kind, {
    ...config,
    signingSecret: secret ? encryptSecret(secret) : null,
  });
}

export function webhookSigningSecret(config: Record<string, unknown>) {
  return typeof config.signingSecret === "string" ? decryptSecret(config.signingSecret) : null;
}

/** A signing secret we choose for the user to paste into the platform (WooCommerce). */
export async function getOrCreateWebhookSigningSecret(workspaceId: string, kind: IntegrationKind) {
  const existing = webhookSigningSecret(await getIntegrationConfig(workspaceId, kind));
  if (existing) return existing;
  const secret = newSecret(kind).slice(3); // no prefix: it isn't one of our keys
  await setWebhookSigningSecret(workspaceId, kind, secret);
  return secret;
}

export type UtmcapConnection = {
  apiKey: string;
  sourceId: string;
  sourceName: string;
  webhookId: string;
  connectedAt: string;
};

/** UTMCAP (D56): the user's API key and what Sendcoop set up in their account. */
export async function saveUtmcapConnection(
  workspaceId: string,
  connection: Omit<UtmcapConnection, "connectedAt"> & { webhookSecret: string },
) {
  await getIntegrationSecret(workspaceId, "utmcap");
  // Kept: what was learnt before, such as the tracking domains.
  const previous = await getIntegrationConfig(workspaceId, "utmcap");
  await setIntegrationConfig(workspaceId, "utmcap", {
    ...previous,
    apiKey: encryptSecret(connection.apiKey),
    sourceId: connection.sourceId,
    sourceName: connection.sourceName,
    webhookId: connection.webhookId,
    signingSecret: encryptSecret(connection.webhookSecret),
    connectedAt: new Date().toISOString(),
  });
}

export async function getUtmcapConnection(workspaceId: string): Promise<UtmcapConnection | null> {
  const config = await getIntegrationConfig(workspaceId, "utmcap");
  if (typeof config.apiKey !== "string" || typeof config.sourceId !== "string") return null;
  return {
    apiKey: decryptSecret(config.apiKey),
    sourceId: config.sourceId,
    sourceName: String(config.sourceName ?? "Sendcoop"),
    webhookId: String(config.webhookId ?? ""),
    connectedAt: String(config.connectedAt ?? ""),
  };
}

/** The workspace's UTMCAP tracking domains: links to them get sc_cid and sub1-4 (D57). */
export async function rememberUtmcapDomains(workspaceId: string, domains: string[]) {
  const config = await getIntegrationConfig(workspaceId, "utmcap");
  const known = Array.isArray(config.domains) ? config.domains.map(String) : [];
  const merged = [
    ...new Set([...known, ...domains.map((d) => d.toLowerCase().replace(/^www\./, ""))]),
  ];
  if (merged.length !== known.length) {
    await setIntegrationConfig(workspaceId, "utmcap", { ...config, domains: merged.slice(0, 50) });
  }
}

/** Forgets the key; Sendcoop's source and webhook stay in UTMCAP until the user removes them. */
export async function clearUtmcapConnection(workspaceId: string) {
  await setIntegrationConfig(workspaceId, "utmcap", {});
}
