import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

const KEY = Buffer.alloc(32, 7).toString("base64");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = KEY;
});

describe("secrets", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("private key");
    const b = encryptSecret("private key");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("private key");
  });

  it("detects tampering and the wrong key", () => {
    const stored = encryptSecret("secret");
    const parts = stored.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(stored)).toThrow();
    process.env.ENCRYPTION_KEY = KEY;
  });

  it("refuses a key of the wrong length", () => {
    process.env.ENCRYPTION_KEY = "short";
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    process.env.ENCRYPTION_KEY = KEY;
  });
});
