import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRawMessage, createDriver } from "./index";

// Both drivers deliver for real: SMTP to Mailpit, SES to a local SES emulator
// through the actual AWS SDK.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
let sesUrl: string;

/** A free local port for the emulator. */
async function freePort() {
  return new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const port = await freePort();
  const { default: sesLocal } = await import("aws-ses-v2-local");
  await (sesLocal as (options: { port: number }) => Promise<unknown>)({ port });
  sesUrl = `http://localhost:${port}`;
  process.env.SES_ENDPOINT = sesUrl;
});

afterAll(() => {
  delete process.env.SES_ENDPOINT;
});

const message = (to: string, subject: string) =>
  buildRawMessage({
    from: { email: "news@mail.acme.test", name: "Acme" },
    to,
    subject,
    html: "<p>Test from Sendcoop</p>",
    text: "Test from Sendcoop",
  });

describe("mail drivers", () => {
  it("delivers through SMTP", async () => {
    const to = `smtp-${Date.now()}@example.com`;
    const driver = createDriver({
      type: "smtp",
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1026),
      secure: false,
    });
    await driver.send(await message(to, "Via SMTP"), { from: "news@mail.acme.test", to: [to] });
    driver.close();

    const found = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    ).then((r) => r.json() as Promise<{ messages: { Subject: string }[] }>);
    expect(found.messages[0]?.Subject).toBe("Via SMTP");
  });

  it("delivers through SES", async () => {
    const to = `ses-${Date.now()}@example.com`;
    const driver = createDriver({
      type: "ses",
      region: "us-east-1",
      accessKeyId: "test",
      secretAccessKey: "test",
    });
    const { messageId } = await driver.send(await message(to, "Via SES"), {
      from: "news@mail.acme.test",
      to: [to],
    });
    driver.close();
    expect(messageId).toBeTruthy();

    const store = (await fetch(`${sesUrl}/store`).then((r) => r.json())) as {
      emails: { subject: string; destination: { to: string[] } }[];
    };
    const received = store.emails.find((e) => e.destination.to.includes(to));
    expect(received?.subject).toBe("Via SES");
  });
});
