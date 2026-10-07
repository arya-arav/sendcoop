import { createSign, createVerify } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { sendingDomains, workspaces } from "../schema";
import {
  addSendingDomain,
  deleteSendingDomain,
  getDkimSigningKey,
  getSendingDomain,
  listSendingDomains,
} from "./sending-domains";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Domains", slug: `int-domains-${run}` },
      { name: "Domains other", slug: `int-domains-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await getSql().end();
});

describe("sending domains", () => {
  it("stores the DKIM private key encrypted and signs with it", async () => {
    const added = await addSendingDomain(ws, "mail.acme.test");
    if (!added.ok) throw new Error("add failed");
    expect(added.domain).not.toHaveProperty("dkimPrivateKeyEncrypted");
    expect(added.domain.status).toBe("pending");

    const [raw] = await db
      .select({ encrypted: sendingDomains.dkimPrivateKeyEncrypted })
      .from(sendingDomains)
      .where(eq(sendingDomains.id, added.domain.id));
    expect(raw?.encrypted).toMatch(/^v1:/);
    expect(raw?.encrypted).not.toContain("PRIVATE KEY");

    const key = await getDkimSigningKey(ws, "mail.acme.test");
    const signature = createSign("sha256").update("mail").sign(key!.privateKeyPem);
    const publicPem = `-----BEGIN PUBLIC KEY-----\n${added.domain.dkimPublicKey}\n-----END PUBLIC KEY-----`;
    expect(createVerify("sha256").update("mail").verify(publicPem, signature)).toBe(true);
  });

  it("refuses the same domain twice in a workspace, not across workspaces", async () => {
    expect(await addSendingDomain(ws, "mail.acme.test")).toEqual({ ok: false, error: "duplicate" });
    expect((await addSendingDomain(other, "mail.acme.test")).ok).toBe(true);
  });

  it("keeps workspaces apart", async () => {
    const [mine] = await listSendingDomains(ws);
    expect(await getSendingDomain(other, mine!.id)).toBeNull();
    expect(await deleteSendingDomain(other, mine!.id)).toBe(false);
    expect(await getDkimSigningKey(other, "nope.test")).toBeNull();
    expect(await deleteSendingDomain(ws, mine!.id)).toBe(true);
    expect(await listSendingDomains(ws)).toEqual([]);
  });
});
