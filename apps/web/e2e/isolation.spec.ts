import { expect, test } from "@playwright/test";
import { createApiKey, getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

// Workspace isolation (D79): someone signed in to workspace A asks for
// workspace B's pages, records and data, through the app and the API, and
// gets nothing.
test("one workspace can't reach another's pages, records or API data", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const sql = getSql();

  // Workspace B, with things in it.
  const other = await browser.newContext();
  const bPage = await other.newPage();
  const bSlug = await signUpWithWorkspace(bPage, {
    name: "Bea",
    email: uniqueEmail("iso-b"),
    workspace: `Iso B ${Date.now()}`,
  });
  await other.close();
  const [b] = await sql<{ id: string }[]>`select id from workspaces where slug = ${bSlug}`;
  const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id;
  const bEmail = uniqueEmail("iso-b-sub");
  const ids = {
    subscriber: await one(sql`
      insert into subscribers (workspace_id, email) values (${b!.id}, ${bEmail}) returning id`),
    campaign: await one(sql`
      insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text)
      values (${b!.id}, 'B secret', 'B', 'B', 'b', 'x', 'x') returning id`),
    template: await one(sql`
      insert into templates (workspace_id, name, html, text) values (${b!.id}, 'B', 'x', 'x') returning id`),
  };

  // Workspace A, signed in.
  const ownerA = uniqueEmail("iso-a");
  const aSlug = await signUpWithWorkspace(page, {
    name: "Al",
    email: ownerA,
    workspace: `Iso A ${Date.now()}`,
  });

  // B's workspace, and B's records under A's workspace: not found.
  for (const path of [
    `/w/${bSlug}`,
    `/w/${bSlug}/contacts`,
    `/w/${aSlug}/contacts/${ids.subscriber}`,
    `/w/${aSlug}/campaigns/${ids.campaign}`,
    `/w/${aSlug}/templates/${ids.template}`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  await expect(page.getByText("B secret")).toHaveCount(0);

  // The app's own endpoints, with A's session: not found.
  const content = await page.request.put(`/api/w/${aSlug}/campaigns/${ids.campaign}/content`, {
    headers: { origin: new URL(page.url()).origin },
    data: { editor: "html", html: "<p>pwned</p>" },
  });
  expect(content.status()).toBe(404);

  // A's API key: B's subscriber, by id or email, isn't there.
  await sql`
    insert into subscriptions (user_id, plan_id, status)
    select u.id, p.id, 'active' from users u, plans p where u.email = ${ownerA} and p.key = 'growth'`;
  const [a] = await sql<{ id: string }[]>`select id from workspaces where slug = ${aSlug}`;
  const { key } = await createApiKey(a!.id, "Iso", null);
  const api = (method: string, path: string, data?: unknown) =>
    request.fetch(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${key}` },
      ...(data !== undefined && { data }),
    });
  expect((await api("GET", `/subscribers/${ids.subscriber}`)).status()).toBe(404);
  expect((await api("GET", `/subscribers/${encodeURIComponent(bEmail)}`)).status()).toBe(404);
  expect(
    (await api("PATCH", `/subscribers/${ids.subscriber}`, { first_name: "Mallory" })).status(),
  ).toBe(404);
  expect((await api("DELETE", `/subscribers/${ids.subscriber}`)).status()).toBe(404);
  const listed = await (await api("GET", "/subscribers")).json();
  expect(JSON.stringify(listed)).not.toContain(bEmail);

  // And B's subscriber is untouched.
  const [still] = await sql<{ first_name: string | null }[]>`
    select first_name from subscribers where id = ${ids.subscriber}`;
  expect(still).toEqual({ first_name: null });
});

test("cookie-authenticated endpoints refuse requests from other sites", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Csrf",
    email: uniqueEmail("csrf"),
    workspace: `Csrf ${Date.now()}`,
  });
  const response = await page.request.post(`/api/w/${slug}/suppressions`, {
    headers: { origin: "https://evil.example" },
    multipart: {
      file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("email\na@b.co\n") },
    },
  });
  expect(response.status()).toBe(403);
});

test("pages send security headers, and only signup forms can be framed", async ({ request }) => {
  const login = await request.get("/login");
  expect(login.headers()["x-frame-options"]).toBe("DENY");
  expect(login.headers()["x-content-type-options"]).toBe("nosniff");
  expect(login.headers()["x-powered-by"]).toBeUndefined();
  const form = await request.get("/f/not-a-form");
  expect(form.headers()["x-frame-options"]).toBeUndefined();
});
