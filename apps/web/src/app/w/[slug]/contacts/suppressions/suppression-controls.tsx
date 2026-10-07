"use client";

import { Plus, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { removeSuppressionAction } from "./actions";

type ImportResult = { added: number; alreadyListed: number; invalid: number };

const addresses = (n: number) => `${n.toLocaleString()} ${n === 1 ? "address" : "addresses"}`;

function summary({ added, alreadyListed, invalid }: ImportResult) {
  return [
    `Added ${addresses(added)}.`,
    alreadyListed > 0 &&
      `${addresses(alreadyListed)} ${alreadyListed === 1 ? "was" : "were"} already listed.`,
    invalid > 0 &&
      `${invalid.toLocaleString()} ${invalid === 1 ? "line had" : "lines had"} no valid address.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Paste addresses or upload a CSV/TXT file (our export format works too). */
export function AddSuppressionsButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (!next) setError(null);
    setOpen(next);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/w/${slug}/suppressions`, {
        method: "POST",
        body: formData,
      }).catch(() => null);
      const data = (await response?.json().catch(() => null)) as
        (ImportResult & { error?: string }) | null;
      if (!response?.ok || !data) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setOpen(false);
      setDone(summary(data));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {done && (
        <p role="status" className="text-sm text-muted-foreground">
          {done}
        </p>
      )}
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add addresses
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add to the suppression list</DialogTitle>
              <DialogDescription>
                Campaigns from this workspace will never be sent to these addresses.
              </DialogDescription>
            </DialogHeader>
            <FormError message={error} />
            <div className="grid gap-2">
              <Label htmlFor="suppress-addresses">Addresses</Label>
              <Textarea
                id="suppress-addresses"
                name="addresses"
                rows={6}
                placeholder={"one@example.com\ntwo@example.com"}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">One address per line.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="suppress-file">Or upload a CSV or text file</Label>
              <Input
                id="suppress-file"
                name="file"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add to list"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RemoveSuppressionButton({
  slug,
  id,
  email,
}: {
  slug: string;
  id: string;
  email: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${email}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeSuppressionAction(slug, id);
          // Already gone (removed in another tab): just show the current list.
          if (!result.ok) router.refresh();
        })
      }
    >
      <X />
    </Button>
  );
}
