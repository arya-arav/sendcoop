"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createCustomerAction } from "./actions";

/** Adds an account by hand: verified, with a first workspace and a plan. */
export function NewCustomerDialog({
  plans,
}: {
  plans: { id: string; name: string; key: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const free = plans.find((p) => p.key === "free")?.id ?? "";

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add customer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setError(null);
              startTransition(async () => {
                const result = await createCustomerAction({
                  name: String(form.get("name")),
                  email: String(form.get("email")),
                  password: String(form.get("password")),
                  workspace: String(form.get("workspace")),
                  planId: String(form.get("planId")),
                });
                if (!result.ok) setError(result.error);
                else {
                  setOpen(false);
                  router.push(`/admin/customers/${result.id}`);
                }
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Add customer</DialogTitle>
              <DialogDescription>
                Their email is treated as confirmed. Share the password with them securely; they can
                change it after logging in.
              </DialogDescription>
            </DialogHeader>
            <FormError message={error} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="new-name">Name</Label>
                <Input id="new-name" name="name" required maxLength={100} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="new-email">Email</Label>
                <Input id="new-email" name="email" type="email" required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="new-password">Password</Label>
                <Input id="new-password" name="password" type="password" required minLength={8} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="new-plan">Plan</Label>
                <NativeSelect id="new-plan" name="planId" defaultValue={free} className="w-full">
                  {plans.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-workspace">First workspace (optional)</Label>
              <Input
                id="new-workspace"
                name="workspace"
                maxLength={60}
                placeholder="e.g. their business"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
