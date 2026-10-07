import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { type SendingDomain, sendingDomains } from "../schema";
import { decryptSecret, encryptSecret } from "../secrets";
import { generateDkimKeys } from "../sending-domains";
import { isUniqueViolation } from "./errors";

// Scoped by workspaceId. The DKIM private key never leaves this module
// unencrypted except through getDkimSigningKey, for the sending worker.

/** A domain without its encrypted private key, safe to pass to pages. */
export type SendingDomainView = Omit<SendingDomain, "dkimPrivateKeyEncrypted">;

const viewColumns = {
  id: sendingDomains.id,
  workspaceId: sendingDomains.workspaceId,
  domain: sendingDomains.domain,
  dkimSelector: sendingDomains.dkimSelector,
  dkimPublicKey: sendingDomains.dkimPublicKey,
  status: sendingDomains.status,
  spfVerified: sendingDomains.spfVerified,
  dkimVerified: sendingDomains.dkimVerified,
  dmarcVerified: sendingDomains.dmarcVerified,
  lastCheckedAt: sendingDomains.lastCheckedAt,
  verifiedAt: sendingDomains.verifiedAt,
  createdAt: sendingDomains.createdAt,
  updatedAt: sendingDomains.updatedAt,
};

export async function listSendingDomains(workspaceId: string): Promise<SendingDomainView[]> {
  return getDb()
    .select(viewColumns)
    .from(sendingDomains)
    .where(eq(sendingDomains.workspaceId, workspaceId))
    .orderBy(asc(sendingDomains.domain));
}

export async function getSendingDomain(
  workspaceId: string,
  domainId: string,
): Promise<SendingDomainView | null> {
  const [row] = await getDb()
    .select(viewColumns)
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.workspaceId, workspaceId)));
  return row ?? null;
}

/** Adds a (normalised) domain with a fresh DKIM key. */
export async function addSendingDomain(
  workspaceId: string,
  domain: string,
): Promise<{ ok: true; domain: SendingDomainView } | { ok: false; error: "duplicate" }> {
  const keys = generateDkimKeys();
  try {
    const [row] = await getDb()
      .insert(sendingDomains)
      .values({
        workspaceId,
        domain,
        dkimSelector: keys.selector,
        dkimPublicKey: keys.publicKey,
        dkimPrivateKeyEncrypted: encryptSecret(keys.privateKeyPem),
      })
      .returning(viewColumns);
    return { ok: true, domain: row! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

export async function deleteSendingDomain(workspaceId: string, domainId: string) {
  const deleted = await getDb()
    .delete(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.workspaceId, workspaceId)))
    .returning({ id: sendingDomains.id });
  return deleted.length > 0;
}

/** For signing outgoing mail: the selector and decrypted private key. */
export async function getDkimSigningKey(workspaceId: string, domain: string) {
  const [row] = await getDb()
    .select({
      selector: sendingDomains.dkimSelector,
      encrypted: sendingDomains.dkimPrivateKeyEncrypted,
      status: sendingDomains.status,
    })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.workspaceId, workspaceId), eq(sendingDomains.domain, domain)));
  if (!row) return null;
  return {
    selector: row.selector,
    privateKeyPem: decryptSecret(row.encrypted),
    status: row.status,
  };
}
