import { formatLimit, listPlans } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const plans = await listPlans({ includeHidden: true });
  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground">
            What each plan costs and allows. Customers see public plans on their billing page.
          </p>
        </div>
        <Link href="/admin/plans/new" className={buttonVariants()}>
          New plan
        </Link>
      </div>
      <Table aria-label="Plans">
        <TableHeader>
          <TableRow>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Subscribers</TableHead>
            <TableHead className="text-right">Emails a month</TableHead>
            <TableHead className="text-right">Workspaces</TableHead>
            <TableHead>Stripe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link
                  href={`/admin/plans/${p.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">{p.key}</span>
                {!p.public && (
                  <Badge variant="outline" className="ml-2">
                    Hidden
                  </Badge>
                )}
                {p.archived && (
                  <Badge variant="outline" className="ml-2">
                    Archived
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.priceCents === 0 ? "Free" : `${formatMoney(p.priceCents / 100, p.currency)}/mo`}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatLimit(p.limits.subscribers)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatLimit(p.limits.sendsPerMonth)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatLimit(p.limits.workspaces)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.stripePriceId ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
