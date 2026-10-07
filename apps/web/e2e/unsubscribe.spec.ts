import { expect, test } from "@playwright/test";
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
import { emailLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(async () => {
  await closeQueues();
  await getSql().end();
});

/** Sends a campaign to `recipients` through the real worker. The builder UI comes in D31. */
async function sendCampaign(slug: string, recipients: string[]) {
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
}

async function mailpitHeaders(to: string) {
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
  return fetch(`${MAILPIT}/api/v1/message/${search.messages[0]!.ID}/headers`).then(
    (r) => r.json() as Promise<Record<string, string[]>>,
  );
}

test("campaign emails can be unsubscribed from in one click or from the page", async ({ page }) => {
  const workspace = `Deals ${Date.now()}`;
  const slug = await signUpWithWorkspace(page, {
    name: "Deal Owner",
    email: uniqueEmail("unsub-owner"),
    workspace,
  });
  const ana = uniqueEmail("unsub-ana");
  const bo = uniqueEmail("unsub-bo");
  await sendCampaign(slug, [ana, bo]);

  // Each email has a visible link in the body and one-click headers
  const anaPage = await emailLink(ana, /http:\/\/localhost:3000\/u\/\S+/);
  const boPage = await emailLink(bo, /http:\/\/localhost:3000\/u\/\S+/);
  const headers = await mailpitHeaders(ana);
  expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
  const oneClick = headers["List-Unsubscribe"]![0]!.slice(1, -1);
  expect(oneClick).toBe(anaPage.replace("/u/", "/api/unsubscribe/"));

  // Gmail's Unsubscribe button: a POST, with no cookies or page involved
  const response = await page.request.post(oneClick, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(response.status()).toBe(200);
  // A mail app that opens the header link in a browser gets the page
  const viaGet = await page.request.get(oneClick, { maxRedirects: 0 });
  expect(viaGet.status()).toBe(303);
  expect(viaGet.headers().location).toBe(anaPage);

  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByRole("row").filter({ hasText: ana })).toContainText("Unsubscribed");
  await expect(page.getByRole("row").filter({ hasText: bo })).toContainText("Subscribed");

  // The link in the body opens a page; unsubscribing takes a click
  await page.goto(boPage);
  await expect(page.getByRole("heading", { name: `Unsubscribe from ${workspace}?` })).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `${bo} won't get any more emails from ${workspace}.`,
  );

  // ...and can be undone
  await page.getByRole("button", { name: "Unsubscribed by mistake? Resubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're subscribed again" })).toBeVisible();
  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByRole("row").filter({ hasText: bo })).toContainText("Subscribed");

  // Revisiting the link after unsubscribing shows that straight away
  await page.goto(anaPage);
  await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();

  // A tampered link does nothing
  await page.goto(tamper(boPage));
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  const forged = await page.request.post(tamper(oneClick));
  expect(forged.status()).toBe(404);
});

/** Changes the first character of the token's signature. */
function tamper(url: string) {
  const dot = url.lastIndexOf(".") + 1;
  return url.slice(0, dot) + (url[dot] === "A" ? "B" : "A") + url.slice(dot + 1);
}
