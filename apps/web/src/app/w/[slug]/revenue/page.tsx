import {
  countUnconvertedConversions,
  getReportingCurrency,
  type RevenueGrouping,
  type RevenueMetrics,
  revenueReport,
} from "@sendcoop/db";
import { formatMoney } from "@/lib/money";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireMemberWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Revenue" };

const PERIODS = { "7": "7 days", "30": "30 days", "90": "90 days", all: "All time" } as const;
const GROUPINGS: Record<RevenueGrouping, string> = {
  campaign: "Campaigns",
  link: "Links",
  audience: "Lists & segments",
};
type Period = keyof typeof PERIODS;

/** The last N days up to now (a minute ahead, for what is arriving right now). */
function periodRange(period: Period) {
  const now = Date.now();
  return {
    from: period === "all" ? null : new Date(now - Number(period) * 86_400_000),
    to: new Date(now + 60_000),
  };
}

const pct = (n: number) => `${(n * 100).toLocaleString("en", { maximumFractionDigits: 1 })}%`;
const count = (n: number) => n.toLocaleString("en");

function Tile({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {detail && <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>}
    </Card>
  );
}

function MetricCells({
  m,
  showSent,
  currency,
}: {
  m: RevenueMetrics;
  showSent: boolean;
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <>
      {showSent && <TableCell className="text-right tabular-nums">{count(m.sent)}</TableCell>}
      <TableCell className="text-right tabular-nums">{count(m.clicks)}</TableCell>
      <TableCell className="text-right tabular-nums">{count(m.conversions)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(m.conversionRate)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{money(m.revenue)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(m.epc)}</TableCell>
      {showSent && (
        <TableCell className="text-right tabular-nums">{money(m.revenuePer1k)}</TableCell>
      )}
      {showSent && (
        <TableCell className="text-right tabular-nums">
          {m.roi === null ? "—" : pct(m.roi)}
        </TableCell>
      )}
    </>
  );
}

export default async function RevenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ by?: string; period?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { workspace } = await requireMemberWorkspace(slug);
  const grouping: RevenueGrouping =
    query.by === "link" || query.by === "audience" ? query.by : "campaign";
  const period: Period = query.period && query.period in PERIODS ? (query.period as Period) : "30";
  const [{ totals, rows }, currency, unconverted] = await Promise.all([
    revenueReport(workspace.id, grouping, periodRange(period)),
    getReportingCurrency(workspace.id),
    countUnconvertedConversions(workspace.id),
  ]);
  const money = (n: number) => formatMoney(n, currency);
  const showSent = grouping !== "link";
  const href = (over: { by?: string; period?: string }) =>
    `/w/${slug}/revenue?${new URLSearchParams({ by: grouping, period, ...over })}`;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
          <p className="text-sm text-muted-foreground">
            Approved sales and leads credited to your emails, in {currency}. Clicks are people, not
            scanners.
          </p>
          {unconverted > 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              {unconverted} conversions are in a currency without an exchange rate yet and
              aren&apos;t counted until one arrives.
            </p>
          )}
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-lg border p-1">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link
              key={p}
              href={href({ period: p })}
              aria-current={p === period ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                p === period
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIODS[p]}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          title="Revenue"
          value={money(totals.revenue)}
          detail={`${count(totals.conversions)} conversions`}
        />
        <Tile
          title="Earnings per click"
          value={money(totals.epc)}
          detail={`${count(totals.clicks)} clicks`}
        />
        <Tile
          title="Revenue per 1,000 sent"
          value={money(totals.revenuePer1k)}
          detail={`${count(totals.sent)} emails sent`}
        />
        <Tile
          title="Return on cost"
          value={totals.roi === null ? "—" : pct(totals.roi)}
          detail={
            totals.cost === null
              ? "Add a cost to a campaign to see it."
              : `On ${money(totals.cost)} of campaign costs`
          }
        />
      </section>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            <h2>By {GROUPINGS[grouping].toLowerCase()}</h2>
          </CardTitle>
          <nav aria-label="Group by" className="flex gap-1 rounded-lg border p-1">
            {(Object.keys(GROUPINGS) as RevenueGrouping[]).map((g) => (
              <Link
                key={g}
                href={href({ by: g })}
                aria-current={g === grouping ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm",
                  g === grouping
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {GROUPINGS[g]}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent or sold in this period.</p>
          ) : (
            <Table aria-label={`Revenue by ${GROUPINGS[grouping].toLowerCase()}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>{grouping === "link" ? "Link" : "Name"}</TableHead>
                  {showSent && <TableHead className="text-right">Sent</TableHead>}
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Conversions</TableHead>
                  <TableHead className="text-right">Conv. rate</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">EPC</TableHead>
                  {showSent && <TableHead className="text-right">Per 1k sent</TableHead>}
                  {showSent && <TableHead className="text-right">ROI</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.kind ?? ""}${row.id ?? "none"}`}>
                    <TableCell className="max-w-80">
                      {grouping === "campaign" && row.id ? (
                        <Link
                          href={`/w/${slug}/campaigns/${row.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className={cn("block truncate", !row.id && "text-muted-foreground")}>
                          {row.name}
                        </span>
                      )}
                      {grouping === "link" && row.campaignName && (
                        <span className="block text-xs text-muted-foreground">
                          {row.campaignName}
                        </span>
                      )}
                      {row.kind && row.kind !== "everyone" && (
                        <span className="block text-xs text-muted-foreground capitalize">
                          {row.kind}
                        </span>
                      )}
                    </TableCell>
                    <MetricCells m={row} showSent={showSent} currency={currency} />
                  </TableRow>
                ))}
              </TableBody>
              {grouping !== "audience" && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <MetricCells m={totals} showSent={showSent} currency={currency} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
          {grouping === "audience" && (
            <p className="text-xs text-muted-foreground">
              A campaign sent to several lists or segments counts in each, so these rows don&apos;t
              add up to the totals.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
