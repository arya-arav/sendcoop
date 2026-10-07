import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { campaigns, messages, subscribers, workspaces } from "../schema";
import { createSubscriber } from "./subscribers";
import { getUnsubscribeTarget, resubscribeByMessage, unsubscribeByMessage } from "./unsubscribe";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
const messageFor: Record<string, string> = {};
const subscriberFor: Record<string, string> = {};

beforeAll(async () => {
  const [row] = await db
    .insert(workspaces)
    .values({ name: "Acme Deals", slug: `int-unsub-${run}` })
    .returning({ id: workspaces.id });
  ws = row!.id;
  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: ws,
      name: "Promo",
      subject: "Promo",
      fromName: "Acme",
      fromLocal: "news",
      html: "<p>Hi</p>",
      text: "Hi",
      status: "sent",
    })
    .returning({ id: campaigns.id });

  const people = [
    ["ana", "subscribed"],
    ["bo", "bounced"],
  ] as const;
  for (const [name, status] of people) {
    const email = `${name}@example.com`;
    const r = await createSubscriber(ws, { email, firstName: null, lastName: null, status });
    if (!r.ok) throw new Error("setup");
    subscriberFor[name] = r.subscriber.id;
    const [m] = await db
      .insert(messages)
      .values({
        workspaceId: ws,
        campaignId: campaign!.id,
        subscriberId: r.subscriber.id,
        email,
        status: "sent",
      })
      .returning({ id: messages.id });
    messageFor[name] = m!.id;
  }
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await getSql().end();
});

const statusOf = async (name: string) =>
  (
    await db
      .select({ status: subscribers.status, unsubscribedAt: subscribers.unsubscribedAt })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberFor[name]!))
  )[0];

const messageUnsubscribedAt = async (name: string) =>
  (
    await db
      .select({ at: messages.unsubscribedAt })
      .from(messages)
      .where(eq(messages.id, messageFor[name]!))
  )[0]?.at;

describe("unsubscribing from a campaign email", () => {
  it("shows who and which workspace the link is for", async () => {
    expect(await getUnsubscribeTarget(messageFor.ana!)).toEqual({
      email: "ana@example.com",
      workspaceName: "Acme Deals",
      status: "subscribed",
    });
    expect(await getUnsubscribeTarget("019a1b2c-3d4e-7f80-9123-456789abcdef")).toBeNull();
  });

  it("unsubscribes the person and records the email they used, once", async () => {
    expect(await unsubscribeByMessage(messageFor.ana!)).toBe(true);
    const after = await statusOf("ana");
    expect(after?.status).toBe("unsubscribed");
    expect(after?.unsubscribedAt).toBeInstanceOf(Date);
    const first = await messageUnsubscribedAt("ana");
    expect(first).toBeInstanceOf(Date);

    // Mail providers may POST more than once; the first time is kept.
    expect(await unsubscribeByMessage(messageFor.ana!)).toBe(true);
    expect(await messageUnsubscribedAt("ana")).toEqual(first);
  });

  it("undoes an unsubscribe from the same link", async () => {
    expect(await resubscribeByMessage(messageFor.ana!)).toBe(true);
    expect((await statusOf("ana"))?.status).toBe("subscribed");
    expect(await messageUnsubscribedAt("ana")).toBeNull();
  });

  it("leaves bounced addresses suppressed", async () => {
    expect(await unsubscribeByMessage(messageFor.bo!)).toBe(true);
    expect((await statusOf("bo"))?.status).toBe("bounced");
    expect(await resubscribeByMessage(messageFor.bo!)).toBe(false);
    expect((await statusOf("bo"))?.status).toBe("bounced");
  });

  it("returns false for a message that doesn't exist", async () => {
    expect(await unsubscribeByMessage("019a1b2c-3d4e-7f80-9123-456789abcdef")).toBe(false);
  });
});
