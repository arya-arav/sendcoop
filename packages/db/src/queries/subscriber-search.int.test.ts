import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { workspaces } from "../schema";
import { createList } from "./lists";
import { createSubscriber, searchSubscribers } from "./subscribers";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let vipList: string;
const emails: string[] = [];

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Search", slug: `int-search-${run}` },
      { name: "Search other", slug: `int-search-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];

  const vip = await createList(ws, { name: "VIP", description: null });
  if (!vip.ok) throw new Error("setup");
  vipList = vip.list.id;

  // Seven subscribers, oldest first: #3 has a name, #4 is unsubscribed,
  // #5 has LIKE wildcards in its address, #2 and #6 are on the VIP list.
  for (let i = 1; i <= 7; i++) {
    const email = i === 5 ? "fifty%_off@example.com" : `person${i}@example.com`;
    emails.push(email);
    await createSubscriber(
      ws,
      {
        email,
        firstName: i === 3 ? "Zoë" : null,
        lastName: i === 3 ? "Sharma" : null,
        status: i === 4 ? "unsubscribed" : "subscribed",
      },
      i === 2 || i === 6 ? [vipList] : [],
    );
  }
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await getSql().end();
});

const emailsOf = (page: { rows: { email: string }[] }) => page.rows.map((r) => r.email);

describe("searchSubscribers", () => {
  it("pages forward and back with cursors, newest first", async () => {
    const newestFirst = [...emails].reverse();

    const page1 = await searchSubscribers(ws, { limit: 3 });
    expect(emailsOf(page1)).toEqual(newestFirst.slice(0, 3));
    expect(page1).toMatchObject({ total: 7, prevCursor: null });

    const page2 = await searchSubscribers(ws, { limit: 3, after: page1.nextCursor! });
    expect(emailsOf(page2)).toEqual(newestFirst.slice(3, 6));

    const page3 = await searchSubscribers(ws, { limit: 3, after: page2.nextCursor! });
    expect(emailsOf(page3)).toEqual(newestFirst.slice(6));
    expect(page3.nextCursor).toBeNull();

    // Going back from page 3 gives page 2, then page 1 with no previous page.
    const back2 = await searchSubscribers(ws, { limit: 3, before: page3.prevCursor! });
    expect(emailsOf(back2)).toEqual(newestFirst.slice(3, 6));
    const back1 = await searchSubscribers(ws, { limit: 3, before: back2.prevCursor! });
    expect(emailsOf(back1)).toEqual(newestFirst.slice(0, 3));
    expect(back1.prevCursor).toBeNull();
    expect(back1.nextCursor).toBe(page1.nextCursor);
  });

  it("searches email and names, ignoring case", async () => {
    expect(emailsOf(await searchSubscribers(ws, { filters: { query: "SHARMA" } }))).toEqual([
      "person3@example.com",
    ]);
    expect((await searchSubscribers(ws, { filters: { query: "zoë" } })).total).toBe(1);
    expect((await searchSubscribers(ws, { filters: { query: "person" } })).total).toBe(6);
  });

  it("treats % and _ in the search text literally", async () => {
    expect(emailsOf(await searchSubscribers(ws, { filters: { query: "%_off" } }))).toEqual([
      "fifty%_off@example.com",
    ]);
    expect((await searchSubscribers(ws, { filters: { query: "_" } })).total).toBe(1);
  });

  it("filters by status and list, alone and combined", async () => {
    expect((await searchSubscribers(ws, { filters: { status: "unsubscribed" } })).total).toBe(1);
    expect(emailsOf(await searchSubscribers(ws, { filters: { listId: vipList } }))).toEqual([
      "person6@example.com",
      "person2@example.com",
    ]);
    const combined = await searchSubscribers(ws, {
      filters: { listId: vipList, query: "person2", status: "subscribed" },
    });
    expect(combined.total).toBe(1);
  });

  it("finds nothing through a list from another workspace", async () => {
    const foreign = await createList(other, { name: "Foreign", description: null });
    if (!foreign.ok) throw new Error("setup");
    expect((await searchSubscribers(ws, { filters: { listId: foreign.list.id } })).total).toBe(0);
  });
});
