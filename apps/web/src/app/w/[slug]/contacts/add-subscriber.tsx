"use client";

import { Plus } from "lucide-react";
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
import { addSubscriberAction, type SubscriberFormResult } from "./actions";

export function AddSubscriberButton({
  slug,
  lists,
  label = "Add subscriber",
}: {
  slug: string;
  lists: { id: string; name: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SubscriberFormResult | null>(null);
  const failed = result && !result.ok ? result : null;

  function onOpenChange(next: boolean) {
    if (!next) setResult(null);
    setOpen(next);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const outcome = await addSubscriberAction(slug, formData);
      setResult(outcome);
      if (outcome.ok) setOpen(false);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add subscriber</DialogTitle>
              <DialogDescription>
                Only add people who agreed to receive email from you.
              </DialogDescription>
            </DialogHeader>

            <FormError message={failed?.error} />

            <div className="grid gap-2">
              <Label htmlFor="subscriber-email">Email</Label>
              <Input
                id="subscriber-email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="off"
                aria-invalid={Boolean(failed?.fieldErrors?.email)}
                aria-describedby={failed?.fieldErrors?.email ? "subscriber-email-error" : undefined}
              />
              {failed?.fieldErrors?.email && (
                <p id="subscriber-email-error" className="text-sm text-destructive">
                  {failed.fieldErrors.email}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="subscriber-first-name">First name</Label>
                <Input id="subscriber-first-name" name="firstName" maxLength={100} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscriber-last-name">Last name</Label>
                <Input id="subscriber-last-name" name="lastName" maxLength={100} />
              </div>
            </div>
            {failed?.fieldErrors?.name && (
              <p className="text-sm text-destructive">{failed.fieldErrors.name}</p>
            )}

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Lists</legend>
              {lists.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lists yet. You can add this subscriber to lists later.
                </p>
              ) : (
                <div className="grid max-h-40 gap-2 overflow-y-auto">
                  {lists.map((list) => (
                    <label key={list.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="listIds"
                        value={list.id}
                        className="size-4 accent-primary"
                      />
                      {list.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add subscriber"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
