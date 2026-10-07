import { Resolver } from "node:dns/promises";

// Checks that a sending domain's SPF, DKIM and DMARC records are published.
// The resolver is a parameter so tests can answer from a fake DNS.

/** TXT records for a name, each as its joined strings; [] if there are none. */
export type TxtLookup = (name: string) => Promise<string[]>;

/** Real DNS. DNS_SERVERS ("host:port,host:port") points it elsewhere, e.g. in tests. */
export function systemTxtLookup(): TxtLookup {
  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  const servers = process.env.DNS_SERVERS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers?.length) resolver.setServers(servers);
  return async (name) => {
    try {
      return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(""));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") return [];
      throw error;
    }
  };
}

export type RecordCheck = { spf: boolean; dkim: boolean; dmarc: boolean; problems: string[] };

export async function checkDomainRecords(
  domain: { domain: string; dkimSelector: string; dkimPublicKey: string },
  lookup: TxtLookup,
  spfInclude = process.env.SPF_INCLUDE || "amazonses.com",
): Promise<RecordCheck> {
  const [root, dkim, dmarc] = await Promise.all([
    lookup(domain.domain),
    lookup(`${domain.dkimSelector}._domainkey.${domain.domain}`),
    lookup(`_dmarc.${domain.domain}`),
  ]);
  const problems: string[] = [];

  const spfRecords = root.filter((r) => /^v=spf1(\s|$)/i.test(r.trim()));
  const spfOk =
    spfRecords.length === 1 &&
    spfRecords[0]!.toLowerCase().split(/\s+/).includes(`include:${spfInclude.toLowerCase()}`);
  if (spfRecords.length === 0) problems.push("No SPF record found.");
  else if (spfRecords.length > 1)
    problems.push("There are several SPF records; merge them into one.");
  else if (!spfOk) problems.push(`The SPF record doesn't include ${spfInclude}.`);

  // DNS providers sometimes add spaces when splitting long values; ignore them.
  const dkimOk = dkim.some((r) => r.replace(/\s+/g, "").includes(`p=${domain.dkimPublicKey}`));
  if (!dkimOk) {
    problems.push(
      dkim.length ? "The DKIM record doesn't match this domain's key." : "No DKIM record found.",
    );
  }

  const dmarcOk = dmarc.some((r) => /^v=DMARC1(;|\s|$)/i.test(r.trim()));
  if (!dmarcOk) problems.push("No DMARC record found.");

  return { spf: spfOk, dkim: dkimOk, dmarc: dmarcOk, problems };
}
