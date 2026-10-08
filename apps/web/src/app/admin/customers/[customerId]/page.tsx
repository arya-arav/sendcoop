import { accountQuota, getAccountPlan, getCustomer, LIMIT_LABELS, listPlans } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { CustomerControls } from "./customer-controls";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await getCustomer(customerId);
  if (!customer) notFound();
  const [account, quota, plans] = await Promise.all([
    getAccountPlan(customer.id),
    accountQuota(customer.id),
    listPlans({ includeHidden: true }),
  ]);
  const overrides = customer.overrides?.limits ?? {};

  return (
    <div className="grid gap-6">
      <Link href="/admin/customers" className="w-fit text-sm text-muted-foreground hover:underline">
        Customers
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {customer.email}
          {customer.banned && <Badge variant="destructive">Suspended</Badge>}
          {customer.role === "admin" && <Badge variant="outline">Admin</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {customer.name} · joined{" "}
          {customer.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}
          {customer.banned && customer.banReason ? ` · suspended: ${customer.banReason}` : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Plan</CardDescription>
            <CardTitle>
              <h2>
                {account.plan.name} ·{" "}
                {account.plan.priceCents === 0
                  ? "free"
                  : `${formatMoney(account.plan.priceCents / 100, account.plan.currency)} a month`}
              </h2>
            </CardTitle>
            <CardDescription>
              {account.stripeCustomerId
                ? `Stripe customer ${account.stripeCustomerId}: Stripe's next update replaces a plan set here.`
                : "Not billed through Stripe."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-1 text-sm" aria-label="Usage">
              {(["subscribers", "sendsPerMonth", "workspaces"] as const).map((key) => (
                <div key={key} className="flex justify-between gap-4 border-b py-1">
                  <dt className="text-muted-foreground">{LIMIT_LABELS[key]}</dt>
                  <dd className="tabular-nums">
                    {quota.usage[key].toLocaleString("en")} of{" "}
                    {quota.limits[key] === null
                      ? "unlimited"
                      : quota.limits[key]!.toLocaleString("en")}
                    {key in overrides && " (override)"}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Workspaces</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {customer.workspaces.length === 0 && (
                <li className="text-muted-foreground">None yet.</li>
              )}
              {customer.workspaces.map((w) => (
                <li key={w.id}>
                  {w.name}{" "}
                  <span className="text-muted-foreground">
                    ({w.slug}, {w.role})
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <CustomerControls
        customerId={customer.id}
        planId={account.status === "free" ? null : account.plan.id}
        plans={plans.map((p) => ({ id: p.id, name: p.name, archived: p.archived }))}
        overrides={Object.fromEntries(
          Object.entries(overrides).map(([k, v]) => [k, v === null ? "unlimited" : String(v)]),
        )}
        banned={customer.banned}
        isAdmin={customer.role === "admin"}
      />
    </div>
  );
}
