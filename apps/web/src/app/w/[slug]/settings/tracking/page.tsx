import {
  AFFILIATE_NETWORKS,
  getAffiliateDomains,
  getIntegrationConfig,
  getIntegrationSecret,
  getUtmSettings,
  listRecentConversions,
  POSTBACK_TEMPLATES,
  postbackUrl as networkPostbackUrl,
} from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { ApiCard } from "./api-card";
import { AffiliateDomainsForm } from "./affiliate-domains-form";
import { PixelCard } from "./pixel-card";
import { PostbackCard } from "./postback-card";
import { RecentConversions } from "./recent-conversions";
import { ShopifyCard } from "./shopify-card";
import { UtmForm } from "./utm-form";

export const metadata: Metadata = { title: "Tracking settings" };

export default async function TrackingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const editable = canManage(role);
  const [
    domains,
    utm,
    postbackKey,
    postbackConfig,
    recent,
    pixelKey,
    apiSecret,
    shopifyKey,
    shopifyConfig,
  ] = await Promise.all([
    getAffiliateDomains(workspace.id),
    getUtmSettings(workspace.id),
    // Members don't see the key: it lets anyone report sales.
    editable ? getIntegrationSecret(workspace.id, "postback") : null,
    getIntegrationConfig(workspace.id, "postback"),
    listRecentConversions(workspace.id),
    // Public: it is in every page of the store.
    getIntegrationSecret(workspace.id, "pixel"),
    editable ? getIntegrationSecret(workspace.id, "api") : null,
    editable ? getIntegrationSecret(workspace.id, "shopify") : null,
    getIntegrationConfig(workspace.id, "shopify"),
  ]);
  const tracking = (process.env.TRACKING_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const postbackUrl = postbackKey
    ? `${tracking}/pb?key=${postbackKey}&cid={subid}&payout={payout}&txid={txid}`
    : "Only workspace owners and admins can see the postback URL.";
  const networks = postbackKey
    ? POSTBACK_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        url: t.macros
          ? networkPostbackUrl(tracking, postbackKey, { id: t.id, macros: t.macros })
          : null,
        instructions: t.instructions,
      }))
    : [];

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
      <PostbackCard
        slug={slug}
        editable={editable}
        postbackUrl={postbackUrl}
        networks={networks}
        trackingUrl={tracking}
        postbackKey={postbackKey}
        allowedIps={
          Array.isArray(postbackConfig.allowedIps) ? postbackConfig.allowedIps.map(String) : []
        }
      />
      <PixelCard trackingUrl={tracking} pixelKey={pixelKey} />
      <ApiCard slug={slug} trackingUrl={tracking} workspaceId={workspace.id} secret={apiSecret} />
      <ShopifyCard
        slug={slug}
        webhookUrl={shopifyKey ? `${tracking}/wh/shopify/${shopifyKey}` : null}
        connected={Boolean(shopifyConfig.signingSecret)}
      />
      <RecentConversions slug={slug} editable={editable} conversions={recent} />
    </div>
  );
}
