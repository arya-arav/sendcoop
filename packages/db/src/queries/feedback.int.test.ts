import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { campaigns, messages, sendingServers, subscribers, workspaces } from "../schema";
import { recordFeedback } from "./feedback";
import { isSuppressed } from "./suppressions";
import { createSubscriber } from "./subscribers";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let server: string;
let otherServer: string;
const msg: Record<string, string> = {};
const sub: Record<string, string> = {};

beforeAll(async () => {
  const [row] = await db
    .insert(workspaces)
    .values({ name: "Feedback", slug: `int-feedback-${run}` })
    .returning({ id: workspaces.id });
  ws = row!.id;
  const servers = await db
    .insert(sendingServers)
    .values(
      ["SES", "Other"].map((name) => ({
        workspaceId: ws,
        name,
        type: "ses" as const,
        summary: name,
        configEncrypted: "v1:unused",
      })),
    )
    .returning({ id: sendingServers.id });
  [server, otherServer] = servers.map((s) => s.id) as [string, string];
  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: ws,
      name: "Promo",
      subject: "Promo",
      fromName: "Acme",
      fromLocal: "news",
      html: "x",
      text: "x",
      status: "sent",
      sendingServerId: server,
    })
    .returning({ id: campaigns.id });

  for (const name of ["hard", "soft", "angry", "unsub"]) {
    const r = await createSubscriber(ws, {
      email: `${name}@Example.com`,
      firstName: null,
      lastName: null,
      status: name === "unsub" ? "unsubscribed" : "subscribed",
    });
    if (!r.ok) throw new Error("setup");
    sub[name] = r.subscriber.id;
    const [m] = await db
      .insert(messages)
      .values({
        workspaceId: ws,
        campaignId: campaign!.id,
        subscriberId: r.subscriber.id,
        email: `${name}@Example.com`,
        status: "sent",
        providerMessageId: `ses-${name}-${run}`,
      })
      .returning({ id: messages.id });
    msg[name] = m!.id;
  }
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await getSql().end();
});

const statusOf = async (name: string) =>
  (await db.select().from(subscribers).where(eq(subscribers.id, sub[name]!)))[0]?.status;
const message = async (name: string) =>
  (await db.select().from(messages).where(eq(messages.id, msg[name]!)))[0]!;

describe("recordFeedback", () => {
  it("suppresses a hard-bounced address, found by the provider's message id", async () => {
    const n = await recordFeedback(server, {
      kind: "bounce",
      hard: true,
      recipients: ["HARD@example.com"],
      providerMessageId: `ses-hard-${run}`,
      detail: "smtp; 550 5.1.1 user unknown",
    });
    expect(n).toBe(1);
    expect(await statusOf("hard")).toBe("bounced");
    expect(await isSuppressed(ws, "hard@example.com")).toBe(true);
    expect(await message("hard")).toMatchObject({
      bounceType: "hard",
      bounceDetail: "smtp; 550 5.1.1 user unknown",
    });
  });

  it("records a soft bounce without suppressing, and never downgrades a hard one", async () => {
    await recordFeedback(server, {
      kind: "bounce",
      hard: false,
      recipients: ["soft@example.com"],
      messageId: msg.soft,
    });
    expect(await statusOf("soft")).toBe("subscribed");
    expect(await isSuppressed(ws, "soft@example.com")).toBe(false);
    expect((await message("soft")).bounceType).toBe("soft");

    await recordFeedback(server, {
      kind: "bounce",
      hard: false,
      recipients: ["hard@example.com"],
      providerMessageId: `ses-hard-${run}`,
    });
    expect((await message("hard")).bounceType).toBe("hard");
  });

  it("suppresses complaints, even from people who already unsubscribed", async () => {
    for (const name of ["angry", "unsub"]) {
      await recordFeedback(server, {
        kind: "complaint",
        recipients: [`${name}@example.com`],
        messageId: msg[name],
      });
      expect(await statusOf(name)).toBe("complained");
      expect((await message(name)).complainedAt).toBeInstanceOf(Date);
    }
    // A later bounce doesn't turn a complaint into a bounce.
    await recordFeedback(server, {
      kind: "bounce",
      hard: true,
      recipients: ["angry@example.com"],
      messageId: msg.angry,
    });
    expect(await statusOf("angry")).toBe("complained");
  });

  it("ignores feedback from another server, for another address or without an id", async () => {
    await db
      .update(subscribers)
      .set({ status: "subscribed" })
      .where(inArray(subscribers.id, [sub.soft!]));
    const hard = { kind: "bounce" as const, hard: true };
    expect(
      await recordFeedback(otherServer, {
        ...hard,
        recipients: ["soft@example.com"],
        messageId: msg.soft,
      }),
    ).toBe(0);
    expect(
      await recordFeedback(server, { ...hard, recipients: ["x@example.com"], messageId: msg.soft }),
    ).toBe(0);
    expect(await recordFeedback(server, { ...hard, recipients: ["soft@example.com"] })).toBe(0);
    expect(
      await recordFeedback(server, {
        ...hard,
        recipients: ["soft@example.com"],
        messageId: "not-a-uuid",
      }),
    ).toBe(0);
    expect(await statusOf("soft")).toBe("subscribed");
  });
});
