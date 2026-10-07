"use client";

import type { SubscriberStatus } from "@sendcoop/db/custom-fields";
import { ListMinus, ListPlus, MoveRight, Tag, Tags, Trash2, UserX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type BulkAction, type BulkSelection, bulkAction } from "./bulk-actions";

export type SubscriberRowView = {
  id: string;
  email: string;
  name: string;
  status: SubscriberStatus;
  lists: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  added: string;
};

type Option = { id: string; name: string };
type Filters = {
  query?: string;
  status?: SubscriberStatus;
  listId?: string;
  tagId?: string;
  segmentId?: string;
};
type DialogKind = "addTag" | "removeTag" | "addToList" | "removeFromList" | "moveToList";

const statusStyle: Record<
  SubscriberStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  subscribed: { label: "Subscribed", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  unsubscribed: { label: "Unsubscribed", variant: "outline" },
  bounced: { label: "Bounced", variant: "destructive" },
  complained: { label: "Complained", variant: "destructive" },
};

const numberFormat = new Intl.NumberFormat("en");

/**
 * The subscriber table with row selection and bulk actions. Selection is
 * either the checked rows on this page, or every subscriber matching the
 * current filters ("all N matching"), which the server resolves itself.
 */
export function SubscriberTable({
  slug,
  rows,
  total,
  filters,
  lists,
  tags,
  editable,
}: {
  slug: string;
  rows: SubscriberRowView[];
  total: number;
  filters: Filters;
  lists: Option[];
  tags: Option[];
  editable: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [confirm, setConfirm] = useState<"unsubscribe" | "delete" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const pageAllChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const count = allMatching ? total : checked.size;
  const selection: BulkSelection = allMatching ? { filters } : { ids: [...checked] };
  const fromList = lists.find((l) => l.id === filters.listId);

  function toggleRow(id: string) {
    setAllMatching(false);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setAllMatching(false);
    setChecked(pageAllChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function clear() {
    setChecked(new Set());
    setAllMatching(false);
  }

  function run(action: BulkAction) {
    startTransition(async () => {
      const result = await bulkAction(slug, selection, action);
      if (result.ok) {
        setDialog(null);
        setConfirm(null);
        clear();
        setNotice({ ok: true, text: result.message });
        router.refresh();
      } else {
        setNotice({ ok: false, text: result.error });
      }
    });
  }

  const people = `${numberFormat.format(count)} ${count === 1 ? "subscriber" : "subscribers"}`;

  return (
    <div className="grid gap-3">
      {notice && (
        <div
          role="status"
          className={
            notice.ok
              ? "flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm"
              : "flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {notice.text}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
          >
            <X />
          </Button>
        </div>
      )}

      {editable && count > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2"
        >
          <span className="mr-2 text-sm font-medium" aria-live="polite">
            {people} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => setDialog("addTag")}>
            <Tag />
            Add tag
          </Button>
          {tags.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setDialog("removeTag")}>
              <Tags />
              Remove tag
            </Button>
          )}
          {lists.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog("addToList")}>
                <ListPlus />
                Add to list
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog("removeFromList")}>
                <ListMinus />
                Remove from list
              </Button>
            </>
          )}
          {fromList && lists.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setDialog("moveToList")}>
              <MoveRight />
              Move to list
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirm("unsubscribe")}>
            <UserX />
            Unsubscribe
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirm("delete")}>
            <Trash2 />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} className="ml-auto">
            Clear selection
          </Button>
        </div>
      )}

      {editable && pageAllChecked && total > rows.length && (
        <p className="text-sm text-muted-foreground">
          {allMatching ? (
            <>
              All {numberFormat.format(total)} matching subscribers are selected.{" "}
              <button type="button" className="font-medium underline" onClick={clear}>
                Clear selection
              </button>
            </>
          ) : (
            <>
              All {rows.length} on this page are selected.{" "}
              <button
                type="button"
                className="font-medium text-foreground underline"
                onClick={() => setAllMatching(true)}
              >
                Select all {numberFormat.format(total)} matching
              </button>
            </>
          )}
        </p>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {editable && (
                <TableHead className="w-10 pl-4">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label="Select all on this page"
                    checked={pageAllChecked}
                    onChange={togglePage}
                  />
                </TableHead>
              )}
              <TableHead className={editable ? undefined : "pl-4"}>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lists and tags</TableHead>
              <TableHead className="w-36 pr-4">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const status = statusStyle[s.status];
              const isChecked = allMatching || checked.has(s.id);
              return (
                <TableRow key={s.id} data-state={isChecked ? "selected" : undefined}>
                  {editable && (
                    <TableCell className="pl-4">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`Select ${s.email}`}
                        checked={isChecked}
                        onChange={() => toggleRow(s.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className={editable ? "font-medium" : "pl-4 font-medium"}>
                    {s.email}
                  </TableCell>
                  <TableCell className={s.name ? undefined : "text-muted-foreground"}>
                    {s.name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {s.lists.length + s.tags.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.lists.map((l) => (
                          <Badge key={l.id} variant="outline">
                            {l.name}
                          </Badge>
                        ))}
                        {s.tags.map((t) => (
                          <Badge key={t.id} variant="secondary">
                            <Tag aria-hidden="true" />
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{s.added}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <PickerDialog
        kind={dialog}
        people={people}
        lists={lists}
        tags={tags}
        fromList={fromList}
        pending={pending}
        error={notice && !notice.ok ? notice.text : null}
        onClose={() => setDialog(null)}
        onRun={run}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? `Delete ${people}?` : `Unsubscribe ${people}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "They're removed permanently, with their lists, tags and field values. This can't be undone. To keep a record that someone mustn't be emailed, unsubscribe them instead."
                : "They won't receive campaigns from this workspace. Bounced and complained subscribers are left as they are."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant={confirm === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => run({ type: confirm === "delete" ? "delete" : "unsubscribe" })}
            >
              {pending ? "Working…" : confirm === "delete" ? `Delete ${people}` : "Unsubscribe"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Asks for the tag or list a bulk action needs. */
function PickerDialog({
  kind,
  people,
  lists,
  tags,
  fromList,
  pending,
  error,
  onClose,
  onRun,
}: {
  kind: DialogKind | null;
  people: string;
  lists: Option[];
  tags: Option[];
  fromList: Option | undefined;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onRun: (action: BulkAction) => void;
}) {
  const copy: Record<DialogKind, { title: string; button: string; label: string }> = {
    addTag: { title: `Tag ${people}`, button: "Add tag", label: "Tag" },
    removeTag: { title: `Remove a tag from ${people}`, button: "Remove tag", label: "Tag" },
    addToList: { title: `Add ${people} to a list`, button: "Add to list", label: "List" },
    removeFromList: {
      title: `Remove ${people} from a list`,
      button: "Remove from list",
      label: "List",
    },
    moveToList: {
      title: `Move ${people} from “${fromList?.name}”`,
      button: "Move",
      label: "Move to",
    },
  };

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("value") ?? "");
    if (!kind || !value) return;
    if (kind === "addTag") onRun({ type: "addTag", tagName: value });
    else if (kind === "removeTag") onRun({ type: "removeTag", tagId: value });
    else if (kind === "addToList") onRun({ type: "addToList", listId: value });
    else if (kind === "removeFromList") onRun({ type: "removeFromList", listId: value });
    else if (fromList) onRun({ type: "moveToList", fromListId: fromList.id, toListId: value });
  }

  const options =
    kind === "removeTag"
      ? tags
      : kind === "moveToList"
        ? lists.filter((l) => l.id !== fromList?.id)
        : lists;

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {kind && (
          <form key={kind} onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{copy[kind].title}</DialogTitle>
              {kind === "addTag" && (
                <DialogDescription>Pick a tag or type a new one.</DialogDescription>
              )}
            </DialogHeader>
            <FormError message={error} />
            <div className="grid gap-2">
              <Label htmlFor="bulk-value">{copy[kind].label}</Label>
              {kind === "addTag" ? (
                <>
                  <Input
                    id="bulk-value"
                    name="value"
                    required
                    maxLength={50}
                    autoFocus
                    autoComplete="off"
                    list="bulk-tag-suggestions"
                  />
                  <datalist id="bulk-tag-suggestions">
                    {tags.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </>
              ) : (
                <NativeSelect
                  id="bulk-value"
                  name="value"
                  required
                  defaultValue=""
                  className="w-full"
                >
                  <NativeSelectOption value="" disabled>
                    Choose…
                  </NativeSelectOption>
                  {options.map((o) => (
                    <NativeSelectOption key={o.id} value={o.id}>
                      {o.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Working…" : copy[kind].button}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
