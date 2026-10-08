import {
  getReportingCurrency,
  getSubscriberProfile,
  subscriberTimeline,
  type TimelineEvent,
} from "@sendcoop/db";
import { formatMoney as money } from "@/lib/money";
import {
  ArrowLeft,
  CircleDollarSign,
  CircleSlash,
  Eye,
  type LucideIcon,
  Mail,
  MailX,
  MousePointerClick,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Subscriber" };

const EVENTS: Record<TimelineEvent["kind"], { icon: LucideIcon; label: string }> = {
  subscribed: { icon: UserPlus, label: "Subscribed" },
  unsubscribed: { icon: CircleSlash, label: "Unsubscribed" },
  sent: { icon: Mail, label: "Sent" },
  opened: { icon: Eye, label: "Opened" },
  clicked: { icon: MousePointerClick, label: "Clicked" },
  converted: { icon: CircleDollarSign, label: "Converted" },
  bounced: { icon: MailX, label: "Bounced" },
  complained: { icon: ShieldAlert, label: "Marked as spam" },
};

const when = (at: number) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(at);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function SubscriberPage({
  params,
}: {
  params: Promise<{ slug: string; subscriberId: string }>;
}) {
  const { slug, subscriberId } = await params;
  const { workspace } = await requireMemberWorkspace(slug);
  const [profile, events, currency] = await Promise.all([
    getSubscriberProfile(workspace.id, subscriberId),
    subscriberTimeline(workspace.id, subscriberId),
    getReportingCurrency(workspace.id),
  ]);
  if (!profile) notFound();
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const { stats } = profile;

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/contacts`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contacts
      </Link>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold">{profile.email}</h1>
          <Badge variant="secondary" className="capitalize">
            {profile.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            name || null,
            `added ${when(profile.createdAt)} UTC`,
            `from ${profile.source}`,
            profile.timezone,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(profile.lists.length > 0 || profile.tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {profile.lists.map((l) => (
              <Badge key={l.id} variant="outline">
                {l.name}
              </Badge>
            ))}
            {profile.tags.map((t) => (
              <Badge key={t} variant="secondary">
                #{t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <section aria-label="Value" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Lifetime value" value={money(stats.lifetimeValue, currency)} />
        <Stat label="Conversions" value={String(stats.conversions)} />
        <Stat label="Emails" value={String(stats.emails)} />
        <Stat label="Opened" value={String(stats.opened)} />
        <Stat label="Clicked" value={String(stats.clicked)} />
      </section>
      {stats.pendingValue > 0 && (
        <p className="-mt-3 text-sm text-muted-foreground">
          Plus {money(stats.pendingValue, currency)} pending (not counted until approved).
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Timeline</h2>
          </CardTitle>
          <CardDescription>
            Newest first. Machine opens and scanner clicks are left out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol aria-label="Timeline" className="grid gap-0">
              {events.map((event, i) => {
                const { icon: Icon, label } = EVENTS[event.kind];
                return (
                  <li
                    key={`${event.kind}${event.at}${i}`}
                    data-kind={event.kind}
                    className="flex gap-3 border-l py-2 pl-4 first:pt-0 last:pb-0"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="grid min-w-0 gap-0.5 text-sm">
                      <p>
                        <span className="font-medium">{label}</span>
                        {event.kind === "converted" && event.value !== null && (
                          <>
                            {" "}
                            {money(event.value, event.currency ?? "USD")}
                            {event.status && (
                              <span className="text-muted-foreground"> · {event.status}</span>
                            )}
                          </>
                        )}
                        {event.campaignId && (
                          <>
                            {" · "}
                            <Link
                              href={`/w/${slug}/campaigns/${event.campaignId}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {event.campaignName ?? "Deleted campaign"}
                            </Link>
                          </>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {when(event.at)} UTC
                        {event.detail && ` · ${event.detail}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
