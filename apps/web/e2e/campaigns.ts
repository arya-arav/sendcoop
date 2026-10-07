import {
  addSendingDomain,
  createCampaign,
  createList,
  createSendingServer,
  createSubscriber,
  getSql,
  queueCampaign,
} from "@sendcoop/db";
import { closeQueues, enqueueCampaign } from "@sendcoop/queue";

// Sends a real campaign through the worker to Mailpit, set up directly in
// the database: the campaign builder UI arrives in D31.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

/** Sends a campaign from a new Mailpit server named "Mailpit" to `recipients`, optionally slowly. */
export async function sendCampaign(
  slug: string,
  recipients: string[],
  { maxPerSecond = null }: { maxPerSecond?: number | null } = {},
) {
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const workspaceId = ws!.id;
  const domain = await addSendingDomain(workspaceId, `mail.${slug}.test`);
  const list = await createList(workspaceId, { name: "Deals", description: null });
  if (!domain.ok || !list.ok) throw new Error("setup");
  const server = await createSendingServer(workspaceId, {
    name: "Mailpit",
    type: "smtp",
    summary: "mailpit",
    config: {
      type: "smtp",
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1026),
      secure: false,
    },
    limits: { maxPerSecond, maxPerHour: null, maxPerDay: null },
  });
  for (const email of recipients) {
    await createSubscriber(workspaceId, { email, firstName: null, lastName: null }, [list.list.id]);
  }
  const campaign = await createCampaign(workspaceId, {
    name: "Flash sale",
    subject: "Flash sale: 40% off today",
    fromName: "Deals",
    fromLocal: "news",
    replyTo: null,
    html: "<html><body><p>Big savings today.</p></body></html>",
    text: "Big savings today.",
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
    listId: list.list.id,
    segmentId: null,
  });
  await queueCampaign(workspaceId, campaign.id);
  await enqueueCampaign({ campaignId: campaign.id, workspaceId });
  return { campaignId: campaign.id };
}

/**
 * Closes the queue connections sendCampaign opened; call from afterAll. The
 * database client is shared by every spec file a Playwright worker runs, so
 * it stays open (the worker process ends it).
 */
export async function closeConnections() {
  await closeQueues();
}

/** The headers of the newest email to `to` in Mailpit. */
export async function mailpitHeaders(to: string) {
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
  return fetch(`${MAILPIT}/api/v1/message/${search.messages[0]!.ID}/headers`).then(
    (r) => r.json() as Promise<Record<string, string[]>>,
  );
}
