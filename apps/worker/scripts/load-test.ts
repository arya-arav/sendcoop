import { parseArgs } from "node:util";
import {
  addSendingDomain,
  clickUrl,
  createCampaign,
  createList,
  createSendingServer,
  EMPTY_AUDIENCE,
  getIntegrationSecret,
  getSql,
  queueCampaign,
} from "@sendcoop/db";
import { closeQueues, enqueueCampaign, queueCounts, QUEUES } from "@sendcoop/queue";
import { startSmtpSink } from "./smtp-sink";

// Load test (D80): a campaign to a million people, with clicks and
// postbacks arriving while it sends. Needs the worker and the edge running
// (pnpm dev, or the production builds), Postgres and Redis. Sends go to an
// SMTP sink that keeps nothing. Usage:
//
//   pnpm --filter @sendcoop/worker load-test -- --sends 1000000 --clicks 100000 --postbacks 10000
//
// --click-rate and --postback-rate are per second (default: the roadmap's
// 100k clicks and 10k postbacks an hour, i.e. 28 and 3). The test workspace
// is deleted at the end unless --keep.

const { values: args } = parseArgs({
  options: {
    sends: { type: "string", default: "1000000" },
    clicks: { type: "string", default: "100000" },
    postbacks: { type: "string", default: "10000" },
    "click-rate": { type: "string", default: "28" },
    "postback-rate": { type: "string", default: "3" },
    "smtp-port": { type: "string", default: "3025" },
    keep: { type: "boolean", default: false },
  },
});
const SENDS = Number(args.sends);
const CLICKS = Number(args.clicks);
const POSTBACKS = Number(args.postbacks);
const TRACKING = (process.env.TRACKING_URL ?? "http://localhost:3001").replace(/\/$/, "");
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

const sql = getSql();
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;
const log = (message: string) => console.log(`[${elapsed().padStart(6)}] ${message}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const run = Date.now().toString(36);
  const [user] = await sql<{ id: string }[]>`
    insert into users (name, email, email_verified) values ('Load test', ${`load-${run}@example.com`}, true)
    returning id`;
  const [ws] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Load test', ${`load-test-${run}`}) returning id`;
  const workspaceId = ws!.id;
  await sql`insert into memberships (workspace_id, user_id, role) values (${workspaceId}, ${user!.id}, 'owner')`;
  // No plan limits and no warm-up: the test measures the system, not quotas.
  await sql`
    insert into subscriptions (user_id, plan_id, status, overrides)
    select ${user!.id}, id, 'active',
           ${JSON.stringify({ trusted: true, limits: { subscribers: null, sendsPerMonth: null } })}::text::jsonb
    from plans where key = 'pro'`;

  const list = await createList(workspaceId, { name: "Everyone", description: null });
  const domain = await addSendingDomain(workspaceId, `load-${run}.example`);
  if (!list.ok || !domain.ok) throw new Error("setup failed");
  const server = await createSendingServer(workspaceId, {
    name: "Sink",
    type: "smtp",
    summary: "load-test sink",
    config: { type: "smtp", host: "127.0.0.1", port: Number(args["smtp-port"]), secure: false },
    limits: { maxPerSecond: null, maxPerHour: null, maxPerDay: null },
  });

  log(`adding ${SENDS.toLocaleString("en")} subscribers`);
  const CHUNK = 100_000;
  for (let from = 1; from <= SENDS; from += CHUNK) {
    const to = Math.min(SENDS, from + CHUNK - 1);
    await sql`
      with made as (
        insert into subscribers (workspace_id, email, status, source, subscribed_at)
        select ${workspaceId}, 'reader-' || g || '@load.example', 'subscribed', 'import', now()
        from generate_series(${from}::int, ${to}::int) g
        returning id)
      insert into list_memberships (list_id, subscriber_id) select ${list.list.id}, id from made`;
  }
  await sql`analyze subscribers`;
  await sql`analyze list_memberships`;

  const campaign = await createCampaign(workspaceId, {
    name: "Load test",
    subject: "A million emails",
    fromName: "Load",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
    audience: { ...EMPTY_AUDIENCE, lists: [list.list.id] },
    html: '<html><body><p>Hello {{first_name | there}}</p><a href="https://shop.example/offer">Offer</a></body></html>',
    text: "Hello. Offer: https://shop.example/offer",
  });
  return { workspaceId, userId: user!.id, campaignId: campaign!.id };
}

/** Runs `task` `total` times at about `perSecond`, counting what went wrong. */
async function paced(
  name: string,
  total: number,
  perSecond: number,
  task: () => Promise<boolean>,
  until: () => boolean,
) {
  const result = { name, ok: 0, failed: 0, skipped: 0, latencies: [] as number[] };
  const interval = 1000 / perSecond;
  const inFlight = new Set<Promise<void>>();
  for (let i = 0; i < total && !until(); i++) {
    const t0 = performance.now();
    const p = task()
      .then((ok) => {
        if (ok) result.ok++;
        else result.skipped++;
      })
      .catch(() => {
        result.failed++;
      })
      .finally(() => {
        result.latencies.push(performance.now() - t0);
        inFlight.delete(p);
      });
    inFlight.add(p);
    await sleep(interval);
  }
  await Promise.all(inFlight);
  return result;
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
    : 0;
};

