import { beforeAll, describe, expect, it } from "vitest";
import { createConfirmToken, readConfirmToken } from "./confirm-token";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-confirm-tokens";
});

const claims = { subscriberId: "sub-1", workspaceId: "ws-1", formId: "form-1" };

describe("confirm tokens", () => {
  it("round-trips the claims", () => {
    expect(readConfirmToken(createConfirmToken(claims))).toEqual(claims);
  });

  it("rejects tampered tokens", () => {
    const token = createConfirmToken(claims);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ s: "sub-2", w: "ws-1", f: "form-1", e: Date.now() + 1e9 }),
    ).toString("base64url");
    expect(readConfirmToken(`${forged}.${signature}`)).toBeNull();
    expect(readConfirmToken(`${payload}.${signature}x`)).toBeNull();
    expect(readConfirmToken("garbage")).toBeNull();
  });

  it("expires after 7 days", () => {
    const issued = Date.now();
    const token = createConfirmToken(claims, issued);
    expect(readConfirmToken(token, issued + 6 * 86_400_000)).toEqual(claims);
    expect(readConfirmToken(token, issued + 8 * 86_400_000)).toBeNull();
  });

  it("depends on the secret", () => {
    const token = createConfirmToken(claims);
    process.env.BETTER_AUTH_SECRET = "another-secret";
    expect(readConfirmToken(token)).toBeNull();
    process.env.BETTER_AUTH_SECRET = "test-secret-for-confirm-tokens";
  });
});
