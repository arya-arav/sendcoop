import { generateKeyPairSync, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { getCampaign, getSql } from "@sendcoop/db";
import { closeConnections, mailpitHeaders, sendCampaign } from "./campaigns";
import { emailLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

// SNS signs every message with an AWS certificate. Tests sign their own, and
// the app trusts SNS_TEST_CERT_URL (development and CI only), served here.
const CERT_URL = process.env.SNS_TEST_CERT_URL ?? "http://localhost:3998/sns-test-cert.pem";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
let certServer: Server;

// One certificate server on a fixed port: run this file's tests one after another.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const pem = publicKey.export({ type: "spki", format: "pem" });
  certServer = createServer((_req, res) => res.end(pem));
  await new Promise<void>((resolve) => certServer.listen(Number(new URL(CERT_URL).port), resolve));
});

test.afterAll(async () => {
  certServer.close();
  await closeConnections();
});

/** An SNS Notification carrying an SES event, signed like SNS does. */
function snsNotification(event: object) {
  const fields = {
    Message: JSON.stringify(event),
    MessageId: crypto.randomUUID(),
    Timestamp: new Date().toISOString(),
    TopicArn: "arn:aws:sns:us-east-1:123456789012:ses-feedback",
    Type: "Notification",
  };
  const text = Object.entries(fields)
    .map(([k, v]) => `${k}\n${v}\n`)
    .join("");
  return {
    ...fields,
    SignatureVersion: "2",
    Signature: sign("RSA-SHA256", Buffer.from(text), privateKey).toString("base64"),
    SigningCertURL: CERT_URL,
  };
}

/** The SES "mail" object for the email delivered to `to`. */
async function sesMail(to: string) {
  const headers = await mailpitHeaders(to);
  return {
    messageId: `0100019a-${crypto.randomUUID()}`,
    headers: [{ name: "X-Sendcoop-Message", value: headers["X-Sendcoop-Message"]![0]! }],
  };
}

test("SES bounces and complaints take addresses off the list", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Bounce Owner",
    email: uniqueEmail("bounce-owner"),
    workspace: `Bounces ${Date.now()}`,
  });
  const [gone, angry, fine] = ["gone", "angry", "fine"].map((l) => uniqueEmail(`bounce-${l}`));
  await sendCampaign(slug, [gone!, angry!, fine!]);
  for (const to of [gone!, angry!, fine!]) await emailLink(to, /\/u\/\S+/);

  // The server's settings show the URL to subscribe in Amazon SNS
  await page.goto(`/w/${slug}/settings/servers`);
  await page.getByRole("link", { name: "Mailpit" }).click();
  await expect(page.getByRole("heading", { name: "Bounces and complaints" })).toBeVisible();
  const webhook = await page.getByLabel("SNS webhook URL").inputValue();
  expect(webhook).toMatch(/^http:\/\/localhost:3000\/api\/webhooks\/ses\/[\w-]+\.[\w-]+$/);
  const post = (body: object) => page.request.post(webhook, { data: JSON.stringify(body) });

  // A hard bounce
  const bounce = await post(
    snsNotification({
      notificationType: "Bounce",
      mail: await sesMail(gone!),
      bounce: {
        bounceType: "Permanent",
        bounceSubType: "General",
        bouncedRecipients: [{ emailAddress: gone, diagnosticCode: "smtp; 550 5.1.1 unknown" }],
      },
    }),
  );
  expect(bounce.status()).toBe(200);

  // A spam complaint, in the configuration set event format
  const complaint = await post(
    snsNotification({
      eventType: "Complaint",
      mail: await sesMail(angry!),
      complaint: { complainedRecipients: [{ emailAddress: angry }] },
    }),
  );
  expect(complaint.status()).toBe(200);

  // A forged notification (changed after signing) is refused
  const forged = snsNotification({
    notificationType: "Bounce",
    mail: await sesMail(fine!),
    bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: fine }] },
  });
  forged.Message = forged.Message.replace("Permanent", "Permanent ");
  expect((await post(forged)).status()).toBe(403);

  // Confirming the SNS subscription only ever calls SNS itself
  const sneaky = {
    Message: "Confirm",
    MessageId: crypto.randomUUID(),
    SubscribeURL: "http://169.254.169.254/latest/meta-data/",
    Timestamp: new Date().toISOString(),
    Token: "t",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:ses-feedback",
    Type: "SubscriptionConfirmation",
  };
  const sneakyText = Object.entries(sneaky)
    .map(([k, v]) => `${k}\n${v}\n`)
    .join("");
  const confirm = await post({
    ...sneaky,
    SignatureVersion: "2",
    Signature: sign("RSA-SHA256", Buffer.from(sneakyText), privateKey).toString("base64"),
    SigningCertURL: CERT_URL,
  });
  expect(confirm.status()).toBe(400);

  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByRole("row").filter({ hasText: gone })).toContainText("Bounced");
  await expect(page.getByRole("row").filter({ hasText: angry })).toContainText("Complained");
  await expect(page.getByRole("row").filter({ hasText: fine })).toContainText("Subscribed");
});

test("a campaign with too many spam complaints pauses itself and can be resumed", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Health Owner",
    email: uniqueEmail("health-owner"),
    workspace: `Health ${Date.now()}`,
  });
  const recipients = Array.from({ length: 200 }, (_, i) => uniqueEmail(`health-${i}`));
  // 10 a second: complaints arrive while it is still sending, as in real life.
  const { campaignId } = await sendCampaign(slug, recipients, { maxPerSecond: 10 });
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const progress = () => getCampaign(ws!.id, campaignId);
  // sentCount moves when a batch finishes; count the messages themselves.
  const sent = async () =>
    (
      await getSql()<{ n: number }[]>`
        select count(*)::int as n from messages
        where campaign_id = ${campaignId} and status = 'sent'`
    )[0]!.n;
  await expect.poll(sent, { timeout: 20_000, intervals: [100] }).toBeGreaterThanOrEqual(100);

  // One recipient reports it as spam: over 0.3% of 100+ emails
  await page.goto(`/w/${slug}/settings/servers`);
  await page.getByRole("link", { name: "Mailpit" }).click();
  const webhook = await page.getByLabel("SNS webhook URL").inputValue();
  const [first] = await getSql()<{ email: string }[]>`
    select email from messages where campaign_id = ${campaignId} and status = 'sent' limit 1`;
  const complaint = await page.request.post(webhook, {
    data: JSON.stringify(
      snsNotification({
        notificationType: "Complaint",
        mail: await sesMail(first!.email),
        complaint: { complainedRecipients: [{ emailAddress: first!.email }] },
      }),
    ),
  });
  expect(complaint.status()).toBe(200);

  // Deliverability shows it paused, with the reason
  await page
    .locator("[data-sidebar=sidebar]")
    .getByRole("link", { name: "Deliverability" })
    .click();
  await expect(page.getByRole("heading", { name: "1 campaign is paused" })).toBeVisible();
  await expect(
    page.getByText(/Paused automatically: .+% of recipients marked it as spam/),
  ).toBeVisible();
  const stopped = (await progress())!;
  expect(stopped.status).toBe("paused");
  expect(await sent()).toBeLessThan(200);

  // Resuming sends the rest
  await page.getByRole("button", { name: "Resume Flash sale" }).click();
  await expect(page.getByRole("heading", { name: "1 campaign is paused" })).toBeHidden();
  await expect.poll(async () => (await progress())?.status, { timeout: 30_000 }).toBe("sent");
  expect((await progress())?.sentCount).toBe(200);
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: "Flash sale" });
  await expect(row).toContainText("Sent");
  await expect(row).toContainText("200");
});
