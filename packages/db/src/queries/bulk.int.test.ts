import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { workspaces } from "../schema";
import {
  bulkAddTag,
  bulkAddToList,
  bulkDelete,
  bulkMoveToList,
  bulkRemoveFromList,
  bulkRemoveTag,
  bulkUnsubscribe,
} from "./bulk";
import { createList, listLists } from "./lists";
import { countSubscribers, createSubscriber, searchSubscribers } from "./subscribers";
import { findOrCreateTag, listTags } from "./tags";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let ids: Record<string, string> = {};
let foreignId: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Bulk", slug: `int-bulk-${run}` },
      { name: "Bulk other", slug: `int-bulk-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];

  const people: [string, "subscribed" | "bounced" | "pending"][] = [
    ["ana@example.com", "subscribed"],
    ["bo@example.com", "subscribed"],
    ["cy@example.com", "pending"],
    ["dee@example.com", "bounced"],
    ["eve@example.org", "subscribed"],
  ];
  ids = {};
  for (const [email, status] of people) {
    const r = await createSubscriber(ws, { email, firstName: null, lastName: null, status });
    if (!r.ok) throw new Error("setup");
    ids[email.split("@")[0]!] = r.subscriber.id;
  }
  const foreign = await createSubscriber(other, {
    email: "ana@example.com",
    firstName: null,
    lastName: null,
  });
  if (!foreign.ok) throw new Error("setup");
  foreignId = foreign.subscriber.id;
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await getSql().end();
});

const emails = async (filters: Parameters<typeof searchSubscribers>[1] = {}) =>
  (await searchSubscribers(ws, filters)).rows.map((r) => r.email).sort();

async function list(name: string) {
  const r = await createList(ws, { name, description: null });
  if (!r.ok) throw new Error("setup");
  return r.list.id;
}

describe("bulk actions", () => {
  it("tags selected rows and everyone matching a filter", async () => {
    const vip = await findOrCreateTag(ws, "VIP");
    expect(await bulkAddTag(ws, { ids: [ids.ana!, ids.bo!] }, vip.id)).toBe(2);
    // Filter mode: everyone at example.com (ana and bo already have it).
    expect(await bulkAddTag(ws, { filters: { query: "@example.com" } }, vip.id)).toBe(2);
    expect(await emails({ filters: { tagId: vip.id } })).toEqual([
      "ana@example.com",
      "bo@example.com",
      "cy@example.com",
      "dee@example.com",
    ]);
    expect(await bulkRemoveTag(ws, { ids: [ids.cy!] }, vip.id)).toBe(1);
    const [tag] = await listTags(ws);
    expect(tag).toMatchObject({ name: "VIP", subscriberCount: 3 });
  });

  it("finds an existing tag whatever its letter case", async () => {
    const again = await findOrCreateTag(ws, "  vip ");
    const [first] = await listTags(ws);
    expect(again.id).toBe(first!.id);
  });

  it("adds to, removes from and moves between lists", async () => {
    const leads = await list("Leads");
    const buyers = await list("Buyers");
    expect(await bulkAddToList(ws, { ids: [ids.ana!, ids.bo!, ids.eve!] }, leads)).toBe(3);
    expect(await bulkRemoveFromList(ws, { ids: [ids.eve!] }, leads)).toBe(1);

    // Move everyone filtered by "Leads" to "Buyers".
    const moved = await bulkMoveToList(
      ws,
      { filters: { listId: leads } },
      { from: leads, to: buyers },
    );
    expect(moved).toBe(2);
    const counts = Object.fromEntries(
      (await listLists(ws)).map((l) => [l.name, l.subscriberCount]),
    );
    expect(counts).toEqual({ Leads: 0, Buyers: 2 });
  });

  it("unsubscribes subscribed and pending people but leaves bounced alone", async () => {
    const changed = await bulkUnsubscribe(ws, { ids: [ids.bo!, ids.cy!, ids.dee!] });
    expect(changed).toBe(2);
    const bySatus = Object.fromEntries(
      (await searchSubscribers(ws)).rows.map((r) => [r.email, r.status]),
    );
    expect(bySatus).toMatchObject({
      "bo@example.com": "unsubscribed",
      "cy@example.com": "unsubscribed",
      "dee@example.com": "bounced",
    });
  });

  it("never touches another workspace's subscribers, even by id", async () => {
    const vip = await findOrCreateTag(ws, "VIP");
    expect(await bulkAddTag(ws, { ids: [foreignId] }, vip.id)).toBe(0);
    expect(await bulkUnsubscribe(ws, { ids: [foreignId] })).toBe(0);
    expect(await bulkDelete(ws, { ids: [foreignId] })).toBe(0);
    expect(await countSubscribers(other)).toBe(1);
  });

  it("deletes the selection with its memberships", async () => {
    expect(await bulkDelete(ws, { filters: { status: "unsubscribed" } })).toBe(2);
    expect(await emails()).toEqual(["ana@example.com", "dee@example.com", "eve@example.org"]);
    const [tag] = await listTags(ws);
    expect(tag?.subscriberCount).toBe(2); // bo's tag went with him
  });
});
