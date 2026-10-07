"use client";

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
import { Textarea } from "@/components/ui/textarea";
import type { ListFormResult } from "./actions";

type ListValues = { name: string; description: string | null };

/** Create or edit a list. `save` is a server action with its ids already bound. */
export function ListDialog({
  open,
  onOpenChange,
  initial,
  save,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ListValues;
  save: (formData: FormData) => Promise<ListFormResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ListFormResult | null>(null);
  const failed = result && !result.ok ? result : null;
  const editing = Boolean(initial);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const outcome = await save(formData);
      setResult(outcome);
      if (outcome.ok) onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setResult(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        {/* Keyed on the values so a renamed list gets fresh uncontrolled inputs. */}
        <form
          key={JSON.stringify([initial?.name, initial?.description])}
          onSubmit={onSubmit}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit list" : "New list"}</DialogTitle>
            <DialogDescription>
              Lists group subscribers, for example by offer, lead source or product.
            </DialogDescription>
          </DialogHeader>

          <FormError message={failed?.error} />

          <div className="grid gap-2">
            <Label htmlFor="list-name">Name</Label>
            <Input
              id="list-name"
              name="name"
              required
              maxLength={100}
              defaultValue={initial?.name}
              aria-invalid={Boolean(failed?.fieldErrors?.name)}
              aria-describedby={failed?.fieldErrors?.name ? "list-name-error" : undefined}
              autoFocus
            />
            {failed?.fieldErrors?.name && (
              <p id="list-name-error" className="text-sm text-destructive">
                {failed.fieldErrors.name}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="list-description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="list-description"
              name="description"
              maxLength={500}
              rows={3}
              defaultValue={initial?.description ?? ""}
              aria-invalid={Boolean(failed?.fieldErrors?.description)}
            />
            {failed?.fieldErrors?.description && (
              <p className="text-sm text-destructive">{failed.fieldErrors.description}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create list"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
