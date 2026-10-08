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
