import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { workspaces } from "../schema";
import { createList, deleteList, listLists, updateList } from "./lists";

const db = getDb();
const run = Date.now().toString(36);
let wsA: string;
let wsB: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Test A", slug: `int-a-${run}` },
      { name: "Test B", slug: `int-b-${run}` },
    ])
    .returning({ id: workspaces.id });
  [wsA, wsB] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  // Lists go with their workspace (on delete cascade).
  await db.delete(workspaces).where(inArray(workspaces.id, [wsA, wsB]));
  await getSql().end();
});

describe("lists", () => {
  it("creates, renames and deletes a list", async () => {
    const created = await createList(wsA, { name: "Buyers", description: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await updateList(wsA, created.list.id, {
      name: "Buyers 2026",
      description: "From the Q1 launch",
    });
    expect(renamed).toMatchObject({ ok: true, list: { name: "Buyers 2026" } });

    expect(await deleteList(wsA, created.list.id)).toBe(true);
    expect(await listLists(wsA)).toHaveLength(0);
  });

  it("rejects duplicate names in the same workspace, ignoring case", async () => {
    await createList(wsA, { name: "Leads", description: null });
    expect(await createList(wsA, { name: "LEADS", description: null })).toEqual({
      ok: false,
      error: "duplicate",
    });

    const other = await createList(wsA, { name: "Other", description: null });
    if (!other.ok) throw new Error("setup failed");
    expect(await updateList(wsA, other.list.id, { name: "leads", description: null })).toEqual({
      ok: false,
      error: "duplicate",
    });
  });

  it("allows the same name in different workspaces", async () => {
    expect((await createList(wsB, { name: "Leads", description: null })).ok).toBe(true);
  });

  it("never reads, changes or deletes another workspace's list", async () => {
    const own = await createList(wsA, { name: "Private to A", description: null });
    if (!own.ok) throw new Error("setup failed");

    expect((await listLists(wsB)).map((l) => l.name)).not.toContain("Private to A");
    expect(await updateList(wsB, own.list.id, { name: "Hijacked", description: null })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await deleteList(wsB, own.list.id)).toBe(false);

    const [still] = await db.select().from(workspaces).where(eq(workspaces.id, wsA));
    expect(still).toBeDefined();
    expect((await listLists(wsA)).find((l) => l.id === own.list.id)?.name).toBe("Private to A");
  });
});
