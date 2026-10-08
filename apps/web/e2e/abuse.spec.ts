import { expect, test } from "@playwright/test";
import {
  addSendingDomain,
  createCampaign,
  createList,
  createSendingServer,
  EMPTY_AUDIENCE,
  getSql,
} from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

/** A draft to `count` new subscribers (as many as `risky` of them role addresses). */
async function bigDraft(slug: string, count: number, risky = 0) {
  const sql = getSql();
  const [ws] = await sql<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const workspaceId = ws!.id;
  const list = await createList(workspaceId, { name: `Big ${count}`, description: null });
  const domain = await addSendingDomain(workspaceId, `mail.${slug}.test`);
  if (!list.ok || !domain.ok) throw new Error("setup");
  const server = await createSendingServer(workspaceId, {
    name: "Mailpit",
    type: "smtp",
    summary: "mailpit",
    config: { type: "smtp", host: "localhost", port: 1026, secure: false },
    limits: { maxPerSecond: null, maxPerHour: null, maxPerDay: null },
  });
  await sql`
    with made as (
      insert into subscribers (workspace_id, email, status, subscribed_at)
      select ${workspaceId},
             case when g <= ${risky} then 'info@shop-' || g || '.example' else 'reader-' || g || '@example.com' end,
             'subscribed', now()
      from generate_series(1, ${count}) g
      returning id)
    insert into list_memberships (list_id, subscriber_id) select ${list.list.id}, id from made`;
  // As an import of this size does, so audience counts get a good plan.
  await sql`analyze subscribers`;
  await sql`analyze list_memberships`;
  const draft = await createCampaign(workspaceId, {
    name: "Day one",
    subject: "Hello",
    fromName: "Shop",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
    audience: { ...EMPTY_AUDIENCE, lists: [list.list.id] },
    html: "<p>Hi</p>",
    text: "Hi",
  });
  return draft!.id;
}

test("a new account can't email 100,000 people on its first day", async ({ page }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("warmup");
  const slug = await signUpWithWorkspace(page, {
    name: "New Sender",
    email,
    workspace: `Warmup ${Date.now()}`,
  });
  // A plan that would allow it: only the warm-up stands in the way.
  const unlimited = { limits: { subscribers: null } };
  await getSql()`
    insert into subscriptions (user_id, plan_id, status, overrides)
    select u.id, p.id, 'active', ${JSON.stringify(unlimited)}::text::jsonb
    from users u, plans p where u.email = ${email} and p.key = 'pro'`;
  const campaignId = await bigDraft(slug, 100_000);

  await page.goto(`/w/${slug}/campaigns/${campaignId}/schedule`);
  const checklist = page.getByRole("list", { name: "Checklist" });
  await expect(checklist).toContainText(
    "New accounts send up to 1,000 emails a day at first, rising over two weeks.",
  );
  await expect(page.getByRole("button", { name: /^Send to/ })).toBeDisabled();

  // A super-admin vouches for them: the warm-up no longer applies.
  await getSql()`
    update subscriptions set overrides = ${JSON.stringify({ ...unlimited, trusted: true })}::text::jsonb
    where user_id = (select id from users where email = ${email})`;
  await page.reload();
  await expect(checklist).not.toContainText("New accounts send up to");
});

test("a list that's mostly role addresses can't be sent to", async ({ page }) => {
  const email = uniqueEmail("quality");
  const slug = await signUpWithWorkspace(page, {
    name: "List Buyer",
    email,
    workspace: `Quality ${Date.now()}`,
  });
  const campaignId = await bigDraft(slug, 100, 60);
  await page.goto(`/w/${slug}/campaigns/${campaignId}/schedule`);
  await expect(page.getByRole("list", { name: "Checklist" })).toContainText(
    "60% of recipients are shared or throwaway addresses",
  );
});
