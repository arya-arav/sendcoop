import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { type CampaignAudience, EMPTY_AUDIENCE, workspaces } from "../schema";
import { countAudience } from "./audience";
import { createList } from "./lists";
import { createSegment } from "./segments";
import { createSubscriber } from "./subscribers";
import { addSuppressions } from "./suppressions";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let l1: string;
let l2: string;
let vip: string;
let missing: string;

beforeAll(async () => {
  const [row] = await db
    .insert(workspaces)
    .values({ name: "Audience", slug: `int-aud-${run}` })
    .returning({ id: workspaces.id });
  ws = row!.id;
  const a = await createList(ws, { name: "Buyers", description: null });
  const b = await createList(ws, { name: "Leads", description: null });
  if (!a.ok || !b.ok) throw new Error("setup");
  [l1, l2] = [a.list.id, b.list.id];
  const s = await createSegment(ws, {
    name: "VIPs",
    rules: {
      match: "all",
      conditions: [{ type: "field", field: "first_name", op: "equals", value: "Vip" }],
    },
  });
  if (!s.ok) throw new Error("setup");
  vip = s.segment.id;
  missing = "019a0000-0000-7000-8000-000000000000";

  // name, lists, first name, status
  const people: [string, string[], string | null, "subscribed" | "unsubscribed"][] = [
    ["ana", [l1], null, "subscribed"],
    ["bo", [l1, l2], null, "subscribed"],
    ["cy", [l2], null, "subscribed"],
    ["dee", [], "Vip", "subscribed"],
    ["eve", [l1], null, "unsubscribed"],
    ["fay", [l1], null, "subscribed"], // suppressed below
    ["gus", [l1], "Vip", "subscribed"],
  ];
  for (const [name, lists, firstName, status] of people) {
    const r = await createSubscriber(
      ws,
      { email: `${name}@example.com`, firstName, lastName: null, status },
      lists,
    );
    if (!r.ok) throw new Error("setup");
  }
  await addSuppressions(ws, ["fay@example.com"], "manual");
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await getSql().end();
});

const audience = (a: Partial<CampaignAudience>) => countAudience(ws, { ...EMPTY_AUDIENCE, ...a });

describe("campaign audiences", () => {
  it("count nobody until something is chosen", async () => {
    expect(await audience({})).toBe(0);
  });

  it("count everyone subscribed and not suppressed", async () => {
    // ana bo cy dee gus (eve unsubscribed, fay suppressed)
    expect(await audience({ everyone: true })).toBe(5);
  });

  it("count each person once across lists and segments", async () => {
    expect(await audience({ lists: [l1] })).toBe(3); // ana bo gus
    expect(await audience({ lists: [l1, l2] })).toBe(4); // + cy
    expect(await audience({ lists: [l1], segments: [vip] })).toBe(4); // + dee
  });

  it("leave out excluded lists and segments", async () => {
    expect(await audience({ lists: [l1], excludeLists: [l2] })).toBe(2); // ana gus
    expect(await audience({ everyone: true, excludeSegments: [vip] })).toBe(3); // ana bo cy
    expect(await audience({ lists: [l1, l2], excludeLists: [l2], excludeSegments: [vip] })).toBe(1);
  });

  it("ignore segments that don't exist or belong elsewhere", async () => {
    expect(await audience({ segments: [missing] })).toBe(0);
    expect(await audience({ lists: [l1], excludeSegments: [missing] })).toBe(3);
  });
});
