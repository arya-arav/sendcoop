import { AFFILIATE_NETWORKS, getAffiliateDomains, getUtmSettings } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { AffiliateDomainsForm } from "./affiliate-domains-form";
import { UtmForm } from "./utm-form";

export const metadata: Metadata = { title: "Tracking settings" };

export default async function TrackingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const [domains, utm] = await Promise.all([
    getAffiliateDomains(workspace.id),
    getUtmSettings(workspace.id),
  ]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Link
        href={`/w/${slug}/settings`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Links in your campaigns are recorded when they&apos;re sent. Affiliate links are marked,
          so reports can show which emails earn money.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Recognized automatically</h2>
          </CardTitle>
          <CardDescription>
            Links from these affiliate networks are marked without any setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {AFFILIATE_NETWORKS.map((n) => (
            <Badge key={n.id} variant="secondary">
              {n.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <AffiliateDomainsForm slug={slug} editable={canManage(role)} initial={domains} />
      <UtmForm slug={slug} editable={canManage(role)} initial={utm} />
    </div>
  );
}
