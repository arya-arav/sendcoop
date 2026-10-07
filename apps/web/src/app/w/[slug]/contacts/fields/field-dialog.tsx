"use client";

import { fieldKeyFromLabel } from "@sendcoop/db/custom-fields";
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
import { Textarea } from "@/components/ui/textarea";
import type { FieldFormResult } from "./actions";
import { FIELD_TYPE_LABELS, type FieldType } from "./field-types";

export type EditableField = { label: string; key: string; type: FieldType; options: string[] };

/** Create a field, or edit one (`initial` set: key and type are read-only). */
export function FieldDialog({
  open,
  onOpenChange,
  initial,
  save,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: EditableField;
  save: (formData: FormData) => Promise<FieldFormResult>;
}) {
  const editing = Boolean(initial);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FieldFormResult | null>(null);
  const [type, setType] = useState<FieldType>(initial?.type ?? "text");
  const [key, setKey] = useState(initial?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(editing);
  const failed = result && !result.ok ? result : null;

  function reset() {
    setResult(null);
    setType(initial?.type ?? "text");
    setKey(initial?.key ?? "");
    setKeyEdited(editing);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const outcome = await save(formData);
      setResult(outcome);
      if (outcome.ok) {
        onOpenChange(false);
        reset();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form key={JSON.stringify(initial ?? null)} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit field" : "New custom field"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "The key and type can't change, so values already saved keep their meaning."
                : "Store extra details on each subscriber, like company, plan or lead score."}
            </DialogDescription>
          </DialogHeader>

          <FormError message={failed?.error} />

          <div className="grid gap-2">
            <Label htmlFor="field-label">Label</Label>
            <Input
              id="field-label"
              name="label"
              required
              maxLength={60}
              defaultValue={initial?.label}
              autoFocus
              aria-invalid={Boolean(failed?.fieldErrors?.label)}
              onChange={(e) => {
                if (!keyEdited) setKey(fieldKeyFromLabel(e.target.value));
              }}
            />
            {failed?.fieldErrors?.label && (
              <p className="text-sm text-destructive">{failed.fieldErrors.label}</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label htmlFor="field-key">Key</Label>
              <Input
                id="field-key"
                name="key"
                required
                maxLength={40}
                value={key}
                readOnly={editing}
                className="font-mono"
                aria-invalid={Boolean(failed?.fieldErrors?.key)}
                aria-describedby="field-key-help"
                onChange={(e) => {
                  setKeyEdited(true);
                  setKey(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="field-type">Type</Label>
              <NativeSelect
                id="field-type"
                name="type"
                value={type}
                disabled={editing}
                onChange={(e) => setType(e.target.value as FieldType)}
                className="w-full"
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([value, text]) => (
                  <NativeSelectOption key={value} value={value}>
                    {text}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          {failed?.fieldErrors?.key ? (
            <p className="-mt-2 text-sm text-destructive">{failed.fieldErrors.key}</p>
          ) : (
            <p id="field-key-help" className="-mt-2 text-sm text-muted-foreground">
              Used in imports and as the merge tag{" "}
              <code className="font-mono">{`{{${key || "key"}}}`}</code>.
            </p>
          )}

          {type === "dropdown" && (
            <div className="grid gap-2">
              <Label htmlFor="field-options">Options</Label>
              <Textarea
                id="field-options"
                name="options"
                rows={4}
                placeholder={"Starter\nPro\nAgency"}
                defaultValue={initial?.options.join("\n")}
                aria-invalid={Boolean(failed?.fieldErrors?.options)}
              />
              <p
                className={
                  failed?.fieldErrors?.options
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {failed?.fieldErrors?.options ?? "One option per line."}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
