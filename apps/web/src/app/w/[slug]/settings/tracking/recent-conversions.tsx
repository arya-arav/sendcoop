"use client";

import type { RecentConversion } from "@sendcoop/db";
import { RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sendTestPostbackAction } from "./actions";

const SOURCES: Record<RecentConversion["source"], string> = {
  postback: "Postback",
  pixel: "Pixel",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  lead: "Lead form",
  utmcap: "UTMCAP",
  api: "API",
};

function money(value: number, currency: string) {
  try {
    return value.toLocaleString("en", { style: "currency", currency });
  } catch {
    // Networks sometimes send codes that aren't currencies.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** The latest conversions to arrive, and a test postback to check the setup end to end. */
export function RecentConversions({
  slug,
  editable,
  conversions,
}: {
  slug: string;
  editable: boolean;
  conversions: RecentConversion[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendTest() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestPostbackAction(slug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHighlight(result.txid);
      setMessage(`Test conversion recorded in ${result.ms} ms.`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Recent conversions</h2>
        </CardTitle>
        <CardDescription>
          The latest sales and leads to arrive, from any source. After setting up a network, send
          its test postback and check that it shows up here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {editable && (
            <Button disabled={pending} onClick={sendTest}>
              <Send />
              {pending ? "Sending…" : "Send a test conversion"}
            </Button>
          )}
          <Button variant="outline" disabled={pending} onClick={() => router.refresh()}>
            <RefreshCw />
            Check again
          </Button>
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
        </div>
        <FormError message={error} />

        {conversions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversions yet.</p>
        ) : (
          <Table aria-label="Recent conversions">
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Credited to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversions.map((c) => (
                <TableRow
                  key={c.id}
                  data-txid={c.txid ?? undefined}
                  className={c.txid && c.txid === highlight ? "bg-muted" : undefined}
                >
                  <TableCell suppressHydrationWarning>
                    {new Date(c.at).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {SOURCES[c.source]}
                      {c.network && c.network !== "test" && (
                        <span className="text-muted-foreground">· {c.network}</span>
                      )}
                      {c.test && <Badge variant="outline">Test</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{money(c.value, c.currency)}</TableCell>
                  <TableCell className="capitalize">{c.status}</TableCell>
                  <TableCell>
                    {c.campaignId ? (
                      <Link
                        href={`/w/${slug}/campaigns/${c.campaignId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {c.campaignName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">No email</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
