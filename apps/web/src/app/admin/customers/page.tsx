import { listCustomers } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? "").slice(0, 200);
  const customers = await listCustomers({ q });
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Accounts, their plans and what they used this month. Newest first.
        </p>
      </div>
      <form className="flex max-w-md gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Email or name"
          aria-label="Search customers"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <Table aria-label="Customers">
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Workspaces</TableHead>
            <TableHead className="text-right">Subscribers</TableHead>
            <TableHead className="text-right">Emails this month</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No customers match.
              </TableCell>
            </TableRow>
          )}
          {customers.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/admin/customers/${c.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {c.email}
                </Link>
                <span className="block text-xs text-muted-foreground">{c.name}</span>
              </TableCell>
              <TableCell>
                {c.plan}
                {c.banned && (
                  <Badge variant="destructive" className="ml-2">
                    Suspended
                  </Badge>
                )}
                {c.role === "admin" && (
                  <Badge variant="outline" className="ml-2">
                    Admin
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.workspaces}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.subscribers.toLocaleString("en")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.sendsThisMonth.toLocaleString("en")}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
