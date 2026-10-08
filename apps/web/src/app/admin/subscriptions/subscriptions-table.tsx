"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { cancelNowAction, setCancelAtPeriodEndAction } from "./actions";

type Row = {
  userId: string;
  email: string;
  plan: string;
  priceCents: number;
  currency: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  updatedAt: Date;
};

type Result = { ok: true; message?: string } | { ok: false; error: string };

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> =
  {
    active: { label: "Active", variant: "secondary" },
    trialing: { label: "Trialing", variant: "outline" },
    past_due: { label: "Payment failed", variant: "destructive" },
    canceled: { label: "Canceled", variant: "outline" },
  };

const day = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "unknown";

export function SubscriptionsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { text: result.message ?? "Done.", error: false }
          : { text: result.error, error: true },
      );
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </p>
      )}
      <Table aria-label="Subscriptions">
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Billing</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No subscriptions here.
              </TableCell>
            </TableRow>
          )}
          {rows.map((s) => {
            const status = STATUS[s.status] ?? { label: s.status, variant: "outline" as const };
            const live = s.status !== "canceled";
            return (
              <TableRow key={s.userId}>
                <TableCell>
                  <Link
                    href={`/admin/customers/${s.userId}`}
                    className="font-medium hover:underline"
                  >
                    {s.email}
                  </Link>
                </TableCell>
                <TableCell>
                  {s.plan}
                  <span className="block text-xs text-muted-foreground">
                    {formatMoney(s.priceCents / 100, s.currency)} a month
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {live && s.cancelAtPeriodEnd && (
                    <Badge variant="outline" className="ml-1">
                      Ending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {live
                    ? `${s.cancelAtPeriodEnd ? "Ends" : "Renews"} ${day(s.currentPeriodEnd)}`
                    : `Ended · updated ${day(s.updatedAt)}`}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.stripeSubscriptionId ? "Stripe" : "Set by an admin"}
                </TableCell>
                <TableCell>
                  {live && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={pending}
                            aria-label={`Actions for ${s.email}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-52">
                        <DropdownMenuItem
                          onClick={() => router.push(`/admin/customers/${s.userId}`)}
                        >
                          Open customer
                        </DropdownMenuItem>
                        {s.cancelAtPeriodEnd ? (
                          <DropdownMenuItem
                            onClick={() => run(() => setCancelAtPeriodEndAction(s.userId, false))}
                          >
                            Keep it renewing
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => run(() => setCancelAtPeriodEndAction(s.userId, true))}
                          >
                            Cancel at period end
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            const sure = confirm(
                              `Cancel the subscription for ${s.email} now? They go back to the free plan.`,
                            );
                            if (sure) run(() => cancelNowAction(s.userId));
                          }}
                        >
                          Cancel now
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
