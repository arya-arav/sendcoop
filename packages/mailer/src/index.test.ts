import { generateKeyPairSync } from "node:crypto";
import { authenticate } from "mailauth";
import { afterEach, describe, expect, it } from "vitest";
import { buildRawMessage, smtpHostProblem } from "./index";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

describe("buildRawMessage", () => {
  it("signs with DKIM so receivers can verify it", async () => {
    const raw = await buildRawMessage(
      {
        from: { email: "news@mail.acme.test", name: "Acme" },
        to: "reader@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
        text: "Hi",
        headers: { "List-Unsubscribe": "<https://example.com/u/1>" },
      },
      {
        domainName: "mail.acme.test",
        keySelector: "sc202610",
        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      },
    );
    const text = raw.toString();
    expect(text).toMatch(/^DKIM-Signature: .*d=mail\.acme\.test/m);
    expect(text).toContain("From: Acme <news@mail.acme.test>");

    // Verify the signature like a receiving server, with the key from "DNS".
    const result = await authenticate(raw, {
      ip: "127.0.0.1",
      helo: "localhost",
      sender: "news@mail.acme.test",
      resolver: async (name: string, type: string) => {
        if (type === "TXT" && name === "sc202610._domainkey.mail.acme.test") {
          return [[`v=DKIM1; k=rsa; p=${publicKeyBase64}`]];
        }
        const error = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
        throw error;
      },
    });
    expect(result.dkim.results[0]?.status.result).toBe("pass");
  });

  it("builds an unsigned message without a key", async () => {
    const raw = await buildRawMessage({
      from: { email: "a@b.test" },
      to: "c@d.test",
      subject: "x",
      html: "x",
      text: "x",
    });
    expect(raw.toString()).not.toContain("DKIM-Signature");
  });
});

describe("smtpHostProblem", () => {
  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_SMTP_HOSTS;
  });

  it.each(["127.0.0.1", "10.0.0.5", "192.168.1.10", "172.20.0.2", "::1", "169.254.169.254"])(
    "refuses private address %s",
    async (host) => {
      expect(await smtpHostProblem(host)).toMatch(/private network/);
    },
  );

  it("refuses names that resolve to private addresses", async () => {
    expect(await smtpHostProblem("localhost")).toMatch(/private network/);
  });

  it("allows public addresses, and private ones when opted in", async () => {
    expect(await smtpHostProblem("8.8.8.8")).toBeNull();
    process.env.ALLOW_PRIVATE_SMTP_HOSTS = "true";
    expect(await smtpHostProblem("127.0.0.1")).toBeNull();
  });
});
