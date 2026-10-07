import { describe, expect, it } from "vitest";
import { checkDomainRecords, type TxtLookup } from "./domain-verification";

const domain = { domain: "mail.acme.test", dkimSelector: "sc202610", dkimPublicKey: "MIIBKEY" };
const fake =
  (records: Record<string, string[]>): TxtLookup =>
  async (name) =>
    records[name] ?? [];

const good = {
  "mail.acme.test": [
    "google-site-verification=abc",
    "v=spf1 include:_spf.google.com include:amazonses.com ~all",
  ],
  "sc202610._domainkey.mail.acme.test": ["v=DKIM1; k=rsa; p=MIIB KEY"],
  "_dmarc.mail.acme.test": ["v=DMARC1; p=none"],
};

describe("checkDomainRecords", () => {
  it("passes when all three records are published", async () => {
    expect(await checkDomainRecords(domain, fake(good), "amazonses.com")).toEqual({
      spf: true,
      dkim: true,
      dmarc: true,
      problems: [],
    });
  });

  it("explains what's missing", async () => {
    expect(await checkDomainRecords(domain, fake({}), "amazonses.com")).toEqual({
      spf: false,
      dkim: false,
      dmarc: false,
      problems: ["No SPF record found.", "No DKIM record found.", "No DMARC record found."],
    });
  });

  it("flags several SPF records, a missing include and a different DKIM key", async () => {
    const twoSpf = await checkDomainRecords(
      domain,
      fake({ ...good, "mail.acme.test": ["v=spf1 include:amazonses.com ~all", "v=spf1 -all"] }),
      "amazonses.com",
    );
    expect(twoSpf.problems).toEqual(["There are several SPF records; merge them into one."]);

    const noInclude = await checkDomainRecords(
      domain,
      fake({ ...good, "mail.acme.test": ["v=spf1 include:sendgrid.net ~all"] }),
      "amazonses.com",
    );
    expect(noInclude.problems).toEqual(["The SPF record doesn't include amazonses.com."]);

    const otherKey = await checkDomainRecords(
      domain,
      fake({ ...good, "sc202610._domainkey.mail.acme.test": ["v=DKIM1; k=rsa; p=OTHER"] }),
      "amazonses.com",
    );
    expect(otherKey.problems).toEqual(["The DKIM record doesn't match this domain's key."]);
  });
});
