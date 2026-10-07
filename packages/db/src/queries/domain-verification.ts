import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import { checkDomainRecords, type RecordCheck, type TxtLookup } from "../domain-verification";
import { sendingDomains } from "../schema";

/** How long a new domain can be incomplete before it shows as "records missing". */
const GRACE_HOURS = 72;

type CheckableDomain = {
  id: string;
  domain: string;
  dkimSelector: string;
  dkimPublicKey: string;
  status: "pending" | "verified" | "failed";
  createdAt: Date;
};

/** Looks up a domain's records and saves the result. Returns what was found. */
export async function verifySendingDomain(
  domain: CheckableDomain,
  lookup: TxtLookup,
  now = new Date(),
): Promise<RecordCheck & { status: CheckableDomain["status"] }> {
  const check = await checkDomainRecords(domain, lookup);
  const allGood = check.spf && check.dkim && check.dmarc;
  const ageHours = (now.getTime() - domain.createdAt.getTime()) / 3_600_000;
  const status = allGood
    ? "verified"
    : // A verified domain that loses a record, or a new one past the grace period.
      domain.status === "verified" || ageHours > GRACE_HOURS
      ? "failed"
      : "pending";

  await getDb()
    .update(sendingDomains)
    .set({
      spfVerified: check.spf,
      dkimVerified: check.dkim,
      dmarcVerified: check.dmarc,
      status,
      lastCheckedAt: now,
      verifiedAt: allGood
        ? sql`coalesce(${sendingDomains.verifiedAt}, ${now.toISOString()}::timestamptz)`
        : sendingDomains.verifiedAt,
    })
    .where(eq(sendingDomains.id, domain.id));
  return { ...check, status };
}

/**
 * Domains to check now: unverified ones every 10 minutes, verified ones daily
 * (to notice a record being removed). Oldest check first.
 */
export async function domainsDueForCheck(
  now = new Date(),
  limit = 200,
): Promise<CheckableDomain[]> {
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  return getDb()
    .select({
      id: sendingDomains.id,
      domain: sendingDomains.domain,
      dkimSelector: sendingDomains.dkimSelector,
      dkimPublicKey: sendingDomains.dkimPublicKey,
      status: sendingDomains.status,
      createdAt: sendingDomains.createdAt,
    })
    .from(sendingDomains)
    .where(
      or(
        isNull(sendingDomains.lastCheckedAt),
        and(
          inArray(sendingDomains.status, ["pending", "failed"]),
          lt(sendingDomains.lastCheckedAt, tenMinutesAgo),
        ),
        and(eq(sendingDomains.status, "verified"), lt(sendingDomains.lastCheckedAt, dayAgo)),
      ),
    )
    .orderBy(asc(sql`coalesce(${sendingDomains.lastCheckedAt}, 'epoch')`))
    .limit(limit);
}

/** The scheduled job: checks every due domain. Returns how many became verified. */
export async function verifyDueDomains(lookup: TxtLookup, now = new Date()) {
  const due = await domainsDueForCheck(now);
  let verified = 0;
  for (const domain of due) {
    const before = domain.status;
    try {
      const result = await verifySendingDomain(domain, lookup, now);
      if (result.status === "verified" && before !== "verified") verified++;
    } catch (error) {
      // One domain's DNS trouble shouldn't stop the others.
      console.error(`[domains] checking ${domain.domain} failed`, error);
    }
  }
  return { checked: due.length, verified };
}

/** For the "Check now" button: the domain row needed to check it. */
export async function getCheckableDomain(workspaceId: string, domainId: string) {
  const [row] = await getDb()
    .select({
      id: sendingDomains.id,
      domain: sendingDomains.domain,
      dkimSelector: sendingDomains.dkimSelector,
      dkimPublicKey: sendingDomains.dkimPublicKey,
      status: sendingDomains.status,
      createdAt: sendingDomains.createdAt,
    })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.workspaceId, workspaceId)));
  return row ?? null;
}
