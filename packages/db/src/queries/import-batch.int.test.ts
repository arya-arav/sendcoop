import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { listMemberships, subscribers, workspaces } from "../schema";
import { importSubscriberBatch } from "./import-batch";
import { createList } from "./lists";
import { createSubscriber } from "./subscribers";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let list: string;

beforeAll(async () => {
  const [row] = await db
    .insert(workspaces)
    .values({ name: "Batch", slug: `int-batch-${run}` })
    .returning({ id: workspaces.id });
  ws = row!.id;
  const created = await createList(ws, { name: "Imported", description: null });
  if (!created.ok) throw new Error("setup");
  list = created.list.id;

  // Already here: one unsubscribed person with a name and a field.
  await createSubscriber(ws, {
    email: "old@example.com",
    firstName: "Old",
    lastName: "Name",
    status: "unsubscribed",
    fields: { plan: "Starter", company: "Keep Ltd" },
  });
  await createSubscriber(ws, { email: "same@example.com", firstName: "Same", lastName: null });
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await getSql().end();
});

const subscriberByEmail = async (email: string) => {
  const [row] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.workspaceId, ws), eq(subscribers.email, email)));
  return row!;
};

describe("importSubscriberBatch", () => {
  it("creates new people and leaves existing ones alone by default", async () => {
    const result = await importSubscriberBatch(
      ws,
      [
        { email: "new1@example.com", firstName: "New", lastName: "One", fields: { plan: "Pro" } },
        { email: "old@example.com", firstName: "Changed", lastName: null, fields: {} },
      ],
      { listIds: [list], updateExisting: false },
    );
    expect(result).toEqual({ created: 1, updated: 0, unchanged: 1, overLimit: [] });

    const created = await subscriberByEmail("new1@example.com");
    expect(created).toMatchObject({
      status: "subscribed",
      source: "import",
      fields: { plan: "Pro" },
    });
    expect(created.subscribedAt).toBeInstanceOf(Date);
    expect((await subscriberByEmail("old@example.com")).firstName).toBe("Old");
  });

  it("updates existing people with values from the file, never their status", async () => {
    const result = await importSubscriberBatch(
      ws,
      [
        // New first name and plan; blank last name keeps "Name"; company kept.
        { email: "old@example.com", firstName: "Olivia", lastName: null, fields: { plan: "Pro" } },
        // Nothing new for this one, so it counts as unchanged.
        { email: "same@example.com", firstName: "Same", lastName: null, fields: {} },
      ],
      { listIds: [], updateExisting: true },
    );
    expect(result).toEqual({ created: 0, updated: 1, unchanged: 1, overLimit: [] });

    expect(await subscriberByEmail("old@example.com")).toMatchObject({
      firstName: "Olivia",
      lastName: "Name",
      status: "unsubscribed",
      fields: { plan: "Pro", company: "Keep Ltd" },
    });
  });

  it("adds new and existing people to the lists, once", async () => {
    await importSubscriberBatch(
      ws,
      [
        { email: "new1@example.com", firstName: null, lastName: null, fields: {} },
        { email: "same@example.com", firstName: null, lastName: null, fields: {} },
      ],
      { listIds: [list], updateExisting: false },
    );
    const members = await db
      .select({ email: subscribers.email })
      .from(listMemberships)
      .innerJoin(subscribers, eq(subscribers.id, listMemberships.subscriberId))
      .where(eq(listMemberships.listId, list));
    expect(members.map((m) => m.email).sort()).toEqual([
      "new1@example.com",
      "old@example.com",
      "same@example.com",
    ]);
  });

  it("handles a few thousand rows in one batch", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      email: `bulk${i}@example.com`,
      firstName: `Bulk${i}`,
      lastName: null,
      fields: { n: i },
    }));
    const result = await importSubscriberBatch(ws, rows, {
      listIds: [list],
      updateExisting: false,
    });
    expect(result.created).toBe(5000);
    const sample = await db
      .select({ email: subscribers.email })
      .from(subscribers)
      .where(inArray(subscribers.email, ["bulk0@example.com", "bulk4999@example.com"]));
    expect(sample).toHaveLength(2);
  }, 30_000); // Bulk: CI runs it beside every other test file.
});
