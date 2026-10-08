import {
  countSubscribers,
  dashboardSummary,
  getReportingCurrency,
  listCampaigns,
  listSendingDomains,
  networkName,
} from "@sendcoop/db";
import { CircleCheck, Circle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { requireMemberWorkspace } from "@/lib/workspace";
import { RevenueChart } from "./revenue-chart";

const count = (n: number) => n.toLocaleString("en");
const DAYS = 30;

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireMemberWorkspace(slug);
  const [summary, currency, subscriberCount, domains, campaigns] = await Promise.all([
    dashboardSummary(workspace.id, DAYS),
    getReportingCurrency(workspace.id),
    countSubscribers(workspace.id),
    listSendingDomains(workspace.id),
    listCampaigns(workspace.id),
  ]);
  const money = (n: number) => formatMoney(n, currency);
  const { totals } = summary;
  const stats = [
    { label: "Revenue", value: money(totals.revenue), detail: `Last ${DAYS} days` },
    { label: "Conversions", value: count(totals.conversions), detail: "Approved sales and leads" },
    {
      label: "Earnings per click",
      value: money(totals.epc),
      detail: `${count(totals.clicks)} people clicked`,
    },
    {
      label: "Subscribers",
      value: count(subscriberCount),
      detail: `${count(totals.sent)} emails sent`,
    },
  ];
  const steps = [
    { title: "Add your contacts", done: subscriberCount > 0, href: `/w/${slug}/contacts/import` },
    {
      title: "Verify a sending domain",
      done: domains.some((d) => d.status === "verified"),
      href: `/w/${slug}/settings/domains`,
    },
    {
      title: "Send your first campaign",
      done: campaigns.some((c) => c.startedAt !== null),
      href: `/w/${slug}/campaigns`,
    },
    {
      title: "Track a conversion",
      done: summary.series.some((d) => d.conversions > 0) || totals.conversions > 0,
      href: `/w/${slug}/settings/tracking`,
    },
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome, {user.name.split(" ")[0]}.</p>
      </div>

      <section aria-label="Last 30 days" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{stat.detail}</CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Revenue per day</h2>
          </CardTitle>
          <CardDescription>
            Last {DAYS} days, in {currency}.{" "}
            <Link href={`/w/${slug}/revenue`} className="underline underline-offset-4">
              Full report
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart series={summary.series} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Top campaigns</h2>
            </CardTitle>
            <CardDescription>By revenue in the last {DAYS} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaign has earned yet.</p>
            ) : (
              <ol aria-label="Top campaigns" className="grid gap-3">
                {summary.campaigns.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <Link
                        href={`/w/${slug}/campaigns/${c.id}`}
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {count(c.conversions)} conversions · {count(c.sent)} sent
                      </span>
                    </div>
                    <span className="font-medium tabular-nums">{money(c.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Top offers</h2>
            </CardTitle>
            <CardDescription>The links people bought through.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales through a link yet.</p>
            ) : (
              <ol aria-label="Top offers" className="grid gap-3">
                {summary.offers.map((o) => (
                  <li key={o.url} className="flex items-baseline justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <span className="block truncate font-medium" title={o.url}>
                        {o.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {o.networkId ? `${networkName(o.networkId)} · ` : ""}
                        {count(o.conversions)} sales · {count(o.clicks)} clicks ·{" "}
                        {money(o.clicks > 0 ? o.revenue / o.clicks : 0)} per click
                      </span>
                    </div>
                    <span className="font-medium tabular-nums">{money(o.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {steps.some((s) => !s.done) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Getting started</h2>
            </CardTitle>
          </CardHeader>
          <ul className="divide-y border-t">
            {steps.map((step) => (
              <li key={step.title} className="flex items-center gap-3 px-6 py-3 text-sm">
                {step.done ? (
                  <CircleCheck className="size-4 text-muted-foreground" aria-label="Done" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-label="To do" />
                )}
                {step.done ? (
                  <span className="text-muted-foreground line-through">{step.title}</span>
                ) : (
                  <Link href={step.href} className="font-medium underline-offset-4 hover:underline">
                    {step.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
