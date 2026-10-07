import { generateKeyPairSync } from "node:crypto";
import { domainToASCII } from "node:url";

// Rules and DNS records for a workspace's sending domains.

/** Mailbox providers' domains: only they can authenticate mail from them. */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "web.de",
  "yandex.com",
  "mail.ru",
  "zoho.com",
  "qq.com",
  "163.com",
  "rediffmail.com",
]);

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** The domain in canonical form (lowercase, punycode), or a reason it can't be used. */
export function normalizeSendingDomain(
  input: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  let value = input.trim().toLowerCase();
  // Accept pasted addresses and URLs: "news@acme.com", "https://acme.com/".
  value = value.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
  if (value.includes("@")) value = value.split("@").pop()!;
  value = value.replace(/\.$/, "");
  const ascii = domainToASCII(value);
  const labels = ascii.split(".");
  if (
    !ascii ||
    ascii.length > 253 ||
    labels.length < 2 ||
    !labels.every((l) => LABEL.test(l)) ||
    /^\d+$/.test(labels.at(-1)!)
  ) {
    return { ok: false, error: "Enter a domain like acme.com or mail.acme.com." };
  }
  if (FREE_MAIL_DOMAINS.has(ascii)) {
    return {
      ok: false,
      error: `You can't send as ${ascii}: only its provider can authenticate it. Use a domain you own.`,
    };
  }
  return { ok: true, domain: ascii };
}

export type DkimKeys = { selector: string; publicKey: string; privateKeyPem: string };

/** A new 2048-bit RSA key pair for DKIM; the selector names this key in DNS. */
export function generateDkimKeys(now = new Date()): DkimKeys {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return {
    selector: `sc${now.getUTCFullYear()}${month}`,
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export type DnsRecordPurpose = "spf" | "dkim" | "dmarc";

export type DnsRecord = {
  purpose: DnsRecordPurpose;
  type: "TXT";
  /** Fully qualified record name. */
  name: string;
  value: string;
};

export function dnsRecords(
  domain: { domain: string; dkimSelector: string; dkimPublicKey: string },
  spfInclude = process.env.SPF_INCLUDE || "amazonses.com",
): DnsRecord[] {
  return [
    {
      purpose: "spf",
      type: "TXT",
      name: domain.domain,
      value: `v=spf1 include:${spfInclude} ~all`,
    },
    {
      purpose: "dkim",
      type: "TXT",
      name: `${domain.dkimSelector}._domainkey.${domain.domain}`,
      value: `v=DKIM1; k=rsa; p=${domain.dkimPublicKey}`,
    },
    {
      purpose: "dmarc",
      type: "TXT",
      name: `_dmarc.${domain.domain}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain.domain}`,
    },
  ];
}
