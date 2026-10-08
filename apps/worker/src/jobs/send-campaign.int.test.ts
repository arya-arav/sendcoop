import {
  addSendingDomain,
  addSuppressions,
  claimCampaign,
  type Campaign,
  createCampaign,
  createList,
  createSendingServer,
  getCampaign,
  getSql,
  prepareCampaignMessages,
  queueCampaign,
  queuedMessageBatches,
  readUnsubscribeToken,
  recordFeedback,
  resumeCampaign,
  type SendingLimits,
} from "@sendcoop/db";
import {
  type CampaignJob,
  closeQueues,
  enqueueCampaign,
  enqueueSendBatches,
  QUEUES,
  queueConnection,
  type SendBatchJob,
} from "@sendcoop/queue";
import { getRedis } from "@sendcoop/redis";
import { Queue, Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareCampaign, processSendBatch, sendBatch } from "./send-campaign";

// The whole sending path with real Redis queues and Mailpit.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let workers: Worker[] = [];

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Load', ${`int-load-${run}`}) returning id`;
  ws = row!.id;
  workers = [
    new Worker<CampaignJob>(QUEUES.campaigns, (job) => prepareCampaign(job.data), {
      connection: queueConnection(),
    }),
    // Five batches at once, like production, to load the rate limiter.
    new Worker<SendBatchJob>(QUEUES.sends, processSendBatch, {
      connection: queueConnection(),
      concurrency: 5,
    }),
  ];
});

