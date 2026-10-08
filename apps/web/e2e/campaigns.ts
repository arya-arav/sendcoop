import {
  addSendingDomain,
  createCampaign,
  createCampaignFromTemplate,
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

type Recipient = string | { email: string; firstName: string };

/**
 * Sends a campaign from a new Mailpit server named "Mailpit" to `recipients`:
 * optionally slowly, or with a template's content.
 */
export async function sendCampaign(
  slug: string,
  recipients: Recipient[],
  { maxPerSecond = null, templateId }: { maxPerSecond?: number | null; templateId?: string } = {},
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
  for (const recipient of recipients) {
    const { email, firstName = null } =
      typeof recipient === "string" ? { email: recipient } : recipient;
    await createSubscriber(workspaceId, { email, firstName, lastName: null }, [list.list.id]);
  }
  const settings = {
    fromName: "Deals",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
    listId: list.list.id,
    segmentId: null,
  };
  const campaign = templateId
    ? await createCampaignFromTemplate(workspaceId, templateId, settings)
    : await createCampaign(workspaceId, {
        ...settings,
        name: "Flash sale",
        subject: "Flash sale: 40% off today",
        html: "<html><body><p>Big savings today.</p></body></html>",
        text: "Big savings today.",
      });
  if (!campaign) throw new Error("template not found");
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
