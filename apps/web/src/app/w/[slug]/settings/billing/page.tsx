import {
  FEATURE_LABELS,
  formatLimit,
  getWorkspacePlan,
  LIMIT_LABELS,
  listPlans,
  listUserInvoices,
  nextMonthStart,
  workspaceQuota,
  type PlanFeatures,
  type PlanLimits,
} from "@sendcoop/db";
import { ArrowLeft, Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
import { getStripe, syncSubscription } from "@/lib/stripe";
import { requireMemberWorkspace } from "@/lib/workspace";
import { ChoosePlanButton, ManageBillingButton } from "./billing-buttons";

export const metadata: Metadata = { title: "Billing" };

/** Used of a limit, as a bar; amber from 80%, red when reached. */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const share = limit === null ? 0 : limit === 0 ? 1 : Math.min(1, used / limit);
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString("en")} of {formatLimit(limit)}
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
          style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

const price = (cents: number, currency: string) =>
  cents === 0 ? "Free" : `${formatMoney(cents / 100, currency)} a month`;

/** Back from Checkout: applies the new subscription now, rather than waiting for the webhook. */
async function syncCheckout(sessionId: string, customerId: string | null) {
  const stripe = getStripe();
  if (!stripe || !customerId || !/^cs_w+$/.test(sessionId)) return;
  const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
  const customer = typeof session?.customer === "string" ? session.customer : session?.customer?.id;
  if (!session?.subscription || customer !== customerId) return;
  const id =
    typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  await syncSubscription(await stripe.subscriptions.retrieve(id));
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug } = await params;
  const { session_id } = await searchParams;
  const { user, workspace } = await requireMemberWorkspace(slug);
  if (session_id) {
    const before = await getWorkspacePlan(workspace.id);
    if (before.ownerId === user.id) await syncCheckout(session_id, before.stripeCustomerId);
  }
  const [current, plans, quota] = await Promise.all([
    getWorkspacePlan(workspace.id),
    listPlans(),
    workspaceQuota(workspace.id),
  ]);
  const isOwner = current.ownerId === user.id;
  // Only the account's owner sees what it paid.
  const invoices = isOwner ? await listUserInvoices(user.id) : [];
  const billing = Boolean(getStripe());
  const paying = Boolean(current.stripeSubscriptionId);
  const day = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/settings`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      <div>
        <h1 className="text-[22px] font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Plans are per account: every workspace you own shares your plan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Your plan</CardDescription>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <h2>{current.plan.name}</h2>
            {current.status === "past_due" && <Badge variant="destructive">Payment failed</Badge>}
          </CardTitle>
          <CardDescription>
            {price(current.plan.priceCents, current.plan.currency)}
            {current.currentPeriodEnd && paying
              ? current.cancelAtPeriodEnd
                ? ` · ends ${day(current.currentPeriodEnd)}`
                : ` · renews ${day(current.currentPeriodEnd)}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3" aria-label="Usage">
            {(["subscribers", "sendsPerMonth", "workspaces"] as const).map((key) => (
              <UsageMeter
                key={key}
                label={key === "sendsPerMonth" ? "Emails this month" : LIMIT_LABELS[key]}
                used={quota.usage[key]}
                limit={current.limits[key]}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Emails start again on {day(nextMonthStart())}. Team members per workspace:{" "}
            {formatLimit(current.limits.teamMembers)}.
          </p>
          {isOwner && billing && current.stripeCustomerId && (
            <div className="mt-4">
              <ManageBillingButton slug={slug} />
            </div>
          )}
          {!isOwner && (
            <p className="mt-4 text-sm text-muted-foreground">
              The workspace&apos;s owner manages its plan.
            </p>
          )}
        </CardContent>
      </Card>

      <Table aria-label="Plans">
        <TableHeader>
          <TableRow>
            <TableHead />
            {plans.map((p) => (
              <TableHead key={p.id} className="text-center">
                <span className="block font-semibold text-foreground">{p.name}</span>
                <span className="block text-xs">{price(p.priceCents, p.currency)}</span>
                <span className="mt-2 flex min-h-8 items-center justify-center">
                  {p.id === current.plan.id ? (
                    <Badge variant="secondary">Your plan</Badge>
                  ) : isOwner && billing && p.stripePriceId ? (
                    <ChoosePlanButton slug={slug} planId={p.id} planName={p.name} paying={paying} />
                  ) : isOwner && paying && p.priceCents === 0 ? (
                    <span className="text-xs font-normal">Cancel under Manage billing</span>
                  ) : null}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((key) => (
            <TableRow key={key}>
              <TableCell className="text-muted-foreground">{LIMIT_LABELS[key]}</TableCell>
              {plans.map((p) => (
                <TableCell key={p.id} className="text-center tabular-nums">
                  {formatLimit(p.limits[key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((key) => (
            <TableRow key={key}>
              <TableCell className="text-muted-foreground">{FEATURE_LABELS[key]}</TableCell>
              {plans.map((p) => (
                <TableCell key={p.id} className="text-center">
                  {p.features[key] ? (
                    <Check className="mx-auto size-4" aria-label="Included" />
                  ) : (
                    <Minus
                      className="mx-auto size-4 text-muted-foreground"
                      aria-label="Not included"
                    />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {isOwner && invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Invoices</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Invoices">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Links</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      {i.number ?? "Draft"}
                      <span className="block text-xs text-muted-foreground">{i.description}</span>
                    </TableCell>
                    <TableCell>{day(i.paidAt ?? i.createdAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(
                        (i.status === "paid" ? i.amountPaidCents : i.amountDueCents) / 100,
                        i.currency,
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{i.status}</TableCell>
                    <TableCell className="text-right">
                      {i.hostedUrl && (
                        <a
                          href={i.hostedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          View
                        </a>
                      )}
                      {i.pdfUrl && (
                        <a
                          href={i.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-3 hover:underline"
                        >
                          PDF
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
