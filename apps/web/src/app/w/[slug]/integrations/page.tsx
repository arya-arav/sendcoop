import { getUtmcapConnection } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { UtmcapCard } from "./utmcap-card";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const connection = await getUtmcapConnection(workspace.id);
  const others = [
    {
      name: "Affiliate networks",
      detail: "Postback URLs for ClickBank, Digistore24, Impact and more",
    },
    { name: "Shopify and WooCommerce", detail: "Orders and refunds from your store" },
    { name: "Website pixel and API", detail: "Sales from your own site or server" },
    { name: "Lead forms", detail: "Leads and their status from form tools and CRMs" },
  ];

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Where conversions come from, so each email gets credit for what it earned.
        </p>
      </div>
      <UtmcapCard
        slug={slug}
        editable={canManage(role)}
        connection={
          connection && {
            sourceName: connection.sourceName,
            sourceId: connection.sourceId,
            connectedAt: connection.connectedAt,
          }
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((o) => (
          <Link key={o.name} href={`/w/${slug}/settings/tracking`} className="rounded-xl">
            <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{o.name}</CardTitle>
                <CardDescription>{o.detail}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
