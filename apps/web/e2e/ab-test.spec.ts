import { expect, test } from "@playwright/test";
import {
  addSendingDomain,
  createDraftCampaign,
  createList,
  createSendingServer,
  createSubscriber,
  EMPTY_AUDIENCE,
  getSql,
  updateDraftCampaign,
} from "@sendcoop/db";
import { onPlan, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("an A/B test sends two versions, then the winner to everyone else", async ({ page }) => {
  test.setTimeout(120_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Tester",
    email: uniqueEmail("ab"),
    workspace: `AB ${Date.now()}`,
  });
  await onPlan(slug, "growth"); // automations, A/B tests, AI, UTMCAP

  // A ready draft to 4 people (set up directly; the builder has its own tests)
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const domain = await addSendingDomain(ws!.id, `mail.${slug}.test`);
  const list = await createList(ws!.id, { name: "Readers", description: null });
  if (!domain.ok || !list.ok) throw new Error("setup");
  const server = await createSendingServer(ws!.id, {
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
  for (let i = 0; i < 4; i++) {
    await createSubscriber(
      ws!.id,
      { email: uniqueEmail(`ab-${i}`), firstName: null, lastName: null },
      [list.list.id],
    );
  }
  const draft = await createDraftCampaign(ws!.id, "Acme");
  await updateDraftCampaign(ws!.id, draft.id, {
    name: "Subject test",
    subject: "Our autumn sale",
    html: "<p>Version A</p>",
    text: "Version A",
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
    audience: { ...EMPTY_AUDIENCE, lists: [list.list.id] },
  });

  // Set up the test
  await page.goto(`/w/${slug}/campaigns/${draft.id}/content`);
  await page.getByRole("button", { name: "Set up an A/B test" }).click();
  await page.getByLabel("Version B subject").fill("Last chance: autumn sale ends soon");
  await page.getByLabel("Test on").selectOption("50");
  await page.getByLabel("Then wait").selectOption("1");
  await page.getByRole("button", { name: "Save A/B test" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Version B subject")).toHaveValue(
    "Last chance: autumn sale ends soon",
  );

  // Send: one gets A, one gets B, two wait
  await page
    .getByRole("navigation", { name: "Campaign steps" })
    .getByRole("link", { name: /Schedule/ })
    .click();
  await page.getByRole("button", { name: "Send to 4 recipients" }).click();
  await expect(page.getByRole("heading", { name: "A/B test" })).toBeVisible();
  const counts = async () =>
    (
      await getSql()<{ held: number; sent: number }[]>`
        select count(*) filter (where status = 'held')::int as held,
               count(*) filter (where status = 'sent')::int as sent
        from messages where campaign_id = ${draft.id}`
    )[0];
  await expect.poll(counts, { timeout: 20_000 }).toEqual({ held: 2, sent: 2 });
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "everyone else" })).toContainText(
    "goes to everyone else at",
  );

  // B gets a click, and the test's hour is up
  await getSql()`update messages set clicked_at = now()
    where campaign_id = ${draft.id} and variant = 'b'`;
  await getSql()`update campaigns set ab_decide_at = now() where id = ${draft.id}`;

  // The worker's maintenance job picks B and sends it to the other two
  await expect.poll(counts, { timeout: 60_000, intervals: [1000] }).toEqual({ held: 0, sent: 4 });
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Version B" })).toHaveText(
    "Version B won on clicks and went to everyone else.",
  );
  const winner = page.getByRole("row").filter({ hasText: "Winner" });
  await expect(winner).toContainText("Last chance: autumn sale ends soon");
  await expect(winner).toContainText("3"); // B: 1 test + 2 remainder
});
