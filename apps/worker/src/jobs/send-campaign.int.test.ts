import {
  addSendingDomain,
  createCampaign,
  createList,
  createSendingServer,
  getCampaign,
  getSql,
  queueCampaign,
  queuedMessageBatches,
} from "@sendcoop/db";
import {
  type CampaignJob,
  closeQueues,
  enqueueCampaign,
  QUEUES,
  queueConnection,
  type SendBatchJob,
} from "@sendcoop/queue";
import { Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareCampaign, sendBatch } from "./send-campaign";

// The whole sending path with real Redis queues: 10,000 emails into Mailpit.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
const RECIPIENTS = 10_000;
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
    new Worker<SendBatchJob>(QUEUES.sends, (job) => sendBatch(job.data), {
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

async function mailpitCount(subject: string) {
  const query = encodeURIComponent(`subject:"${subject}"`);
  const result = (await fetch(`${MAILPIT}/api/v1/search?query=${query}&limit=1`).then((r) =>
    r.json(),
  )) as { messages_count: number };
  return result.messages_count;
}

describe("sending a campaign", () => {
  it(
    `delivers ${RECIPIENTS.toLocaleString("en")} emails through the queues to Mailpit`,
    async () => {
      const domain = await addSendingDomain(ws, `mail.load-${run}.test`);
      if (!domain.ok) throw new Error("setup");
      const server = await createSendingServer(ws, {
        name: "Mailpit",
        type: "smtp",
        summary: "mailpit",
        config: {
          type: "smtp",
          host: process.env.SMTP_HOST ?? "localhost",
          port: Number(process.env.SMTP_PORT ?? 1026),
          secure: false,
        },
      });
      const list = await createList(ws, { name: "Everyone", description: null });
      if (!list.ok) throw new Error("setup");

      // 10,000 subscribed + 200 unsubscribed on the list; only the first get mail.
      await sql`
        insert into subscribers (workspace_id, email, status, subscribed_at)
        select ${ws}, 'load' || g || '@example.com',
               (case when g > ${RECIPIENTS} then 'unsubscribed' else 'subscribed' end)::subscriber_status,
               now()
        from generate_series(1, ${RECIPIENTS + 200}) g`;
      await sql`
        insert into list_memberships (list_id, subscriber_id)
        select ${list.list.id}, id from subscribers where workspace_id = ${ws}`;

      const subject = `Load test ${run}`;
      const campaign = await createCampaign(ws, {
        name: "Load test",
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

      const started = performance.now();
      await enqueueCampaign({ campaignId: campaign.id, workspaceId: ws });
      let current = await getCampaign(ws, campaign.id);
      while (current?.status === "queued" || current?.status === "sending") {
        await new Promise((r) => setTimeout(r, 500));
        current = await getCampaign(ws, campaign.id);
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(
        `[load] ${RECIPIENTS} emails in ${seconds.toFixed(1)}s (${Math.round(RECIPIENTS / seconds)}/s)`,
      );

      expect(current).toMatchObject({
        status: "sent",
        recipientCount: RECIPIENTS,
        sentCount: RECIPIENTS,
        failedCount: 0,
      });
      await expect.poll(() => mailpitCount(subject), { timeout: 30_000 }).toBe(RECIPIENTS);

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
      expect(await mailpitCount(subject)).toBe(RECIPIENTS);
    },
    10 * 60_000,
  );
});
