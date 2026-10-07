import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { workspaces } from "../schema";
import { createList, listLists } from "./lists";
import { countSubscribers, createSubscriber, listSubscribers } from "./subscribers";

const db = getDb();
const run = Date.now().toString(36);
let wsA: string;
let wsB: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Subs A", slug: `int-subs-a-${run}` },
      { name: "Subs B", slug: `int-subs-b-${run}` },
    ])
    .returning({ id: workspaces.id });
  [wsA, wsB] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [wsA, wsB]));
  await getSql().end();
});

async function newList(workspaceId: string, name: string) {
  const result = await createList(workspaceId, { name, description: null });
  if (!result.ok) throw new Error(`setup: ${result.error}`);
  return result.list.id;
}

describe("subscribers", () => {
  it("adds a subscriber to lists, normalising the email", async () => {
    const buyers = await newList(wsA, "Buyers");
    const leads = await newList(wsA, "Leads");

    const result = await createSubscriber(
      wsA,
      { email: "  Priya.Sharma@Example.COM ", firstName: "Priya", lastName: null },
      [leads, buyers, buyers],
    );
    expect(result).toMatchObject({
      ok: true,
      subscriber: { email: "priya.sharma@example.com", status: "subscribed", source: "manual" },
    });
    if (!result.ok) return;
    expect(result.subscriber.subscribedAt).toBeInstanceOf(Date);

    const [row] = await listSubscribers(wsA);
    expect(row?.lists.map((l) => l.name)).toEqual(["Buyers", "Leads"]);

    const counts = Object.fromEntries(
      (await listLists(wsA)).map((l) => [l.name, l.subscriberCount]),
    );
    expect(counts).toEqual({ Buyers: 1, Leads: 1 });
  });

  it("rejects the same email twice in a workspace, in any letter case", async () => {
    await createSubscriber(wsA, { email: "dup@example.com", firstName: null, lastName: null });
    expect(
      await createSubscriber(wsA, { email: "DUP@example.com", firstName: null, lastName: null }),
    ).toEqual({ ok: false, error: "duplicate" });
  });

  it("allows the same email in another workspace", async () => {
    const result = await createSubscriber(wsB, {
      email: "dup@example.com",
      firstName: null,
      lastName: null,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses lists from another workspace and creates nothing", async () => {
    const foreignList = await newList(wsB, "B only");
    const before = await countSubscribers(wsA);

    expect(
      await createSubscriber(
        wsA,
        { email: "sneaky@example.com", firstName: null, lastName: null },
        [foreignList],
      ),
    ).toEqual({ ok: false, error: "invalid_list" });
    expect(await countSubscribers(wsA)).toBe(before);
  });

  it("lists and counts only the workspace's own subscribers, newest first", async () => {
    await createSubscriber(wsA, { email: "newest@example.com", firstName: null, lastName: null });
    const emails = (await listSubscribers(wsA)).map((s) => s.email);

    expect(emails[0]).toBe("newest@example.com");
    expect(emails).not.toContain("b-only@example.com");
    expect(await countSubscribers(wsA)).toBe(emails.length);
    expect(await countSubscribers(wsB)).toBe(1);
  });

  it("records no subscribe time for pending subscribers", async () => {
    const result = await createSubscriber(wsA, {
      email: "pending@example.com",
      firstName: null,
      lastName: null,
      status: "pending",
    });
    expect(result).toMatchObject({
      ok: true,
      subscriber: { status: "pending", subscribedAt: null },
    });
  });
});
