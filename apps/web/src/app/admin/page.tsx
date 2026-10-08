import { adminDashboard, listPlans } from "@sendcoop/db";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DayChart } from "@/components/charts/day-chart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/admin";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

const percent = (rate: number) =>
  `${(rate * 100).toLocaleString("en", { maximumFractionDigits: rate < 0.01 ? 2 : 1 })}%`;
const day = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-1 px-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-[26px] leading-tight font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const { user } = await requireSuperAdmin();
  const [d, plans] = await Promise.all([adminDashboard(), listPlans({ includeHidden: true })]);

  // Accounts without a live subscription are on the free plan.
  const paid = d.plans.filter((p) => p.name !== plans.find((x) => x.key === "free")?.name);
  const freeName = plans.find((x) => x.key === "free")?.name ?? "Free";
  const distribution = [
    {
      name: freeName,
      accounts: Math.max(0, d.customers.total - paid.reduce((s, p) => s + p.accounts, 0)),
    },
    ...paid,
  ];
  const most = Math.max(1, ...distribution.map((p) => p.accounts));

  const checklist = [
    {
      done: plans.some((p) => p.priceCents > 0 && p.stripePriceId),
      label: "Give paid plans their Stripe price",
      href: "/admin/plans",
    },
    {
      done: Boolean(process.env.STRIPE_SECRET_KEY),
      label: "Connect Stripe (STRIPE_SECRET_KEY)",
      href: "/help",
    },
    {
      done:
        Boolean(process.env.SMTP_HOST) &&
        !/sendcoop\.(local|test)/.test(process.env.MAIL_FROM ?? ""),
      label: "Send system emails from your own domain (MAIL_FROM)",
      href: "/help",
    },
    {
      done: Boolean(process.env.SENTRY_DSN),
      label: "Report errors to Sentry (SENTRY_DSN)",
      href: "/help",
    },
    { done: d.customers.total > 0, label: "Welcome your first customer", href: "/admin/customers" },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Welcome back, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            How Sendcoop is doing, across every account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Quick actions">
          <Link
            href="/admin/customers"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Find a customer
          </Link>
          <Link
            href="/admin/plans/new"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Create a plan
          </Link>
        </div>
      </div>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Customers"
          value={d.customers.total.toLocaleString("en")}
          note={`${d.customers.newThisMonth} new this month · ${d.customers.suspended} suspended`}
        />
        <Stat
          label="Paying subscriptions"
          value={d.subscriptions.paying.toLocaleString("en")}
          note={`${formatMoney(d.subscriptions.mrrCents / 100, "USD")} a month · ${d.subscriptions.endingSoon} ending within 7 days`}
        />
        <Stat
          label="Emails sent"
          value={d.sending.sent30.toLocaleString("en")}
          note="Last 30 days"
        />
        <Stat
          label="Opens · clicks"
          value={`${percent(d.sending.openRate)} · ${percent(d.sending.clickRate)}`}
          note={`Bounces ${percent(d.sending.bounceRate)} · complaints ${percent(d.sending.complaintRate)}`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Emails sent per day</h2>
            </CardTitle>
            <CardDescription>Last 30 days, every account.</CardDescription>
          </CardHeader>
          <CardContent>
            <DayChart series={d.sendsPerDay} label="Emails sent per day" unit="emails" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>New customers per day</h2>
            </CardTitle>
            <CardDescription>Last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <DayChart series={d.signupsPerDay} label="New customers per day" unit="customers" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Accounts by plan</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3" aria-label="Accounts by plan">
              {distribution.map((p) => (
                <li key={p.name} className="grid gap-1 text-sm">
                  <span className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="tabular-nums">{p.accounts.toLocaleString("en")}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(p.accounts / most) * 100}%`,
                        background: "var(--viz-series-1)",
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Getting started</h2>
            </CardTitle>
            <CardDescription>
              {checklist.filter((c) => c.done).length} of {checklist.length} done
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  {c.done ? (
                    <CircleCheck className="size-4 text-green-600" aria-label="Done" />
                  ) : (
                    <CircleAlert className="size-4 text-muted-foreground" aria-label="To do" />
                  )}
                  {c.done ? (
                    <span className="text-muted-foreground line-through">{c.label}</span>
                  ) : (
                    <Link href={c.href} className="underline-offset-4 hover:underline">
                      {c.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Platform</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ["Plans", d.counts.plans],
                  ["Workspaces", d.counts.workspaces],
                  ["Subscribers", d.counts.subscribers],
                  ["Campaigns", d.counts.campaigns],
                  ["Automations", d.counts.automations],
                  ["Admins", d.counts.admins],
                ] as const
              ).map(([label, n]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{n.toLocaleString("en")}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>
              <h2>Newest customers</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Newest customers">
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.recentCustomers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.email}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {day(c.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>{c.plan}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Latest subscriptions</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.recentSubscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody pays yet.</p>
            ) : (
              <Table aria-label="Latest subscriptions">
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.recentSubscriptions.map((s) => (
                    <TableRow key={s.userId}>
                      <TableCell>
                        <Link
                          href={`/admin/customers/${s.userId}`}
                          className="font-medium hover:underline"
                        >
                          {s.email}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {day(s.updatedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s.plan}{" "}
                        {s.status !== "active" && (
                          <Badge variant={s.status === "past_due" ? "destructive" : "outline"}>
                            {s.status.replace("_", " ")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Busiest workspaces</h2>
            </CardTitle>
            <CardDescription>Emails sent, last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.topWorkspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
            ) : (
              <Table aria-label="Busiest workspaces">
                <TableBody>
                  {d.topWorkspaces.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        {w.name}
                        <span className="block text-xs text-muted-foreground">{w.slug}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.sent30.toLocaleString("en")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
