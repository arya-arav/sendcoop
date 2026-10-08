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
import { requireMemberWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Billing" };

const price = (cents: number, currency: string) =>
  cents === 0 ? "Free" : `${formatMoney(cents / 100, currency)} a month`;

export default async function BillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireMemberWorkspace(slug);
  const [current, plans] = await Promise.all([getWorkspacePlan(workspace.id), listPlans()]);

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
            {current.cancelAtPeriodEnd && current.currentPeriodEnd
              ? ` · ends ${current.currentPeriodEnd.toLocaleDateString("en-GB", { dateStyle: "medium" })}`
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
        </CardContent>
      </Card>

      <Table aria-label="Plans">
        <TableHeader>
          <TableRow>
            <TableHead />
            {plans.map((p) => (
              <TableHead key={p.id} className="text-center">
                <span className="block font-semibold text-foreground">{p.name}</span>
                <span className="text-xs">{price(p.priceCents, p.currency)}</span>
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
