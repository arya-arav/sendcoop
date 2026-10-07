import { beforeAll, describe, expect, it } from "vitest";
import { createUnsubscribeToken, readUnsubscribeToken, unsubscribeUrls } from "./unsubscribe-token";

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
