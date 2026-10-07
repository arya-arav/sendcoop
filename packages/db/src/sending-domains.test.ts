import { createSign, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dnsRecords, generateDkimKeys, normalizeSendingDomain } from "./sending-domains";

describe("normalizeSendingDomain", () => {
  it.each([
    ["Acme.com", "acme.com"],
    ["  mail.acme.co.uk. ", "mail.acme.co.uk"],
    ["news@acme.com", "acme.com"],
    ["https://acme.com/about", "acme.com"],
    ["bücher.de", "xn--bcher-kva.de"],
  ])("%j -> %s", (input, domain) => {
    expect(normalizeSendingDomain(input)).toEqual({ ok: true, domain });
  });

  it.each(["acme", "192.168.1.1", "-bad.com", "a..com", "", `${"x".repeat(64)}.com`])(
    "rejects %j",
    (input) => {
      expect(normalizeSendingDomain(input).ok).toBe(false);
    },
  );

  it("refuses mailbox providers' domains", () => {
    expect(normalizeSendingDomain("Gmail.com")).toMatchObject({
      ok: false,
      error: expect.stringContaining("only its provider"),
    });
  });
});

describe("generateDkimKeys", () => {
  it("makes a working RSA key pair named after the month", () => {
    const keys = generateDkimKeys(new Date(Date.UTC(2026, 9, 8)));
    expect(keys.selector).toBe("sc202610");
    const signature = createSign("sha256").update("hello").sign(keys.privateKeyPem);
    const publicPem = `-----BEGIN PUBLIC KEY-----\n${keys.publicKey}\n-----END PUBLIC KEY-----`;
    expect(createVerify("sha256").update("hello").verify(publicPem, signature)).toBe(true);
  });
});

describe("dnsRecords", () => {
  it("gives SPF, DKIM and DMARC records for the domain", () => {
    const records = dnsRecords(
      { domain: "acme.com", dkimSelector: "sc202610", dkimPublicKey: "PUBKEY" },
      "amazonses.com",
    );
    expect(records).toEqual([
      {
        purpose: "spf",
        type: "TXT",
        name: "acme.com",
        value: "v=spf1 include:amazonses.com ~all",
      },
      {
        purpose: "dkim",
        type: "TXT",
        name: "sc202610._domainkey.acme.com",
        value: "v=DKIM1; k=rsa; p=PUBKEY",
      },
      {
        purpose: "dmarc",
        type: "TXT",
        name: "_dmarc.acme.com",
        value: "v=DMARC1; p=none; rua=mailto:dmarc-reports@acme.com",
      },
    ]);
  });
});
