import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { type SignupForm, workspaces } from "../schema";
import { confirmSubscriber, createForm, getPublicForm, subscribeViaForm } from "./forms";
import { createList, listLists } from "./lists";
import { createSubscriber, searchSubscribers } from "./subscribers";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let form: SignupForm;
let singleOptIn: SignupForm;

const base = {
  title: "Join",
  description: null,
  buttonText: "Subscribe",
  successMessage: "Thanks!",
  redirectUrl: null,
  fields: ["first_name"],
};

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Forms", slug: `int-forms-${run}` },
      { name: "Forms other", slug: `int-forms-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];
  const list = await createList(ws, { name: "Newsletter", description: null });
  if (!list.ok) throw new Error("setup");
  form = await createForm(ws, {
    ...base,
    name: "Newsletter",
    listIds: [list.list.id],
    doubleOptIn: true,
  });
  singleOptIn = await createForm(ws, { ...base, name: "Quick", listIds: [], doubleOptIn: false });

  await createSubscriber(ws, {
    email: "gone@example.com",
    firstName: "Gone",
    lastName: null,
    status: "unsubscribed",
  });
  await createSubscriber(ws, {
    email: "bounced@example.com",
    firstName: null,
    lastName: null,
    status: "bounced",
  });
  await createSubscriber(ws, { email: "here@example.com", firstName: "Here", lastName: null });
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await getSql().end();
});

const signup = (email: string, extra: Partial<{ firstName: string }> = {}) => ({
  email,
  firstName: extra.firstName ?? null,
  lastName: null,
  fields: {},
});
const statusOf = async (email: string) =>
  (await searchSubscribers(ws, { filters: { query: email } })).rows[0];

describe("subscribeViaForm", () => {
  it("finds a form by its public id only", async () => {
    expect((await getPublicForm(form.publicId))?.workspaceName).toBe("Forms");
    expect(await getPublicForm("nope")).toBeNull();
    expect(form.publicId).toMatch(/^[a-zA-Z2-9]{12}$/);
  });

  it("adds new people as pending with double opt-in, on the form's lists", async () => {
    const { outcome, subscriber } = await subscribeViaForm(
      form,
      signup(" New@Example.com ", { firstName: "Nia" }),
    );
    expect(outcome).toBe("confirm");
    expect(subscriber).toMatchObject({
      email: "new@example.com",
      status: "pending",
      source: "form",
      subscribedAt: null,
    });
    const [list] = await listLists(ws);
    expect(list?.subscriberCount).toBe(1);
  });

  it("subscribes straight away without double opt-in", async () => {
    const { outcome, subscriber } = await subscribeViaForm(
      singleOptIn,
      signup("quick@example.com"),
    );
    expect(outcome).toBe("subscribed");
    expect(subscriber.status).toBe("subscribed");
  });

  it("handles people who are already here", async () => {
    expect((await subscribeViaForm(form, signup("here@example.com"))).outcome).toBe("already");
    expect((await subscribeViaForm(form, signup("new@example.com"))).outcome).toBe("confirm");
    // Unsubscribed people must confirm again; their status doesn't change yet.
    expect((await subscribeViaForm(singleOptIn, signup("gone@example.com"))).outcome).toBe(
      "confirm",
    );
    expect((await statusOf("gone@"))?.status).toBe("unsubscribed");
    expect((await subscribeViaForm(form, signup("bounced@example.com"))).outcome).toBe("blocked");
  });

  it("only fills in missing details, never overwrites them", async () => {
    await subscribeViaForm(form, signup("here@example.com", { firstName: "Impostor" }));
    expect((await statusOf("here@"))?.firstName).toBe("Here");
  });

  it("confirms pending and unsubscribed people, never bounced ones", async () => {
    const pending = await statusOf("new@");
    expect(await confirmSubscriber(ws, pending!.id)).toBe("subscribed");
    expect((await statusOf("new@"))?.subscribedAt).toBeInstanceOf(Date);

    const gone = await statusOf("gone@");
    expect(await confirmSubscriber(ws, gone!.id)).toBe("subscribed");

    const bounced = await statusOf("bounced@");
    expect(await confirmSubscriber(ws, bounced!.id)).toBe("bounced");

    // Another workspace can't confirm this one's subscribers.
    expect(await confirmSubscriber(other, pending!.id)).toBeNull();
  });
});
