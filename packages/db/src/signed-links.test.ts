import { beforeAll, describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  readSesWebhookToken,
  readUnsubscribeToken,
  sesWebhookUrl,
  unsubscribeUrls,
} from "./signed-links";

const ID = "019a1b2c-3d4e-7f80-9123-456789abcdef";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("unsubscribe tokens", () => {
  it("round-trip the message id in a short, URL-safe token", () => {
    const token = createUnsubscribeToken(ID);
    expect(token).toMatch(/^[\w-]{22}\.[\w-]{22}$/);
    expect(readUnsubscribeToken(token)).toBe(ID);
  });

  it("reject tampered and malformed tokens", () => {
    const token = createUnsubscribeToken(ID);
    const [id, sig] = token.split(".") as [string, string];
    const otherId = createUnsubscribeToken(ID.replace("abcdef", "abcdee")).split(".")[0];
    expect(readUnsubscribeToken(`${otherId}.${sig}`)).toBeNull();
    expect(readUnsubscribeToken(`${id}.${sig.slice(0, -1)}A`)).toBeNull();
    expect(readUnsubscribeToken(id)).toBeNull();
    expect(readUnsubscribeToken(`${token}.x`)).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
  });

  it("build the page and one-click links from the app URL", () => {
    const token = createUnsubscribeToken(ID);
    expect(unsubscribeUrls(ID, "https://app.sendcoop.test/")).toEqual({
      page: `https://app.sendcoop.test/u/${token}`,
      oneClick: `https://app.sendcoop.test/api/unsubscribe/${token}`,
    });
  });
});

describe("SES webhook URLs", () => {
  it("name the server, and can't be swapped with unsubscribe tokens", () => {
    const url = sesWebhookUrl(ID, "https://app.sendcoop.test");
    const token = url.split("/api/webhooks/ses/")[1]!;
    expect(readSesWebhookToken(token)).toBe(ID);
    expect(readUnsubscribeToken(token)).toBeNull();
    expect(readSesWebhookToken(createUnsubscribeToken(ID))).toBeNull();
  });
});
