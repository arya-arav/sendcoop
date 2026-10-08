import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../client";
import { apiKeys } from "../schema";

// Keys for the REST API (D77). A key is shown once when it's made; only its
// SHA-256 is kept, plus its first characters so people can tell keys apart.

const PREFIX = "sc_live_";

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Makes a key; returns the key itself, which can't be shown again. */
export async function createApiKey(workspaceId: string, name: string, createdBy: string | null) {
  const key = PREFIX + randomBytes(24).toString("base64url");
  const [row] = await getDb()
    .insert(apiKeys)
    .values({
      workspaceId,
      name,
      hint: key.slice(0, PREFIX.length + 4),
      keyHash: hashApiKey(key),
      createdBy,
    })
    .returning({ id: apiKeys.id });
  return { id: row!.id, key };
}

export async function listApiKeys(workspaceId: string) {
  return getDb()
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      hint: apiKeys.hint,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(workspaceId: string, keyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(keyId)) return false;
  const rows = await getDb()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiKeys.workspaceId, workspaceId), eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)),
    )
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

/** The workspace a live key belongs to, or null; notes when it was last used. */
export async function authenticateApiKey(key: string) {
  if (!key.startsWith(PREFIX) || key.length > 100) return null;
  const [row] = await getDb()
    .update(apiKeys)
    // At most one write a minute per key.
    .set({
      lastUsedAt: sql`case when ${apiKeys.lastUsedAt} is null or ${apiKeys.lastUsedAt} < now() - interval '1 minute' then now() else ${apiKeys.lastUsedAt} end`,
    })
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, workspaceId: apiKeys.workspaceId });
  return row ?? null;
}
