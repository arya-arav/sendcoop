import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

test("a lead from a form is listed, and selling it puts its value in the email's revenue", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Lead Gen",
    email: uniqueEmail("leads"),
    workspace: `Leads ${Date.now()}`,
  });
  const reader = uniqueEmail("leads-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    html: `<html><body><a href="https://audit.example/book">Book a free audit</a></body></html>`,
  });
  const sql = getSql();
  const [workspace] = await sql<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  await sql`insert into lists (workspace_id, name) values (${workspace!.id}, 'Audit leads')`;

  // New leads join a list
  await page.goto(`/w/${slug}/settings/tracking`);
  const leads = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: "Leads", exact: true }) });
  const webhookUrl = await leads.getByLabel("Lead webhook URL").inputValue();
  expect(webhookUrl).toMatch(/^http:\/\/localhost:3001\/lead\/ld_\w{32}$/);
  await leads.getByLabel("Add new leads to a list").selectOption({ label: "Audit leads" });
  await leads.getByRole("button", { name: "Save" }).click();
  await expect(leads.getByRole("status")).toHaveText("Saved.");

  // The reader clicks through to the landing page, which keeps sc_cid in a hidden field
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${reader}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = found.messages?.[0]?.ID;
        if (!id) return false;
        const { HTML } = await fetch(`${MAILPIT}/api/v1/message/${id}`).then(
          (r) => r.json() as Promise<{ HTML: string }>,
        );
        link = HTML.match(/href="(http:\/\/localhost:3001\/c\/[^"]+)"/)?.[1];
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const redirect = await request.get(link!, { maxRedirects: 0 });
  const clickId = new URL(redirect.headers().location!).searchParams.get("sc_cid")!;

  // The form tool posts the lead
  const created = await request.post(webhookUrl, {
    form: { "Full Name": "Pat Smith", Email: reader, "Submission ID": "F-77", sc_cid: clickId },
  });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({
    result: "created",
    stage: "new",
    attributed_by: "click",
    listed: true,
  });

  const revenue = page
    .getByRole("region", { name: "Results" })
    .locator("[data-slot=card]")
    .filter({ has: page.getByText("Revenue", { exact: true }) });
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(revenue).toContainText("$0.00");

  // The CRM qualifies it, then sells it
  await request.post(webhookUrl, { data: { submission_id: "F-77", status: "qualified" } });
  const sold = await request.post(webhookUrl, {
    data: { submission_id: "F-77", status: "Closed Won", value: 750 },
  });
  expect(await sold.json()).toMatchObject({ result: "updated", stage: "sold" });
  await page.reload();
  await expect(revenue).toContainText("$750.00");

  await page.goto(`/w/${slug}/settings/tracking`);
  const row = page
    .locator("[data-slot=card]", { hasText: "Recent conversions" })
    .getByRole("row")
    .filter({ hasText: "Lead form" });
  await expect(row).toContainText("$750.00");
  await expect(row).toContainText(/sold/i);
  const [member] = await sql<{ first_name: string }[]>`
    select s.first_name from list_memberships m
    join lists l on l.id = m.list_id join subscribers s on s.id = m.subscriber_id
    where l.workspace_id = ${workspace!.id} and l.name = 'Audit leads'`;
  expect(member).toEqual({ first_name: "Pat" });
});