async function main() {
  const sink = await startSmtpSink(Number(args["smtp-port"]));
  const { workspaceId, userId, campaignId } = await setup();
  const postbackKey = await getIntegrationSecret(workspaceId, "postback");

  log("sending");
  const sendStart = Date.now();
  await queueCampaign(workspaceId, campaignId);
  await enqueueCampaign({ campaignId, workspaceId });

  // Clicks and postbacks while it sends, on messages already sent.
  const [link] = await (async () => {
    for (;;) {
      const rows = await sql<
        { id: string }[]
      >`select id from links where campaign_id = ${campaignId} limit 1`;
      if (rows.length) return rows;
      await sleep(500);
    }
  })();
  // Ids to click and convert, refreshed every few seconds: the generator must
  // not load the database more than the traffic it stands for.
  let sentPool: string[] = [];
  let clickPool: string[] = [];
  const refreshPools = async () => {
    sentPool = (
      await sql<{ id: string }[]>`
        select id from messages where campaign_id = ${campaignId} and status = 'sent'
        limit 5000`
    ).map((r) => r.id);
    clickPool = (
      await sql<{ click_id: string }[]>`
        select click_id from clicks where campaign_id = ${campaignId}
        limit 5000`
    ).map((r) => r.click_id);
  };
  await refreshPools();
  const refresher = setInterval(() => void refreshPools().catch(() => {}), 5000);
  const pick = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)];
  const sentSample = async () => pick(sentPool);
  const clickIds = async () => pick(clickPool);

  let postbackN = 0;
  const traffic = Promise.all([
    paced(
      "clicks",
      CLICKS,
      Number(args["click-rate"]),
      async () => {
        const messageId = await sentSample();
        if (!messageId) return false;
        const response = await fetch(clickUrl(messageId, link!.id, TRACKING), {
          redirect: "manual",
          headers: { "user-agent": CHROME },
        });
        await response.body?.cancel();
        if (response.status !== 302) throw new Error(`click ${response.status}`);
        return true;
      },
      () => false,
    ),
    paced(
      "postbacks",
      POSTBACKS,
      Number(args["postback-rate"]),
      async () => {
        const cid = await clickIds();
        if (!cid) return false;
        const n = ++postbackN;
        const response = await fetch(
          `${TRACKING}/pb?key=${postbackKey}&cid=${cid}&payout=${(n % 50) + 1}&txid=load-${n}`,
        );
        await response.body?.cancel();
        if (!response.ok) throw new Error(`postback ${response.status}`);
        return true;
      },
      () => false,
    ),
  ]);

  // Progress until the campaign is done and the send queue is empty.
  let lastSent = 0;
  for (;;) {
    await sleep(10_000);
    const [row] = await sql<{ sent: number; failed: number; queued: number; status: string }[]>`
      select (select count(*) from messages where campaign_id = ${campaignId} and status = 'sent')::int as sent,
             (select count(*) from messages where campaign_id = ${campaignId} and status = 'failed')::int as failed,
             (select count(*) from messages where campaign_id = ${campaignId} and status = 'queued')::int as queued,
             (select status from campaigns where id = ${campaignId}) as status`;
    const counts = await queueCounts(QUEUES.sends);
    log(
      `${row!.status}: sent ${row!.sent.toLocaleString("en")} (+${((row!.sent - lastSent) / 10).toFixed(0)}/s), failed ${row!.failed}, queued ${row!.queued.toLocaleString("en")}; ` +
        `queue waiting ${counts.waiting}, active ${counts.active}, delayed ${counts.delayed}, failed ${counts.failed}; sink ${sink.messages().toLocaleString("en")}`,
    );
    lastSent = row!.sent;
    // (Delayed jobs can be other campaigns' later time zones: this one has none.)
    if (row!.status === "sent" && row!.queued === 0 && counts.waiting + counts.active === 0) break;
    if (row!.status === "failed" || row!.status === "paused")
      throw new Error(`campaign ${row!.status}`);
  }
  const sendSeconds = (Date.now() - sendStart) / 1000;
  const [clicks, postbacks] = await traffic;
  clearInterval(refresher);

  const [final] = await sql<
    { sent: number; failed: number; clicks: number; conversions: number; revenue: number }[]
  >`
    select (select count(*) from messages where campaign_id = ${campaignId} and status = 'sent')::int as sent,
           (select count(*) from messages where campaign_id = ${campaignId} and status <> 'sent')::int as failed,
           (select count(*) from clicks where campaign_id = ${campaignId})::int as clicks,
           (select count(*) from conversions where workspace_id = ${workspaceId})::int as conversions,
           (select coalesce(sum(value), 0)::float8 from conversions where workspace_id = ${workspaceId}) as revenue`;
  const queues = await queueCounts(QUEUES.sends);
  const report = {
    sends: {
      requested: SENDS,
      sent: final!.sent,
      notSent: final!.failed,
      seconds: Math.round(sendSeconds),
      perSecond: Math.round(final!.sent / sendSeconds),
      sinkReceived: sink.messages(),
    },
    clicks: {
      ok: clicks.ok,
      errors: clicks.failed,
      recorded: final!.clicks,
      p50ms: Math.round(percentile(clicks.latencies, 50)),
      p99ms: Math.round(percentile(clicks.latencies, 99)),
    },
    postbacks: {
      ok: postbacks.ok,
      errors: postbacks.failed,
      conversions: final!.conversions,
      p50ms: Math.round(percentile(postbacks.latencies, 50)),
      p99ms: Math.round(percentile(postbacks.latencies, 99)),
    },
    sendQueueAfter: queues,
  };
  console.log(JSON.stringify(report, null, 2));
  const clean =
    final!.sent === SENDS &&
    final!.failed === 0 &&
    clicks.failed === 0 &&
    postbacks.failed === 0 &&
    queues.waiting + queues.active === 0;
  log(clean ? "PASS: no errors, and the queue drained" : "FAIL");

  if (!args.keep) {
    log("cleaning up");
    await sql`delete from workspaces where id = ${workspaceId}`;
    await sql`delete from users where id = ${userId}`;
  }
  await sink.close();
  await closeQueues();
  await sql.end();
  process.exit(clean ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
