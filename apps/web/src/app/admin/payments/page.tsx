import { listPlans } from "@sendcoop/db";
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
import { appUrl } from "@/lib/app-url";
import { formatMoney } from "@/lib/money";
import { TestStripeButton } from "./test-button";

export const metadata: Metadata = { title: "Payment gateway" };

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.created",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
];

/** Stripe: whether it's connected, what to set up there, and which plans can be bought. */
export default async function PaymentsPage() {
  const plans = await listPlans({ includeHidden: true });
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const mode = key.startsWith("sk_live_") ? "live" : key ? "test" : null;
  const webhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const webhookUrl = `${appUrl()}/api/webhooks/stripe`;
  const paid = plans.filter((p) => p.priceCents > 0 && !p.archived);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[22px] font-semibold">Payment gateway</h1>
        <p className="text-sm text-muted-foreground">
          Sendcoop bills through Stripe: Checkout to subscribe, the customer portal to change cards
          and cancel, and webhooks to keep plans in step.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                Stripe
                {mode === "live" && <Badge variant="secondary">Live</Badge>}
                {mode === "test" && <Badge variant="outline">Test mode</Badge>}
                {!mode && <Badge variant="destructive">Not connected</Badge>}
              </h2>
            </CardTitle>
            <CardDescription>
              {mode
                ? "Set with STRIPE_SECRET_KEY on the server."
                : "Set STRIPE_SECRET_KEY on the server, then restart, to take payments. Until then everyone keeps the plan they're on."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid gap-2">
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-muted-foreground">Secret key</dt>
                <dd>{mode ? `${key.slice(0, 8)}…` : "Not set"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-muted-foreground">Webhook signing secret</dt>
                <dd>{webhookSecret ? "Set" : "Not set (STRIPE_WEBHOOK_SECRET)"}</dd>
              </div>
            </dl>
            {mode && <TestStripeButton />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Webhook</h2>
            </CardTitle>
            <CardDescription>
              In Stripe: Developers &gt; Webhooks &gt; Add endpoint. Then copy its signing secret
              into STRIPE_WEBHOOK_SECRET.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid gap-1">
              <span className="text-muted-foreground">Endpoint URL</span>
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                {webhookUrl}
              </code>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Events to send</span>
              <ul className="flex flex-wrap gap-1">
                {WEBHOOK_EVENTS.map((e) => (
                  <li key={e}>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{e}</code>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Paid plans</h2>
          </CardTitle>
          <CardDescription>
            Each needs the id of a monthly price in Stripe (Product catalog), or customers
            can&apos;t choose it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Paid plans">
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Stripe price</TableHead>
                <TableHead>
                  <span className="sr-only">Edit</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paid.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(p.priceCents / 100, p.currency)}
                  </TableCell>
                  <TableCell>
                    {p.stripePriceId ? (
                      <code className="font-mono text-xs">{p.stripePriceId}</code>
                    ) : (
                      <Badge variant="destructive">Missing</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/plans/${p.id}`} className="text-sm hover:underline">
                      Edit plan
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
