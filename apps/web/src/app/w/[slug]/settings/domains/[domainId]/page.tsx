import { type DnsRecordPurpose, dnsRecords, getSendingDomain } from "@sendcoop/db";
import { ArrowLeft, CircleCheck, CircleDashed } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CopyField } from "@/components/copy-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { DomainStatusBadge } from "../status-badge";
import { CheckNow } from "./check-now";
import { DeleteDomainButton } from "./delete-domain";

const RECORD_COPY: Record<DnsRecordPurpose, { title: string; why: string; note?: string }> = {
  spf: {
    title: "SPF",
    why: "Lists the servers allowed to send mail for your domain.",
    note: "A domain can have only one SPF record. If one exists, add the include: part to it instead of creating a second.",
  },
  dkim: {
    title: "DKIM",
    why: "Our signature on every email, proving it wasn't changed on the way.",
    note: "The value is long. Paste it whole; if your DNS provider asks, split it into 255-character pieces.",
  },
  dmarc: {
    title: "DMARC",
    why: "Tells inboxes what to do with mail that fails SPF or DKIM, and sends you reports.",
    note: "p=none only monitors. Once everything passes, tighten it to p=quarantine.",
  },
};

export default async function DomainPage({
  params,
}: {
  params: Promise<{ slug: string; domainId: string }>;
}) {
  const { slug, domainId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!z.uuid().safeParse(domainId).success) notFound();
  const domain = await getSendingDomain(workspace.id, domainId);
  if (!domain) notFound();
  const verified: Record<DnsRecordPurpose, boolean> = {
    spf: domain.spfVerified,
    dkim: domain.dkimVerified,
    dmarc: domain.dmarcVerified,
  };

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/settings/domains`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Sending domains
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold break-all">{domain.domain}</h1>
          <p className="text-sm text-muted-foreground">
            Add these three TXT records at your DNS provider (Cloudflare, GoDaddy, Namecheap…).
            Changes can take up to a few hours to appear.
          </p>
        </div>
        <DomainStatusBadge status={domain.status} />
      </div>

      <CheckNow
        slug={slug}
        domainId={domain.id}
        lastCheckedAt={domain.lastCheckedAt?.toISOString() ?? null}
      />

      {dnsRecords(domain).map((record) => {
        const copy = RECORD_COPY[record.purpose];
        const ok = verified[record.purpose];
        return (
          <Card key={record.purpose}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {ok ? (
                  <CircleCheck className="size-5 text-emerald-600" aria-label="Found" />
                ) : (
                  <CircleDashed
                    className="size-5 text-muted-foreground"
                    aria-label="Not found yet"
                  />
                )}
                {copy.title}
                <span className="text-sm font-normal text-muted-foreground">
                  {record.type} record
                </span>
              </CardTitle>
              <CardDescription>{copy.why}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <CopyField label={`${copy.title} record name`} value={record.name} />
              <CopyField
                label={`${copy.title} record value`}
                value={record.value}
                multiline={record.purpose === "dkim"}
              />
              {copy.note && (
                <p className="text-sm text-muted-foreground sm:col-span-2">{copy.note}</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {canManage(role) && (
        <div>
          <DeleteDomainButton slug={slug} id={domain.id} name={domain.domain} />
        </div>
      )}
    </div>
  );
}
