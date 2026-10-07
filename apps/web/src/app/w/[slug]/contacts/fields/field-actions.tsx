"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createFieldAction, deleteFieldAction, updateFieldAction } from "./actions";
import { type EditableField, FieldDialog } from "./field-dialog";

export function NewFieldButton({ slug, label = "New field" }: { slug: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <FieldDialog open={open} onOpenChange={setOpen} save={createFieldAction.bind(null, slug)} />
    </>
  );
}

export function FieldRowActions({
  slug,
  field,
}: {
  slug: string;
  field: EditableField & { id: string };
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function confirmDelete() {
    startDelete(async () => {
      const result = await deleteFieldAction(slug, field.id);
      if (result.ok) setConfirming(false);
      else setDeleteError(result.error ?? "Couldn't delete the field.");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Actions for ${field.label}`} />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setDeleteError(null);
              setConfirming(true);
            }}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FieldDialog
        open={editing}
        onOpenChange={setEditing}
        initial={field}
        save={updateFieldAction.bind(null, slug, field.id, field.type === "dropdown")}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{field.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every subscriber&apos;s {field.label} value is deleted too. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete field"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
