import {
  type Campaign,
  getDkimSigningKey,
  getSendingServerConfig,
  listSendingDomains,
} from "@sendcoop/db";
import {
  buildRawMessage,
  createDriver,
  personalize,
  type ServerConfig,
  serverConfigSchema,
  withUnsubscribeLink,
} from "@sendcoop/mailer";
import { appUrl } from "./app-url";

// A test of a draft campaign: the real content, personalized with fallbacks
// (there's no subscriber), through the campaign's own server and domain,
// with "[Test]" in front of the subject.

export async function sendCampaignTest(
  workspaceId: string,
  campaign: Campaign,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!campaign.html.trim() && !campaign.text.trim()) {
    return { ok: false, error: "Add the email's content first." };
  }
  const domain = (await listSendingDomains(workspaceId)).find(
    (d) => d.id === campaign.sendingDomainId,
  );
  if (!domain) return { ok: false, error: "Choose a sending domain in From and save." };
  const stored = campaign.sendingServerId
    ? await getSendingServerConfig(workspaceId, campaign.sendingServerId)
    : null;
  const config = stored ? serverConfigSchema.safeParse(stored.config) : null;
  if (!config?.success) return { ok: false, error: "Choose a sending server and save." };

  const from = `${campaign.fromLocal}@${domain.domain}`;
  const content = personalize(campaign, { email: to }, `test:${campaign.id}`);
  // Unsubscribe links only work in real sends; the test shows where it goes.
  const body = withUnsubscribeLink(content, `${appUrl()}/u/test`);
  const key = await getDkimSigningKey(workspaceId, domain.domain);
  const raw = await buildRawMessage(
    {
      from: { email: from, name: campaign.fromName },
      to,
      replyTo: campaign.replyTo ?? undefined,
      subject: `[Test] ${content.subject || "(no subject)"}`,
      ...body,
    },
    key
      ? { domainName: domain.domain, keySelector: key.selector, privateKey: key.privateKeyPem }
      : undefined,
  );

  const driver = createDriver(config.data as ServerConfig);
  try {
    await driver.send(raw, { from, to: [to] });
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `The server refused the email: ${reason.slice(0, 300)}` };
  } finally {
    driver.close();
  }
}
