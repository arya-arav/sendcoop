import {
  accountQuota,
  customerOverview,
  getAccountPlan,
  getCustomer,
  LIMIT_LABELS,
  listAdminActivity,
  listPlans,
} from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayChart } from "@/components/charts/day-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { CustomerControls } from "./customer-controls";
import { DeleteCustomer, ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Customer" };

const day = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });
const time = (d: Date) =>
  d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const percent = (rate: number) =>
  `${(rate * 100).toLocaleString("en", { maximumFractionDigits: rate < 0.01 ? 2 : 1 })}%`;

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const share = limit === null ? 0 : limit === 0 ? 1 : Math.min(1, used / limit);
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString("en")} of {limit === null ? "unlimited" : limit.toLocaleString("en")}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? used}
        aria-valuenow={used}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={
            share >= 1
              ? "h-full bg-destructive"
              : share >= 0.8
                ? "h-full bg-amber-500"
                : "h-full bg-primary"
          }
          style={{ width: `${Math.max(share * 100, used > 0 && limit !== null ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await getCustomer(customerId);
  if (!customer) notFound();
  const [account, quota, plans, overview, activity] = await Promise.all([
    getAccountPlan(customer.id),
    accountQuota(customer.id),
    listPlans({ includeHidden: true }),
    customerOverview(customer.id),
    listAdminActivity({ targetId: customer.id, limit: 10 }),
  ]);
  const overrides = customer.overrides?.limits ?? {};
  const kpis = [
    ["Subscribers", overview.kpis.subscribers.toLocaleString("en")],
    ["Lists", overview.kpis.lists.toLocaleString("en")],
    ["Campaigns", overview.kpis.campaigns.toLocaleString("en")],
    ["Automations", overview.kpis.automations.toLocaleString("en")],
    ["Revenue tracked (30 days)", formatMoney(overview.kpis.revenue30, "USD")],
  ] as const;
  const p = overview.performance;

  return (
    <div className="grid gap-6">
      <Link href="/admin/customers" className="w-fit text-sm text-muted-foreground hover:underline">
        Customers
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold">
          {customer.email}
          {customer.banned && <Badge variant="destructive">Suspended</Badge>}
          {!customer.emailVerified && <Badge variant="outline">Unverified</Badge>}
          {customer.role === "admin" && <Badge variant="outline">Admin</Badge>}
          <Badge variant="secondary">{account.plan.name}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          {customer.name} · customer since {day(customer.createdAt)}
          {customer.banned && customer.banReason ? ` · suspended: ${customer.banReason}` : ""}
        </p>
      </div>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="grid gap-1 px-5">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-[22px] leading-tight font-semibold tabular-nums">{value}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Plan and usage</h2>
            </CardTitle>
            <CardDescription>
              {account.plan.priceCents === 0
                ? "Free"
                : `${formatMoney(account.plan.priceCents / 100, account.plan.currency)} a month`}
              {account.status !== "free" && account.status !== "active"
                ? ` · ${account.status.replace("_", " ")}`
                : ""}
              {account.currentPeriodEnd
                ? ` · ${account.cancelAtPeriodEnd ? "ends" : "renews"} ${day(account.currentPeriodEnd)}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4" aria-label="Usage">
            {(["subscribers", "sendsPerMonth", "workspaces"] as const).map((key) => (
              <Meter
                key={key}
                label={`${key === "sendsPerMonth" ? "Emails this month" : LIMIT_LABELS[key]}${key in overrides ? " (override)" : ""}`}
                used={quota.usage[key]}
                limit={quota.limits[key]}
              />
            ))}
            {quota.warmup && (
              <p className="text-xs text-muted-foreground">
                New-account warm-up: {quota.warmup.sentToday.toLocaleString("en")} of{" "}
                {quota.warmup.perDay.toLocaleString("en")} today.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {account.stripeCustomerId
                ? `Billed through Stripe (${account.stripeCustomerId}).`
                : "Not billed through Stripe."}
            </p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2>Sending, last 30 days</h2>
            </CardTitle>
            <CardDescription>
              {p.sent.toLocaleString("en")} sent · opens {percent(p.openRate)} · clicks{" "}
              {percent(p.clickRate)} · bounces {percent(p.bounceRate)} · complaints{" "}
              {percent(p.complaintRate)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayChart series={overview.sendsPerDay} label="Emails sent per day" unit="emails" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Workspaces</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <Table aria-label="Workspaces">
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Subscribers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.workspaces.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        {w.name}
                        <span className="block text-xs text-muted-foreground">
                          {w.slug} · since {day(w.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize">{w.role}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.members}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.subscribers.toLocaleString("en")}
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
              <h2>Recent campaigns</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              <Table aria-label="Recent campaigns">
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Opens</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.name}
                        <span className="block text-xs text-muted-foreground">
                          {c.workspace} · {day(c.updatedAt)}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize">{c.status}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.sent.toLocaleString("en")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.opened.toLocaleString("en")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.clicked.toLocaleString("en")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CustomerControls
        customerId={customer.id}
        planId={account.status === "free" ? null : account.plan.id}
        plans={plans.map((x) => ({ id: x.id, name: x.name, archived: x.archived }))}
        overrides={Object.fromEntries(
          Object.entries(overrides).map(([k, v]) => [k, v === null ? "unlimited" : String(v)]),
        )}
        trusted={customer.overrides?.trusted ?? false}
        banned={customer.banned}
        isAdmin={customer.role === "admin"}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <ProfileForm
          customerId={customer.id}
          initial={{
            name: customer.name,
            email: customer.email,
            emailVerified: customer.emailVerified,
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Recent sign-ins</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {overview.sessions.map((s) => (
                  <li key={s.createdAt.toISOString()}>
                    {time(s.createdAt)} UTC
                    {s.impersonated && (
                      <Badge variant="outline" className="ml-2">
                        Admin viewing as them
                      </Badge>
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.ip ?? "unknown IP"} · {s.userAgent ?? "unknown browser"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Admin activity</h2>
            </CardTitle>
            <CardDescription>What super-admins did to this account.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm" aria-label="Admin activity">
                {activity.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">
                      {a.action.replace("customer.", "").replace("_", " ")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      by {a.adminEmail ?? "a deleted admin"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {time(a.createdAt)} UTC
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {customer.role !== "admin" && (
        <DeleteCustomer customerId={customer.id} email={customer.email} />
      )}
    </div>
  );
}
