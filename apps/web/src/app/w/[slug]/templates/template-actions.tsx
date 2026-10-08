"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { createTemplateAction, deleteTemplateAction, type NewTemplateFrom } from "./actions";

/** Creates a template (from a starter, blank, or a code mode) and opens the editor. */
export function UseStarterButton({
  slug,
  from,
  label,
  name,
  primary,
}: {
  slug: string;
  from: NewTemplateFrom;
  label: string;
  primary?: boolean;
  /** For screen readers when several buttons share a label. */
  name?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        variant={primary ? "default" : "outline"}
        disabled={pending}
        aria-label={name ? `${label}: ${name}` : undefined}
        onClick={() =>
          startTransition(async () => {
            const result = await createTemplateAction(slug, from);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Creating…" : label}
      </Button>
    </div>
  );
}

export function DeleteTemplateButton({
  slug,
  id,
  name,
}: {
  slug: string;
  id: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 />
        Delete
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Campaigns already made from it keep their content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteTemplateAction(slug, id);
                  router.push(`/w/${slug}/templates`);
                })
              }
            >
              {pending ? "Deleting…" : "Delete template"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
