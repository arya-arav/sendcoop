import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { integrations, workspaces } from "../schema";
import {
  findIntegrationBySecret,
  getIntegrationConfig,
  getIntegrationSecret,
  rotateIntegrationSecret,
  setIntegrationConfig,
} from "./integrations";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Keys", slug: `int-keys-${run}` },
      { name: "Keys other", slug: `int-keys-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await getSql().end();
});

describe("postback keys", () => {
  it("are made once per workspace, stored encrypted and hashed", async () => {
    const key = await getIntegrationSecret(ws, "postback");
    expect(key).toMatch(/^pk_[0-9A-Za-z]{32}$/);
    expect(await getIntegrationSecret(ws, "postback")).toBe(key);
    expect(await getIntegrationSecret(other, "postback")).not.toBe(key);

    const [row] = await db
      .select()
      .from(integrations)
      .where(inArray(integrations.workspaceId, [ws]));
    expect(row!.secretEncrypted).not.toContain(key);
    expect(row!.secretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("find their workspace, and only for the right kind", async () => {
    const key = await getIntegrationSecret(ws, "postback");
    expect(await findIntegrationBySecret("postback", key)).toEqual({ workspaceId: ws, config: {} });
    expect(await findIntegrationBySecret("api", key)).toBeNull();
    expect(await findIntegrationBySecret("postback", "pk_wrong")).toBeNull();
  });

  it("stop working when rotated", async () => {
    const old = await getIntegrationSecret(ws, "postback");
    const fresh = await rotateIntegrationSecret(ws, "postback");
    expect(fresh).not.toBe(old);
    expect(await findIntegrationBySecret("postback", old)).toBeNull();
    expect((await findIntegrationBySecret("postback", fresh))?.workspaceId).toBe(ws);
    expect(await getIntegrationSecret(ws, "postback")).toBe(fresh);
  });

  it("keep settings alongside", async () => {
    await setIntegrationConfig(ws, "postback", { allowedIps: ["203.0.113.1"] });
    expect(await getIntegrationConfig(ws, "postback")).toEqual({ allowedIps: ["203.0.113.1"] });
    expect(await getIntegrationConfig(ws, "shopify")).toEqual({});
  });
});
