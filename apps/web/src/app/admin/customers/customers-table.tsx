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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bulkCustomersAction,
  changePlanAction,
  impersonateAction,
  suspendAction,
  unsuspendAction,
} from "./actions";

type Row = {
  id: string;
  name: string;
  email: string;
  banned: boolean;
  emailVerified: boolean;
  createdAt: Date;
  plan: string;
  subscriptionStatus: string | null;
  workspaces: number;
  subscribers: number;
  sendsThisMonth: number;
};

type Result = { ok: true; message?: string } | { ok: false; error: string };

export function CustomersTable({
  rows,
  plans,
}: {
  rows: Row[];
  plans: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlan, setBulkPlan] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const run = (action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      setMessage(
        result.ok
          ? result.message
            ? { text: result.message, error: false }
            : null
          : { text: result.error, error: true },
      );
      if (result.ok) after?.();
      router.refresh();
    });

  const suspend = (ids: string[]) => {
    const reason = prompt("Why are you suspending them? (kept for the record)");
    if (!reason?.trim()) return;
    run(
      () =>
        ids.length === 1
          ? suspendAction(ids[0]!, reason)
          : bulkCustomersAction(ids, { kind: "suspend", reason }),
      () => setSelected(new Set()),
    );
  };

  return (
    <div className="grid gap-3">
      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="With the selected customers"
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        >
          <span className="font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => suspend([...selected])}
          >
            Suspend
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => bulkCustomersAction([...selected], { kind: "unsuspend" }),
                () => setSelected(new Set()),
              )
            }
          >
            Lift suspension
          </Button>
          <NativeSelect
            size="sm"
            aria-label="Plan for the selected customers"
            value={bulkPlan}
            onChange={(e) => setBulkPlan(e.target.value)}
          >
            <NativeSelectOption value="">Assign a plan…</NativeSelectOption>
            {plans.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !bulkPlan}
            onClick={() =>
              run(
                () => bulkCustomersAction([...selected], { kind: "plan", planId: bulkPlan }),
                () => setSelected(new Set()),
              )
            }
          >
            Assign
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </p>
      )}

      <Table aria-label="Customers">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                aria-label="Select all on this page"
                checked={allChecked}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                }
              />
            </TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Workspaces</TableHead>
            <TableHead className="text-right">Subscribers</TableHead>
            <TableHead className="text-right">Emails this month</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                No customers match.
              </TableCell>
            </TableRow>
          )}
          {rows.map((c) => (
            <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
              <TableCell>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label={`Select ${c.email}`}
                  checked={selected.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    setSelected(next);
                  }}
                />
              </TableCell>
              <TableCell>
                <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">
                  {c.email}
                </Link>
                <span className="block text-xs text-muted-foreground">{c.name}</span>
              </TableCell>
              <TableCell>
                {c.plan}
                {c.subscriptionStatus === "past_due" && (
                  <Badge variant="destructive" className="ml-2">
                    Payment failed
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
              <TableCell>
                {c.banned ? (
                  <Badge variant="destructive">Suspended</Badge>
                ) : c.emailVerified ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Unverified</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(c.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button size="icon" variant="ghost" aria-label={`Actions for ${c.email}`} />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem onClick={() => router.push(`/admin/customers/${c.id}`)}>
                      Open
                    </DropdownMenuItem>
                    {!c.banned && (
                      <DropdownMenuItem onClick={() => run(() => impersonateAction(c.id))}>
                        Log in as them
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Assign plan</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {plans.map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            onClick={() => run(() => changePlanAction(c.id, p.id))}
                          >
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    {c.banned ? (
                      <DropdownMenuItem onClick={() => run(() => unsuspendAction(c.id))}>
                        Lift suspension
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem variant="destructive" onClick={() => suspend([c.id])}>
                        Suspend
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
