import { type CustomerSort, customerStats, listCustomersPage, listPlans } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CustomersTable } from "./customers-table";
import { NewCustomerDialog } from "./new-customer-dialog";

export const metadata: Metadata = { title: "Customers" };

type Search = { q?: string; status?: string; plan?: string; sort?: string; page?: string };

const STATUSES = ["active", "suspended", "unverified"] as const;
const SORTS: Record<CustomerSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  subscribers: "Most subscribers",
  sends: "Most emails this month",
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 200);
  const status = STATUSES.find((s) => s === params.status) ?? null;
  const sort = (Object.keys(SORTS) as CustomerSort[]).find((s) => s === params.sort) ?? "newest";
  const page = Math.max(1, Number(params.page) || 1);
  const [stats, plans] = await Promise.all([customerStats(), listPlans({ includeHidden: true })]);
  const plan = plans.find((p) => p.key === params.plan)?.key ?? null;
  const list = await listCustomersPage({ q, status, plan, sort, page });
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (status) s.set("status", status);
    if (plan) s.set("plan", plan);
    if (sort !== "newest") s.set("sort", sort);
    if (p > 1) s.set("page", String(p));
    const query = s.toString();
    return `/admin/customers${query ? `?${query}` : ""}`;
  };
  const choosablePlans = plans
    .filter((p) => !p.archived)
    .map((p) => ({ id: p.id, name: p.name, key: p.key }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Every account: what it&apos;s on, what it uses, and its access.
          </p>
        </div>
        <NewCustomerDialog plans={choosablePlans} />
      </div>

      <section aria-label="Customer numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["Customers", stats.total, `${stats.newThisMonth} new this month`],
            ["Active", stats.active, "Verified and not suspended"],
            ["Suspended", stats.suspended, "Can't log in or send"],
            ["Unverified", stats.unverified, "Haven't confirmed their email"],
          ] as const
        ).map(([label, value, note]) => (
          <Card key={label} className="py-4">
            <CardContent className="grid gap-1 px-5">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-[26px] leading-tight font-semibold tabular-nums">
                {value.toLocaleString("en")}
              </span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <form role="search" className="flex flex-wrap items-end gap-2" aria-label="Filter customers">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Email or name"
          aria-label="Search customers"
          className="w-64"
        />
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Status">
          <NativeSelectOption value="">Any status</NativeSelectOption>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="suspended">Suspended</NativeSelectOption>
          <NativeSelectOption value="unverified">Unverified</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="plan" defaultValue={plan ?? ""} aria-label="Plan">
          <NativeSelectOption value="">Any plan</NativeSelectOption>
          {plans.map((p) => (
            <NativeSelectOption key={p.id} value={p.key}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={sort} aria-label="Sort">
          {(Object.entries(SORTS) as [CustomerSort, string][]).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {(q || status || plan || sort !== "newest") && (
          <Link href="/admin/customers" className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        )}
      </form>

      <CustomersTable rows={list.rows} plans={choosablePlans} />

      <nav
        aria-label="Pages"
        className="flex items-center justify-between text-sm text-muted-foreground"
      >
        <span>
          {list.total.toLocaleString("en")} {list.total === 1 ? "customer" : "customers"}
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
