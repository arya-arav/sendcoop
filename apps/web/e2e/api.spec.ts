import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("subscribers and conversions are managed through the REST API with a key", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("api-owner");
  const slug = await signUpWithWorkspace(page, {
    name: "API Owner",
    email,
    workspace: `API ${Date.now()}`,
  });

  // A key from Settings > API keys.
  await page.goto(`/w/${slug}/settings`);
  await page.getByRole("link", { name: /API keys/ }).click();
  await expect(page.getByRole("status")).toContainText("The API isn't part of the Free plan");
  await page.getByLabel("Key name").fill("Checkout server");
  await page.getByRole("button", { name: "Create key" }).click();
  const key = await page.getByLabel("Your new key").inputValue();
  expect(key).toMatch(/^sc_live_/);
  await expect(page.getByRole("table", { name: "API keys" })).toContainText("Checkout server");

  const api = (method: string, path: string, data?: unknown) =>
    request.fetch(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${key}` },
      ...(data !== undefined && { data }),
    });

  // The free plan has no API; on Growth it works.
  const refused = await api("GET", "/subscribers");
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error.code).toBe("plan_required");
  await getSql()`
    insert into subscriptions (user_id, plan_id, status)
    select u.id, p.id, 'active' from users u, plans p where u.email = ${email} and p.key = 'growth'`;

  const [list] = await getSql()<{ id: string }[]>`
    insert into lists (workspace_id, name)
    select id, 'Buyers' from workspaces where slug = ${slug} returning id`;
  const lists = await (await api("GET", "/lists")).json();
  expect(lists.data).toEqual([expect.objectContaining({ id: list!.id, name: "Buyers" })]);

  // Create, read, change, unsubscribe.
  const person = uniqueEmail("api-person");
  const created = await api("POST", "/subscribers", {
    email: person,
    first_name: "Robin",
    lists: [list!.id],
  });
  expect(created.status()).toBe(201);
  const subscriber = (await created.json()).data;
  expect(subscriber).toMatchObject({
    email: person,
    first_name: "Robin",
    status: "subscribed",
    source: "api",
  });
  expect(subscriber.lists).toEqual([list!.id]);
  expect((await api("POST", "/subscribers", { email: person })).status()).toBe(409);
  expect((await api("POST", "/subscribers", { email: "not an email" })).status()).toBe(422);

  const byEmail = await api("GET", `/subscribers/${encodeURIComponent(person)}`);
  expect((await byEmail.json()).data.id).toBe(subscriber.id);

  const changed = await api("PATCH", `/subscribers/${subscriber.id}`, {
    last_name: "Lee",
    remove_lists: [list!.id],
    status: "unsubscribed",
  });
  expect((await changed.json()).data).toMatchObject({
    last_name: "Lee",
    status: "unsubscribed",
    lists: [],
  });
  expect(
    (await api("PATCH", `/subscribers/${subscriber.id}`, { status: "subscribed" })).status(),
  ).toBe(422);

  const listed = await (await api("GET", "/subscribers?status=unsubscribed&limit=10")).json();
  expect(listed.data.map((s: { id: string }) => s.id)).toEqual([subscriber.id]);
  expect(listed.next_cursor).toBeNull();

  // A sale for them, then the list of conversions.
  const sale = await api("POST", "/conversions", {
    email: person,
    value: 49,
    currency: "USD",
    txid: `order-${Date.now()}`,
  });
  expect(sale.status()).toBe(201);
  const conversions = await (await api("GET", "/conversions")).json();
  expect(conversions.data[0]).toMatchObject({ event: "sale", value: 49, currency: "USD" });

  expect((await api("DELETE", `/subscribers/${subscriber.id}`)).status()).toBe(204);
  expect((await api("GET", `/subscribers/${subscriber.id}`)).status()).toBe(404);

  // Revoked: the key stops working.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke Checkout server" }).click();
  await expect(page.getByRole("table", { name: "API keys" })).toContainText("No keys yet.");
  expect((await api("GET", "/lists")).status()).toBe(401);
});

test("the OpenAPI document is public and lists the endpoints", async ({ request }) => {
  const doc = await (await request.get("/api/v1/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths)).toEqual(
    expect.arrayContaining(["/subscribers", "/subscribers/{subscriber}", "/lists", "/conversions"]),
  );
});
