import {
  FEATURE_LABELS,
  formatLimit,
  getWorkspacePlan,
  LIMIT_LABELS,
  listPlans,
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
  const [current, plans] = await Promise.all([getWorkspacePlan(workspace.id), listPlans()]);
  const isOwner = current.ownerId === user.id;
  const billing = Boolean(getStripe());
  const paying = Boolean(current.stripeSubscriptionId);
  const day = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <Link
        href={`/w/${slug}/settings`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
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
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((key) => (
              <div key={key} className="flex justify-between gap-4 border-b py-1">
                <dt className="text-muted-foreground">{LIMIT_LABELS[key]}</dt>
                <dd className="tabular-nums">{formatLimit(current.limits[key])}</dd>
              </div>
            ))}
          </dl>
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
    </div>
  );
}
