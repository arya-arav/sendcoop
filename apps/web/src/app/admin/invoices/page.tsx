import { invoiceStats, listInvoicesPage } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Invoices" };

const STATUSES = ["open", "paid", "uncollectible", "void", "draft"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  open: "Open",
  paid: "Paid",
  uncollectible: "Uncollectible",
  void: "Void",
  draft: "Draft",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status) ?? null;
  const q = (params.q ?? "").slice(0, 200);
  const page = Math.max(1, Number(params.page) || 1);
  const [stats, list] = await Promise.all([invoiceStats(), listInvoicesPage({ status, q, page })]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const change =
    stats.paidPrevious30Cents > 0
      ? (stats.paid30Cents - stats.paidPrevious30Cents) / stats.paidPrevious30Cents
      : null;
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (status) s.set("status", status);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    const query = s.toString();
    return `/admin/invoices${query ? `?${query}` : ""}`;
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[22px] font-semibold">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Every invoice Stripe has issued, as its webhook reported them.
        </p>
      </div>

      <section aria-label="Invoice numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Paid, last 30 days"
          value={formatMoney(stats.paid30Cents / 100, "USD")}
          note={
            change === null
              ? "Nothing in the 30 days before"
              : `${change >= 0 ? "+" : ""}${Math.round(change * 100)}% on the 30 days before`
          }
        />
        <StatCard
          label="Open"
          value={stats.open.toLocaleString("en")}
          note="Issued, not paid yet"
        />
        <StatCard
          label="Payment problems"
          value={stats.failing.toLocaleString("en")}
          note="Failed attempts or uncollectible"
        />
        <StatCard label="All invoices" value={stats.total.toLocaleString("en")} />
      </section>

      <form role="search" className="flex flex-wrap gap-2" aria-label="Filter invoices">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Email or invoice number"
          aria-label="Search invoices"
          className="w-64"
        />
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Status">
          <NativeSelectOption value="">Any status</NativeSelectOption>
          {STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {STATUS_LABEL[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Table aria-label="Invoices">
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>
              <span className="sr-only">Links</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No invoices yet. They appear when Stripe issues them.
              </TableCell>
            </TableRow>
          )}
          {list.rows.map((i) => {
            const failing =
              i.status === "uncollectible" || (i.status === "open" && i.attemptCount > 0);
            return (
              <TableRow key={i.id}>
                <TableCell>
                  <span className="font-medium">{i.number ?? "Draft"}</span>
                  <span className="block text-xs text-muted-foreground">{i.description}</span>
                </TableCell>
                <TableCell>
                  {i.userId ? (
                    <Link href={`/admin/customers/${i.userId}`} className="hover:underline">
                      {i.email}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown customer</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(
                    (i.status === "paid" ? i.amountPaidCents : i.amountDueCents) / 100,
                    i.currency,
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      i.status === "paid" ? "secondary" : failing ? "destructive" : "outline"
                    }
                  >
                    {STATUS_LABEL[i.status]}
                  </Badge>
                  {i.status === "open" && i.attemptCount > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {i.attemptCount} failed {i.attemptCount === 1 ? "attempt" : "attempts"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {(i.paidAt ?? i.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                </TableCell>
                <TableCell className="text-right text-sm whitespace-nowrap">
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
            );
          })}
        </TableBody>
      </Table>

      <nav
        aria-label="Pages"
        className="flex items-center justify-between text-sm text-muted-foreground"
      >
        <span>
          {list.total.toLocaleString("en")} {list.total === 1 ? "invoice" : "invoices"}
          {pages > 1 && ` · page ${page} of ${pages}`}
        </span>
        <span className="flex gap-2">
          {page > 1 && (
            <Link
              href={href(page - 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          )}
          {page < pages && (
            <Link
              href={href(page + 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          )}
        </span>
      </nav>
    </div>
  );
}
