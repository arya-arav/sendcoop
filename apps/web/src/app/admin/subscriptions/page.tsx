import {
  listSubscriptionsPage,
  SUBSCRIPTION_TABS,
  type SubscriptionTab,
  subscriptionStats,
} from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { StatCard } from "@/components/admin/stat-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SubscriptionsTable } from "./subscriptions-table";

export const metadata: Metadata = { title: "Subscriptions" };

const TAB_LABELS: Record<SubscriptionTab, string> = {
  all: "All",
  active: "Active",
  trialing: "Trialing",
  past_due: "Payment failed",
  canceling: "Ending",
  canceled: "Canceled",
};

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tab = SUBSCRIPTION_TABS.find((t) => t === params.tab) ?? "all";
  const q = (params.q ?? "").slice(0, 200);
  const page = Math.max(1, Number(params.page) || 1);
  const [stats, list] = await Promise.all([
    subscriptionStats(),
    listSubscriptionsPage({ tab, q, page }),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (t: SubscriptionTab, p = 1) => {
    const s = new URLSearchParams();
    if (t !== "all") s.set("tab", t);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    const query = s.toString();
    return `/admin/subscriptions${query ? `?${query}` : ""}`;
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[22px] font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Paying accounts. Changes to Stripe subscriptions happen in Stripe, and come back through
          its webhook.
        </p>
      </div>

      <section
        aria-label="Subscription numbers"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Monthly recurring revenue"
          value={formatMoney(stats.mrrCents / 100, "USD")}
          note="Active and past-due subscriptions"
        />
        <StatCard
          label="Active"
          value={stats.active.toLocaleString("en")}
          note={`${stats.trialing} trialing`}
        />
        <StatCard
          label="Payment failed"
          value={stats.pastDue.toLocaleString("en")}
          note="Stripe is retrying"
        />
        <StatCard
          label="Ending"
          value={stats.canceling.toLocaleString("en")}
          note={`${stats.endingIn7Days} within 7 days · ${stats.canceled} canceled`}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Subscription status" className="flex flex-wrap gap-1">
          {SUBSCRIPTION_TABS.map((t) => (
            <Link
              key={t}
              href={href(t)}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                t === tab ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABELS[t]}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <Input
            name="q"
            defaultValue={q}
            placeholder="Customer email"
            aria-label="Search subscriptions"
            className="w-56"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      <SubscriptionsTable rows={list.rows} />

      <nav
        aria-label="Pages"
        className="flex items-center justify-between text-sm text-muted-foreground"
      >
        <span>
          {list.total.toLocaleString("en")} {list.total === 1 ? "subscription" : "subscriptions"}
          {pages > 1 && ` · page ${page} of ${pages}`}
        </span>
        <span className="flex gap-2">
          {page > 1 && (
            <Link
              href={href(tab, page - 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          )}
          {page < pages && (
            <Link
              href={href(tab, page + 1)}
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
