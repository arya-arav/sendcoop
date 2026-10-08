import { expect, test } from "@playwright/test";
import {
  createCampaign,
  createList,
  createSubscriber,
  EMPTY_AUDIENCE,
  getSql,
  queueCampaign,
} from "@sendcoop/db";
import { enqueueCampaign } from "@sendcoop/queue";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("a campaign over the plan's monthly emails is blocked, with a clear message", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("quota");
  const slug = await signUpWithWorkspace(page, {
    name: "Quota Keeper",
    email,
    workspace: `Quota ${Date.now()}`,
  });
  const sql = getSql();
  // A free account allowed two emails a month.
  await sql`
    insert into subscriptions (user_id, plan_id, status, overrides)
    select u.id, p.id, 'active', ${JSON.stringify({ limits: { sendsPerMonth: 2 } })}::text::jsonb
    from users u, plans p where u.email = ${email} and p.key = 'free'`;

  // Two emails: exactly the allowance.
  const first = await sendCampaign(slug, [uniqueEmail("quota-a"), uniqueEmail("quota-b")]);
  await expect
    .poll(
      async () =>
        (await sql`select status from campaigns where id = ${first.campaignId}`)[0]!.status,
      {
        timeout: 20_000,
      },
    )
    .toBe("sent");

  // A third is over: the checklist says why, and sending is off.
  const [ws] = await sql<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const workspaceId = ws!.id;
  const list = await createList(workspaceId, { name: "More", description: null });
  if (!list.ok) throw new Error("setup");
  await createSubscriber(
    workspaceId,
    { email: uniqueEmail("quota-c"), firstName: null, lastName: null },
    [list.list.id],
  );
  const [sender] = await sql<{ domain: string; server: string }[]>`
    select c.sending_domain_id as domain, c.sending_server_id as server
    from campaigns c where c.id = ${first.campaignId}`;
  const draft = await createCampaign(workspaceId, {
    name: "One more",
    subject: "One more thing",
    fromName: "Deals",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: sender!.domain,
    sendingServerId: sender!.server,
    audience: { ...EMPTY_AUDIENCE, lists: [list.list.id] },
    html: "<p>Hi</p>",
    text: "Hi",
  });
  await page.goto(`/w/${slug}/campaigns/${draft!.id}/schedule`);
  const checklist = page.getByRole("list", { name: "Checklist" });
  await expect(checklist).toContainText(
    "This would send 1 emails, but your Free plan has 0 of its 2 a month left.",
  );
  await expect(checklist.getByRole("link", { name: /Upgrade your plan/ })).toHaveAttribute(
    "href",
    `/w/${slug}/settings/billing`,
  );

  // Queued anyway (as a scheduled campaign would be): the worker refuses it too.
  await queueCampaign(workspaceId, draft!.id);
  await enqueueCampaign({ campaignId: draft!.id, workspaceId });
  await expect
    .poll(
      async () => (await sql`select status from campaigns where id = ${draft!.id}`)[0]!.status,
      {
        timeout: 20_000,
      },
    )
    .toBe("failed");
  const [failed] = await sql<
    { error: string }[]
  >`select error from campaigns where id = ${draft!.id}`;
  expect(failed!.error).toMatch(/0 of its 2 a month left/);

  // The billing page shows what's used.
  await page.goto(`/w/${slug}/settings/billing`);
  await expect(page.getByRole("meter", { name: "Emails this month" })).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
  await expect(page.getByLabel("Usage")).toContainText("2 of 2");
  await expect(page.getByLabel("Usage")).toContainText("3 of 500");
});
