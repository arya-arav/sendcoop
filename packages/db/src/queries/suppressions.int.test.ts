import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { suppressions, workspaces } from "../schema";
import {
  addSuppressions,
  isSuppressed,
  listSuppressions,
  removeSuppression,
  SUPPRESSIONS_PAGE_SIZE,
  streamSuppressions,
} from "./suppressions";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;
const globalEmail = `global-${run}@example.com`;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Suppress", slug: `int-supp-${run}` },
      { name: "Suppress other", slug: `int-supp-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await db.delete(suppressions).where(inArray(suppressions.email, [globalEmail]));
  await getSql().end();
});

describe("suppression lists", () => {
  it("add addresses once, lowercased, and count only new ones", async () => {
    expect(
      await addSuppressions(ws, ["A@Example.com", "a@example.com ", "b@example.com"], "manual"),
    ).toBe(2);
    expect(await addSuppressions(ws, ["B@example.com", "c@example.com"], "manual")).toBe(1);
    expect(await isSuppressed(ws, "a@EXAMPLE.com")).toBe(true);
    // Another workspace's list doesn't apply here.
    expect(await isSuppressed(other, "a@example.com")).toBe(false);
  });

  it("apply global entries to every workspace, once each", async () => {
    expect(await addSuppressions(null, [globalEmail], "manual")).toBe(1);
    expect(await addSuppressions(null, [globalEmail.toUpperCase()], "manual")).toBe(0);
    expect(await isSuppressed(ws, globalEmail)).toBe(true);
    expect(await isSuppressed(other, globalEmail)).toBe(true);
    // ...but they aren't listed (or removable) in a workspace.
    expect((await listSuppressions(ws, { query: "global" })).total).toBe(0);
  });

  it("list newest first in pages, with search, and remove entries", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `bulk${i}@list.example`);
    await addSuppressions(ws, many, "manual");
    const first = await listSuppressions(ws);
    expect(first.total).toBe(63);
    expect(first.rows).toHaveLength(SUPPRESSIONS_PAGE_SIZE);
    const second = await listSuppressions(ws, { before: first.nextCursor! });
    expect(second.rows).toHaveLength(13);
    expect(second.nextCursor).toBeNull();
    expect(second.rows.at(-1)?.email).toBe("a@example.com");

    const found = await listSuppressions(ws, { query: "B@EX" });
    expect(found.rows.map((r) => r.email)).toEqual(["b@example.com"]);
    // Search text is literal, not a LIKE pattern.
    expect((await listSuppressions(ws, { query: "%" })).total).toBe(0);

    expect(await removeSuppression(other, found.rows[0]!.id)).toBeNull();
    expect(await removeSuppression(ws, found.rows[0]!.id)).toBe("b@example.com");
    expect(await isSuppressed(ws, "b@example.com")).toBe(false);
  });

  it("stream a whole list for export", async () => {
    let n = 0;
    for await (const rows of streamSuppressions(ws)) n += rows.length;
    expect(n).toBe(62);
  });
});
