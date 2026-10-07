import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { workspaces } from "../schema";
import {
  createCustomField,
  deleteCustomField,
  listCustomFields,
  updateCustomField,
} from "./custom-fields";
import { createSubscriber, listSubscribers } from "./subscribers";

const db = getDb();
const run = Date.now().toString(36);
let wsA: string;
let wsB: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Fields A", slug: `int-fields-a-${run}` },
      { name: "Fields B", slug: `int-fields-b-${run}` },
    ])
    .returning({ id: workspaces.id });
  [wsA, wsB] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [wsA, wsB]));
  await getSql().end();
});

async function field(workspaceId: string, key: string, type: "text" | "dropdown" = "text") {
  const result = await createCustomField(workspaceId, {
    key,
    label: key,
    type,
    options: type === "dropdown" ? ["Starter", "Pro"] : ["ignored"],
  });
  if (!result.ok) throw new Error(`setup: ${result.error}`);
  return result.field;
}

describe("custom fields", () => {
  it("creates fields in order, keeping options only for dropdowns", async () => {
    const company = await field(wsA, "company");
    const plan = await field(wsA, "plan", "dropdown");

    expect(company.options).toEqual([]);
    expect(plan.options).toEqual(["Starter", "Pro"]);
    expect((await listCustomFields(wsA)).map((f) => f.key)).toEqual(["company", "plan"]);
  });

  it("rejects a duplicate key in the same workspace but not in another", async () => {
    expect(
      await createCustomField(wsA, { key: "company", label: "Co", type: "text", options: [] }),
    ).toEqual({ ok: false, error: "duplicate" });
    expect(
      (await createCustomField(wsB, { key: "company", label: "Co", type: "text", options: [] })).ok,
    ).toBe(true);
  });

  it("updates label and options but never key or type", async () => {
    const [plan] = (await listCustomFields(wsA)).filter((f) => f.key === "plan");
    const updated = await updateCustomField(wsA, plan!.id, {
      label: "Plan tier",
      options: ["Starter", "Pro", "Agency"],
    });
    expect(updated).toMatchObject({
      ok: true,
      field: {
        key: "plan",
        type: "dropdown",
        label: "Plan tier",
        options: ["Starter", "Pro", "Agency"],
      },
    });

    const [company] = (await listCustomFields(wsA)).filter((f) => f.key === "company");
    const text = await updateCustomField(wsA, company!.id, { label: "Company", options: ["x"] });
    expect(text).toMatchObject({ ok: true, field: { options: [] } });
  });

  it("can't update or delete another workspace's field", async () => {
    const [company] = (await listCustomFields(wsA)).filter((f) => f.key === "company");
    expect(await updateCustomField(wsB, company!.id, { label: "Hijacked", options: [] })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await deleteCustomField(wsB, company!.id)).toBe(false);
  });

  it("deleting a field removes its values from that workspace's subscribers only", async () => {
    const temp = await field(wsA, "temp_note");
    await createSubscriber(wsA, {
      email: "a@example.com",
      firstName: null,
      lastName: null,
      fields: { temp_note: "hello", company: "Acme" },
    });
    await field(wsB, "temp_note");
    await createSubscriber(wsB, {
      email: "b@example.com",
      firstName: null,
      lastName: null,
      fields: { temp_note: "keep me" },
    });

    expect(await deleteCustomField(wsA, temp.id)).toBe(true);

    const [a] = await listSubscribers(wsA);
    expect(a?.fields).toEqual({ company: "Acme" });
    const [b] = await listSubscribers(wsB);
    expect(b?.fields).toEqual({ temp_note: "keep me" });
  });
});
