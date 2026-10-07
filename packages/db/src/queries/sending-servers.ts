import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { sendingServers, type SendingServerType } from "../schema";
import { decryptSecret, encryptSecret } from "../secrets";

// Scoped by workspaceId. The driver config (with credentials) is stored as one
// encrypted JSON value; callers validate it with @sendcoop/mailer's schema.

const viewColumns = {
  id: sendingServers.id,
  name: sendingServers.name,
  type: sendingServers.type,
  summary: sendingServers.summary,
  maxPerSecond: sendingServers.maxPerSecond,
  maxPerHour: sendingServers.maxPerHour,
  maxPerDay: sendingServers.maxPerDay,
  createdAt: sendingServers.createdAt,
  updatedAt: sendingServers.updatedAt,
};

export type SendingServerView = {
  id: string;
  name: string;
  type: SendingServerType;
  summary: string;
  maxPerSecond: number | null;
  maxPerHour: number | null;
  maxPerDay: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SendingLimits = {
  maxPerSecond: number | null;
  maxPerHour: number | null;
  maxPerDay: number | null;
};

export type SendingServerInput = {
  name: string;
  type: SendingServerType;
  summary: string;
  config: Record<string, unknown>;
  limits?: SendingLimits;
};

export async function listSendingServers(workspaceId: string): Promise<SendingServerView[]> {
  return getDb()
    .select(viewColumns)
    .from(sendingServers)
    .where(eq(sendingServers.workspaceId, workspaceId))
    .orderBy(asc(sendingServers.createdAt));
}

export async function getSendingServer(
  workspaceId: string,
  serverId: string,
): Promise<SendingServerView | null> {
  const [row] = await getDb()
    .select(viewColumns)
    .from(sendingServers)
    .where(and(eq(sendingServers.id, serverId), eq(sendingServers.workspaceId, workspaceId)));
  return row ?? null;
}

export async function createSendingServer(workspaceId: string, input: SendingServerInput) {
  const [row] = await getDb()
    .insert(sendingServers)
    .values({
      workspaceId,
      name: input.name,
      type: input.type,
      summary: input.summary,
      configEncrypted: encryptSecret(JSON.stringify(input.config)),
      ...input.limits,
    })
    .returning(viewColumns);
  return row!;
}

export async function updateSendingServer(
  workspaceId: string,
  serverId: string,
  input: Omit<SendingServerInput, "type">,
) {
  const [row] = await getDb()
    .update(sendingServers)
    .set({
      name: input.name,
      summary: input.summary,
      configEncrypted: encryptSecret(JSON.stringify(input.config)),
      ...input.limits,
    })
    .where(and(eq(sendingServers.id, serverId), eq(sendingServers.workspaceId, workspaceId)))
    .returning(viewColumns);
  return row ?? null;
}

export async function deleteSendingServer(workspaceId: string, serverId: string) {
  const deleted = await getDb()
    .delete(sendingServers)
    .where(and(eq(sendingServers.id, serverId), eq(sendingServers.workspaceId, workspaceId)))
    .returning({ id: sendingServers.id });
  return deleted.length > 0;
}

/** The decrypted driver config, for sending and for editing (secrets kept server-side). */
export async function getSendingServerConfig(
  workspaceId: string,
  serverId: string,
): Promise<{ type: SendingServerType; config: Record<string, unknown> } | null> {
  const [row] = await getDb()
    .select({ type: sendingServers.type, encrypted: sendingServers.configEncrypted })
    .from(sendingServers)
    .where(and(eq(sendingServers.id, serverId), eq(sendingServers.workspaceId, workspaceId)));
  if (!row) return null;
  return { type: row.type, config: JSON.parse(decryptSecret(row.encrypted)) };
}
