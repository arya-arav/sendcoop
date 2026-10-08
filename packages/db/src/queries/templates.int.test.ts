import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { EMPTY_AUDIENCE, workspaces } from "../schema";
import { createCampaignFromTemplate, getCampaign } from "./campaigns";
import { createTemplate, listTemplates, updateTemplate } from "./templates";

const db = getDb();
const run = Date.now().toString(36);
let ws: string;
let other: string;

const settings = {
  fromName: "Acme",
  fromLocal: "news",
  replyTo: null,
  sendingDomainId: null,
  sendingServerId: null,
  audience: EMPTY_AUDIENCE,
};

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Templates", slug: `int-tpl-${run}` },
      { name: "Templates other", slug: `int-tpl-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await getSql().end();
});

describe("campaigns from templates", () => {
  it("copy the content, so later template edits don't change the campaign", async () => {
    const template = await createTemplate(ws, {
      name: "Abandoned cart",
      subject: "{{first_name | You}}, you left something",
      html: "<p>Come back</p>",
      text: "Come back",
    });
    const campaign = await createCampaignFromTemplate(ws, template.id, settings);
    expect(campaign).toMatchObject({
      name: "Abandoned cart",
      subject: "{{first_name | You}}, you left something",
      html: "<p>Come back</p>",
      text: "Come back",
      status: "draft",
    });

    await updateTemplate(ws, template.id, { html: "<p>Changed</p>" });
    expect((await getCampaign(ws, campaign!.id))?.html).toBe("<p>Come back</p>");
  });

  it("take a name and subject when given, and fall back to the name for a subject", async () => {
    const template = await createTemplate(ws, { name: "No subject", html: "x", text: "x" });
    expect(
      await createCampaignFromTemplate(ws, template.id, { ...settings, name: "October promo" }),
    ).toMatchObject({ name: "October promo", subject: "No subject" });
  });

  it("only use templates from the same workspace", async () => {
    const [template] = await listTemplates(ws);
    expect(await createCampaignFromTemplate(other, template!.id, settings)).toBeNull();
  });
});
