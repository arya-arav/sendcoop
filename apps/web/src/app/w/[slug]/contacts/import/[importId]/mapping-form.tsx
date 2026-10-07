"use client";

import type { FieldDefinition } from "@sendcoop/db/custom-fields";
import {
  type ImportMapping,
  type ImportTarget,
  importTargets,
  mappingProblem,
  mapRow,
} from "@sendcoop/db/imports";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveMappingAction } from "./actions";

const SKIP = "";

export function MappingForm({
  slug,
  importId,
  columns,
  sampleRows,
  fields,
  lists,
  initial,
  editable,
}: {
  slug: string;
  importId: string;
  columns: string[];
  sampleRows: string[][];
  fields: FieldDefinition[];
  lists: { id: string; name: string }[];
  initial: { mapping: ImportMapping; listIds: string[]; updateExisting: boolean };
  /** False once the import has started; the form becomes read-only. */
  editable: boolean;
}) {
  const [mapping, setMapping] = useState<(ImportTarget | null)[]>(() =>
    columns.map((_, i) => initial.mapping.columns[i] ?? null),
  );
  const [listIds, setListIds] = useState<string[]>(initial.listIds);
  const [updateExisting, setUpdateExisting] = useState(initial.updateExisting);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const targets = useMemo(() => importTargets(fields), [fields]);
  const targetLabel = useMemo(
    () => Object.fromEntries(targets.map((t) => [t.value, t.label])) as Record<string, string>,
    [targets],
  );
  const problem = mappingProblem({ columns: mapping }, columns.length, fields);
  const preview = useMemo(
    () => sampleRows.map((row) => mapRow(row, { columns: mapping }, fields)),
    [sampleRows, mapping, fields],
  );
  const validCount = preview.filter((r) => r.ok).length;
  const mappedFields = fields.filter((f) => mapping.includes(`field:${f.key}`));

  function setTarget(index: number, value: string) {
    setResult(null);
    setMapping((current) =>
      current.map((t, i) => (i === index ? (value as ImportTarget) || null : t)),
    );
  }

  function save() {
    startTransition(async () => {
      const outcome = await saveMappingAction(slug, importId, {
        columns: mapping,
        listIds,
        updateExisting,
      });
      setResult(
        outcome.ok
          ? { ok: true, message: "Mapping saved." }
          : { ok: false, message: outcome.error },
      );
    });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="columns-heading">
        <h2 id="columns-heading" className="text-lg font-semibold">
          Match columns
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {columns.map((column, index) => {
            const samples = sampleRows
              .map((row) => row[index]?.trim())
              .filter(Boolean)
              .slice(0, 3);
            return (
              <Card key={index} size="sm" data-mapped={mapping[index] ? "" : undefined}>
                <CardHeader>
                  <CardTitle className="truncate" title={column}>
                    {column}
                  </CardTitle>
                  <CardDescription className="truncate">
                    {samples.length > 0 ? samples.join(", ") : "No values in the sample"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <NativeSelect
                    aria-label={`Import “${column}” as`}
                    value={mapping[index] ?? SKIP}
                    onChange={(e) => setTarget(index, e.target.value)}
                    disabled={!editable}
                    className="w-full"
                  >
                    <NativeSelectOption value={SKIP}>Don&apos;t import</NativeSelectOption>
                    {targets.map((target) => (
                      <NativeSelectOption
                        key={target.value}
                        value={target.value}
                        // One column per target; the current choice stays selectable.
                        disabled={mapping.includes(target.value) && mapping[index] !== target.value}
                      >
                        {target.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="options-heading">
        <h2 id="options-heading" className="text-lg font-semibold">
          Options
        </h2>
        <Card size="sm">
          <CardContent className="grid gap-4">
            <fieldset className="grid gap-2" disabled={!editable}>
              <legend className="mb-1 text-sm font-medium">Add everyone to lists</legend>
              {lists.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lists yet. Subscribers are still imported into the workspace.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {lists.map((list) => (
                    <label key={list.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={listIds.includes(list.id)}
                        onChange={(e) =>
                          setListIds((ids) =>
                            e.target.checked
                              ? [...ids, list.id]
                              : ids.filter((id) => id !== list.id),
                          )
                        }
                      />
                      {list.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={updateExisting}
                disabled={!editable}
                onChange={(e) => setUpdateExisting(e.target.checked)}
              />
              <span>
                <span className="font-medium">Update existing subscribers</span>
                <span className="block text-muted-foreground">
                  Fill in names and fields from the file for people already here. Their status is
                  never changed, so unsubscribes stay unsubscribed.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3" aria-labelledby="preview-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="preview-heading" className="text-lg font-semibold">
            Preview
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {problem
              ? problem
              : `${validCount} of ${preview.length} sample rows are ready to import`}
          </p>
        </div>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <span className="sr-only">Result</span>
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>First name</TableHead>
                <TableHead>Last name</TableHead>
                {mappedFields.map((f) => (
                  <TableHead key={f.key}>{targetLabel[`field:${f.key}`]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((row, i) => {
                if (problem) {
                  return null;
                }
                if (row.ok) {
                  const s = row.subscriber;
                  return (
                    <TableRow key={i}>
                      <TableCell className="pl-4">
                        <CircleCheck className="size-4 text-emerald-600" aria-label="Ready" />
                      </TableCell>
                      <TableCell className="font-medium">{s.email}</TableCell>
                      <TableCell>{s.firstName ?? "—"}</TableCell>
                      <TableCell>{s.lastName ?? "—"}</TableCell>
                      {mappedFields.map((f) => (
                        <TableCell key={f.key}>{String(s.fields[f.key] ?? "—")}</TableCell>
                      ))}
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={i} className="bg-destructive/5">
                    <TableCell className="pl-4">
                      <CircleAlert
                        className="size-4 text-destructive"
                        aria-label="Will be skipped"
                      />
                    </TableCell>
                    <TableCell colSpan={3 + mappedFields.length} className="whitespace-normal">
                      <span className="text-sm text-destructive">
                        Row {i + 1} will be skipped: {row.errors.join(" ")}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {problem && (
                <TableRow>
                  <TableCell colSpan={4 + mappedFields.length} className="py-8 text-center">
                    <span className="text-muted-foreground">{problem}</span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      {editable && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {result && !result.ok && <FormError message={result.message} />}
          {result?.ok && (
            <Badge variant="secondary" aria-live="polite">
              {result.message} Importing arrives in the next update.
            </Badge>
          )}
          <Button onClick={save} disabled={pending || Boolean(problem)}>
            {pending ? "Saving…" : "Save mapping"}
          </Button>
        </div>
      )}
    </div>
  );
}
