"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReconcileRow } from "@/lib/utmcap-reconcile";
import { reconcileUtmcapAction } from "./actions";

const money = (n: number) =>
  n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** UTMCAP's report for the Sendcoop source next to what Sendcoop recorded, per email campaign. */
export function Reconcile({ slug }: { slug: string }) {
  const [rows, setRows] = useState<ReconcileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Check the numbers</h3>
          <p className="text-xs text-muted-foreground">
            UTMCAP&apos;s report for the Sendcoop source (by sub1) next to Sendcoop&apos;s, last 30
            days, approved conversions, in UTMCAP&apos;s currency.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await reconcileUtmcapAction(slug);
              if (!result.ok) setError(result.error);
              else setRows(result.rows);
            })
          }
        >
          {pending ? "Comparing…" : rows ? "Compare again" : "Compare with UTMCAP"}
        </Button>
      </div>
      <FormError message={error} />
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No UTMCAP conversions in the last 30 days.</p>
      )}
      {rows && rows.length > 0 && (
        <Table aria-label="UTMCAP reconciliation">
          <TableHeader>
            <TableRow>
              <TableHead>Email campaign (sub1)</TableHead>
              <TableHead className="text-right">UTMCAP</TableHead>
              <TableHead className="text-right">Sendcoop</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell>
                  {r.campaignId ? (
                    <Link
                      href={`/w/${slug}/campaigns/${r.campaignId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {r.campaignName}
                    </Link>
                  ) : (
                    r.key
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.utmcap.conversions} · {money(r.utmcap.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.sendcoop.conversions} · {money(r.sendcoop.revenue)}
                </TableCell>
                <TableCell>
                  {r.matches ? (
                    <span className="flex items-center gap-1 text-sm">
                      <CircleCheck className="size-4" aria-hidden />
                      Matches
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm">
                      <CircleAlert className="size-4" aria-hidden />
                      Differs
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows?.some((r) => !r.matches) && (
        <p className="text-xs text-muted-foreground">
          Differences are usually conversions still pending on one side, a postback UTMCAP
          couldn&apos;t deliver (see its webhook log), or a campaign renamed after sending.
        </p>
      )}
    </div>
  );
}