afterAll(async () => {
  await Promise.all(workers.map((w) => w.close()));
  await closeQueues();
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

let counter = 0;

/** A server, domain and list with `recipients` subscribers, and a queued campaign. */
async function setup(recipients: number, limits?: SendingLimits) {
  const n = ++counter;
  const domain = await addSendingDomain(ws, `mail.load-${run}-${n}.test`);
  if (!domain.ok) throw new Error("setup");
  const server = await createSendingServer(ws, {
    name: `Mailpit ${n}`,
    type: "smtp",
    summary: "mailpit",
    config: {
      type: "smtp",
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1026),
      secure: false,
    },
    limits,
  });
  const list = await createList(ws, { name: `List ${n}`, description: null });
  if (!list.ok) throw new Error("setup");

  // The wanted recipients plus 200 unsubscribed people who must get nothing.
  const prefix = `r${n}-${run}-`;
  await sql`
    insert into subscribers (workspace_id, email, status, subscribed_at)
    select ${ws}, ${prefix} || g || '@example.com',
           (case when g > ${recipients} then 'unsubscribed' else 'subscribed' end)::subscriber_status,
           now()
    from generate_series(1, ${recipients + 200}) g`;
  await sql`
    insert into list_memberships (list_id, subscriber_id)
    select ${list.list.id}, id from subscribers where workspace_id = ${ws} and email like ${`${prefix}%`}`;

  const subject = `Load test ${run} ${n}`;
  const campaign = await createCampaign(ws, {
    name: subject,
    subject,
    fromName: "Load",
    fromLocal: "news",
    replyTo: null,
    html: "<p>Hello</p>",
    text: "Hello",
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
    listId: list.list.id,
    segmentId: null,
  });
  expect(await queueCampaign(ws, campaign.id)).not.toBeNull();
  return { campaign, subject, serverId: server.id };
}

async function runUntil(campaignId: string, done: (c: Campaign | null) => boolean) {
  await enqueueCampaign({ campaignId, workspaceId: ws });
  let current = await getCampaign(ws, campaignId);
  while (!done(current)) {
    await new Promise((r) => setTimeout(r, 250));
    current = await getCampaign(ws, campaignId);
  }
  return current!;
}

async function mailpitCount(subject: string) {
  const query = encodeURIComponent(`subject:"${subject}"`);
  const result = (await fetch(`${MAILPIT}/api/v1/search?query=${query}&limit=1`).then((r) =>
    r.json(),
  )) as { messages_count: number };
  return result.messages_count;
}

describe("sending a campaign", () => {
  it(
    "delivers 10,000 emails through the queues to Mailpit",
    async () => {
      const { campaign, subject } = await setup(10_000);
      const started = performance.now();
      const result = await runUntil(
        campaign.id,
        (c) => c?.status !== "queued" && c?.status !== "sending",
      );
      const seconds = (performance.now() - started) / 1000;
      console.log(
        `[load] 10000 emails in ${seconds.toFixed(1)}s (${Math.round(10_000 / seconds)}/s)`,
      );

      expect(result).toMatchObject({
        status: "sent",
        recipientCount: 10_000,
        sentCount: 10_000,
        failedCount: 0,
      });
      await expect.poll(() => mailpitCount(subject), { timeout: 30_000 }).toBe(10_000);

      // Running a batch again sends nothing: every message is already sent.
      expect(await queuedMessageBatches(campaign.id)).toEqual([]);
      const [first] = await sql<{ id: string }[]>`
        select id from messages where campaign_id = ${campaign.id} order by id limit 1`;
      const again = await sendBatch({
        campaignId: campaign.id,
        workspaceId: ws,
        messageIds: [first!.id],
      });
      expect(again).toEqual({ sent: 0, failed: 0 });
      expect(await mailpitCount(subject)).toBe(10_000);
    },
    10 * 60_000,
  );

  it("gives every email its own one-click unsubscribe link", async () => {
    const { campaign, subject } = await setup(3);
    await runUntil(campaign.id, (c) => c?.status === "sent");
    const query = encodeURIComponent(`subject:"${subject}"`);
    const found = (await fetch(`${MAILPIT}/api/v1/search?query=${query}`).then((r) =>
      r.json(),
    )) as { messages: { ID: string }[] };
    expect(found.messages).toHaveLength(3);

    const tokens = new Set<string>();
    for (const { ID } of found.messages) {
      const headers = (await fetch(`${MAILPIT}/api/v1/message/${ID}/headers`).then((r) =>
        r.json(),
      )) as Record<string, string[]>;
      expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
      const token = headers["List-Unsubscribe"]?.[0]?.match(
        /^<http[^>]+\/api\/unsubscribe\/([^>]+)>$/,
      )?.[1];
      // The token names this very message.
      expect(readUnsubscribeToken(token!)).toBe(headers["X-Sendcoop-Message"]?.[0]);
      const body = (await fetch(`${MAILPIT}/api/v1/message/${ID}`).then((r) => r.json())) as {
        Text: string;
        HTML: string;
      };
      expect(body.Text).toContain(`/u/${token}`);
      expect(body.HTML).toContain(`/u/${token}" style="color:#6b7280">Unsubscribe</a>`);
      tokens.add(token!);
    }
    expect(tokens.size).toBe(3);
  });

  it("never sends more than the per-second limit, with five batches in parallel", async () => {
    const { campaign } = await setup(150, { maxPerSecond: 25, maxPerHour: null, maxPerDay: null });
    const started = performance.now();
    const result = await runUntil(campaign.id, (c) => c?.status === "sent");
    const seconds = (performance.now() - started) / 1000;

    expect(result.sentCount).toBe(150);
    // 150 at 25 per calendar second spans 6 seconds; starting late in the
    // first one, that is just over 4 seconds of wall time at minimum.
    expect(seconds).toBeGreaterThanOrEqual(4);
    const perSecond = await sql<{ second: string; n: number }[]>`
        select date_trunc('second', sent_at)::text as second, count(*)::int as n
        from messages where campaign_id = ${campaign.id} group by 1 order by 1`;
    console.log(`[limit] busiest second: ${Math.max(...perSecond.map((r) => r.n))} of 25`);
    for (const row of perSecond) expect(row.n).toBeLessThanOrEqual(25);
  }, 60_000);

  it("stops at the hourly limit and postpones the rest until the next hour", async () => {
    const { campaign } = await setup(100, { maxPerSecond: null, maxPerHour: 40, maxPerDay: null });
    await runUntil(campaign.id, (c) => (c?.sentCount ?? 0) >= 40);
    // Give any other batches time to hit the limit too.
    await new Promise((r) => setTimeout(r, 2000));

    const current = await getCampaign(ws, campaign.id);
    expect(current).toMatchObject({ status: "sending", sentCount: 40 });

    const sends = new Queue(QUEUES.sends, { connection: queueConnection() });
    const delayed = (await sends.getDelayed()).filter((j) => j.data.campaignId === campaign.id);
    expect(delayed.length).toBeGreaterThan(0);
    // When each job will run: BullMQ scores delayed jobs as run-at time × 4096.
    const redis = getRedis();
    const nextHour = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    for (const job of delayed) {
      const score = Number(await redis.zscore(sends.toKey("delayed"), job.id!));
      expect(Math.floor(score / 0x1000)).toBeGreaterThanOrEqual(nextHour);
    }
    await sends.close();
  }, 60_000);
});

describe("suppression", () => {
  it("leaves suppressed addresses out, and skips any suppressed after the campaign started", async () => {
    const { campaign } = await setup(5);
    const emails = (
      await sql<{ email: string }[]>`
        select s.email from subscribers s join list_memberships lm on lm.subscriber_id = s.id
        where lm.list_id = ${campaign.listId} and s.status = 'subscribed' order by s.email`
    ).map((r) => r.email);
    const [early, global, workspace, unsubscribed, kept] = emails as [
      string,
      string,
      string,
      string,
      string,
    ];

    // Suppressed before sending: not a recipient at all.
    await addSuppressions(ws, [early.toUpperCase()], "manual");
    const claimed = await claimCampaign(ws, campaign.id);
    expect(await prepareCampaignMessages(claimed!)).toBe(4);

    // Changed while the campaign is under way: skipped at send time.
    await addSuppressions(null, [global], "manual");
    await addSuppressions(ws, [workspace], "complaint");
    await sql`update subscribers set status = 'unsubscribed' where workspace_id = ${ws} and email = ${unsubscribed}`;
    try {
      const [ids] = await queuedMessageBatches(campaign.id, 100);
      expect(
        await sendBatch({ campaignId: campaign.id, workspaceId: ws, messageIds: ids! }),
      ).toEqual({ sent: 1, failed: 0 });
    } finally {
      await sql`delete from suppressions where workspace_id is null and email = ${global}`;
    }

    const rows = await sql<{ email: string; status: string; error: string | null }[]>`
      select email, status, error from messages where campaign_id = ${campaign.id} order by email`;
    expect(rows).toEqual([
      { email: global, status: "skipped", error: "Suppressed" },
      { email: workspace, status: "skipped", error: "Suppressed" },
      { email: unsubscribed, status: "skipped", error: "No longer subscribed" },
      { email: kept, status: "sent", error: null },
    ]);
    expect(await getCampaign(ws, campaign.id)).toMatchObject({ status: "sent", sentCount: 1 });
  });
});

describe("personalization", () => {
  it("sends each recipient their own merge tags, fallbacks and spintax", async () => {
    const { campaign } = await setup(2);
    const [named, anonymous] = (
      await sql<{ id: string; email: string }[]>`
        select s.id, s.email from subscribers s join list_memberships lm on lm.subscriber_id = s.id
        where lm.list_id = ${campaign.listId} and s.status = 'subscribed' order by s.email`
    ).map((r) => r) as [{ id: string; email: string }, { id: string; email: string }];
    await sql`update subscribers set first_name = 'Ana', fields = ${JSON.stringify({ coupon: "SAVE<20>" })}::jsonb
              where id = ${named.id}`;
    await sql`update campaigns set
        subject = ${`{Hi|Hello} {{first_name | friend}} ${run}`},
        html = ${'<p>{Hi|Hello} {{first_name | friend}}, code: {{coupon | none}}</p><p><a href="{{unsubscribe_url}}">Leave</a></p>'},
        text = ${"{Hi|Hello} {{first_name | friend}}, code: {{coupon | none}}\nLeave: {{unsubscribe_url}}"}
      where id = ${campaign.id}`;
    await runUntil(campaign.id, (c) => c?.status === "sent");

    const read = async (to: string) => {
      const query = encodeURIComponent(`to:"${to}"`);
      const found = (await fetch(`${MAILPIT}/api/v1/search?query=${query}`).then((r) =>
        r.json(),
      )) as { messages: { ID: string; Subject: string }[] };
      const message = (await fetch(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`).then((r) =>
        r.json(),
      )) as { Subject: string; HTML: string; Text: string };
      return message;
    };

    const ana = await read(named.email);
    expect(ana.Subject).toMatch(new RegExp(`^(Hi|Hello) Ana ${run}$`));
    expect(ana.HTML).toMatch(/<p>(Hi|Hello) Ana, code: SAVE&#60;20&#62;<\/p>/);
    expect(ana.Text).toMatch(/^(Hi|Hello) Ana, code: SAVE<20>\r?\nLeave: http\S+\/u\/\S+/);
    // The design had its own unsubscribe link, so no footer was added.
    expect(ana.HTML).not.toContain("Don't want these emails?");
    expect(ana.HTML).toMatch(/<a href="http[^"]+\/u\/[^"]+">Leave<\/a>/);

    const other = await read(anonymous.email);
    expect(other.Subject).toMatch(new RegExp(`^(Hi|Hello) friend ${run}$`));
    expect(other.Text).toMatch(/^(Hi|Hello) friend, code: none\r?\n/);
  });
});

describe("sending health", () => {
  it("pauses a campaign that gets too many spam complaints, and can resume it", async () => {
    // Slow enough (40/s) that complaints arrive while it is still sending.
    const { campaign, serverId } = await setup(400, {
      maxPerSecond: 40,
      maxPerHour: null,
      maxPerDay: null,
    });
    // sentCount only moves when a batch finishes; count the messages themselves.
    await enqueueCampaign({ campaignId: campaign.id, workspaceId: ws });
    await expect
      .poll(
        async () =>
          (
            await sql<{ n: number }[]>`
              select count(*)::int as n from messages
              where campaign_id = ${campaign.id} and status = 'sent'`
          )[0]!.n,
        { timeout: 20_000, interval: 100 },
      )
      .toBeGreaterThanOrEqual(120);

    // One spam complaint in 120+ emails is far over the 0.3% limit.
    const [first] = await sql<{ id: string; email: string }[]>`
      select id, email from messages where campaign_id = ${campaign.id} and status = 'sent'
      order by id limit 1`;
    await recordFeedback(serverId, {
      kind: "complaint",
      recipients: [first!.email],
      messageId: first!.id,
    });
    const paused = await getCampaign(ws, campaign.id);
    expect(paused).toMatchObject({ status: "paused" });
    expect(paused?.error).toMatch(/^Paused automatically: .+% of recipients marked it as spam/);

    // Batches already running stop within a few messages; nothing else goes out.
    await new Promise((r) => setTimeout(r, 2000));
    const settled = (await getCampaign(ws, campaign.id))!.sentCount;
    await new Promise((r) => setTimeout(r, 1500));
    expect((await getCampaign(ws, campaign.id))!.sentCount).toBe(settled);
    expect(settled).toBeLessThan(400);

    // The owner fixes the list and resumes: the rest are sent, once.
    expect(await resumeCampaign(ws, campaign.id)).not.toBeNull();
    const batches = await queuedMessageBatches(campaign.id, 100);
    await enqueueSendBatches(
      batches.map((messageIds) => ({ campaignId: campaign.id, workspaceId: ws, messageIds })),
      { round: String(Date.now()) },
    );
    const done = await runUntilDone(campaign.id);
    expect(done).toMatchObject({ status: "sent", sentCount: 400 });
  }, 60_000);
});

async function runUntilDone(campaignId: string) {
  let current = await getCampaign(ws, campaignId);
  while (current?.status === "sending") {
    await new Promise((r) => setTimeout(r, 250));
    current = await getCampaign(ws, campaignId);
  }
  return current;
}

describe("plain-text campaigns", () => {
  it("are sent as text only, personalized, with the unsubscribe link in the text", async () => {
    const { campaign } = await setup(1);
    const [recipient] = await sql<{ email: string }[]>`
      select s.email from subscribers s join list_memberships lm on lm.subscriber_id = s.id
      where lm.list_id = ${campaign.listId} and s.status = 'subscribed'`;
    await sql`update campaigns set html = '', text = ${"Hi {{first_name | there}},\n\nQuick question about your order."}
              where id = ${campaign.id}`;
    await runUntil(campaign.id, (c) => c?.status === "sent");

    const found = (await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${recipient!.email}"`)}`,
    ).then((r) => r.json())) as { messages: { ID: string }[] };
    const id = found.messages[0]!.ID;
    const message = (await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json())) as {
      HTML: string;
      Text: string;
    };
    expect(message.HTML).toBe("");
    expect(message.Text).toMatch(
      /^Hi there,\r?\n\r?\nQuick question about your order\.\r?\n\r?\n--\r?\nUnsubscribe: http\S+\/u\/\S+/,
    );
    const headers = (await fetch(`${MAILPIT}/api/v1/message/${id}/headers`).then((r) =>
      r.json(),
    )) as Record<string, string[]>;
    expect(headers["Content-Type"]?.[0]).toMatch(/^text\/plain/);
    expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
  });
});
