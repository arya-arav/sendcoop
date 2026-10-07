"use client";

import {
  LIST_OPERATORS,
  operatorsFor,
  type SegmentCondition,
  type SegmentFieldInfo,
  type SegmentGroup,
  type SegmentRules,
  segmentRulesProblem,
  TAG_OPERATORS,
} from "@sendcoop/db/segments";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { saveSegmentAction } from "./actions";
import { SegmentCount } from "./segment-count";

type Option = { id: string; name: string };
type Item = SegmentRules["conditions"][number];

export type SegmentEditorProps = {
  slug: string;
  segmentId: string | null;
  initialName: string;
  initialRules: SegmentRules;
  fields: SegmentFieldInfo[];
  lists: Option[];
  tags: Option[];
};

function newCondition(fields: SegmentFieldInfo[]): SegmentCondition {
  const field = fields[0]!;
  return { type: "field", field: field.key, op: operatorsFor(field)[0]!.value, value: "" };
}

/** Builds and saves a segment: conditions, plus one level of groups, matched all or any. */
export function SegmentEditor({
  slug,
  segmentId,
  initialName,
  initialRules,
  fields,
  lists,
  tags,
}: SegmentEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState<SegmentRules>(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const context = useMemo(
    () => ({
      fields,
      listIds: new Set(lists.map((l) => l.id)),
      tagIds: new Set(tags.map((t) => t.id)),
    }),
    [fields, lists, tags],
  );
  const problem = segmentRulesProblem(rules, context);

  function change(next: SegmentRules) {
    setRules(next);
    setSaved(false);
    setError(null);
  }
  const setItem = (index: number, item: Item) =>
    change({ ...rules, conditions: rules.conditions.map((c, i) => (i === index ? item : c)) });
  const removeItem = (index: number) =>
    change({ ...rules, conditions: rules.conditions.filter((_, i) => i !== index) });

  function save() {
    startTransition(async () => {
      const result = await saveSegmentAction(slug, segmentId, { name, rules });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      if (!segmentId) router.replace(`/w/${slug}/segments/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="grid content-start gap-4">
        <div className="grid max-w-md gap-2">
          <Label htmlFor="segment-name">Segment name</Label>
          <Input
            id="segment-name"
            value={name}
            maxLength={100}
            placeholder="Engaged keto buyers"
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <Card>
          <CardContent className="grid gap-3">
            <MatchPicker
              label="Subscribers who match"
              value={rules.match}
              onChange={(match) => change({ ...rules, match })}
            />
            {rules.conditions.map((item, index) =>
              item.type === "group" ? (
                <GroupBox
                  key={index}
                  group={item}
                  fields={fields}
                  lists={lists}
                  tags={tags}
                  onChange={(group) => setItem(index, group)}
                  onRemove={() => removeItem(index)}
                />
              ) : (
                <ConditionRow
                  key={index}
                  condition={item}
                  fields={fields}
                  lists={lists}
                  tags={tags}
                  onChange={(c) => setItem(index, c)}
                  onRemove={() => removeItem(index)}
                />
              ),
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  change({ ...rules, conditions: [...rules.conditions, newCondition(fields)] })
                }
              >
                <Plus />
                Add condition
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  change({
                    ...rules,
                    conditions: [
                      ...rules.conditions,
                      { type: "group", match: "any", conditions: [newCondition(fields)] },
                    ],
                  })
                }
              >
                <Plus />
                Add group
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || Boolean(problem) || !name.trim()}>
            {pending ? "Saving…" : segmentId ? "Save changes" : "Save segment"}
          </Button>
          {saved && (
            <span className="text-sm text-muted-foreground" role="status">
              Saved.
            </span>
          )}
          {problem && rules.conditions.length > 0 && (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {problem}
            </span>
          )}
        </div>
        <FormError message={error} />
      </div>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <SegmentCount slug={slug} rules={rules} valid={!problem} segmentId={segmentId} />
      </aside>
    </div>
  );
}

function MatchPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "all" | "any";
  onChange: (value: "all" | "any") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{label}</span>
      <NativeSelect
        size="sm"
        aria-label={`${label}: all or any`}
        value={value}
        onChange={(e) => onChange(e.target.value as "all" | "any")}
      >
        <NativeSelectOption value="all">all</NativeSelectOption>
        <NativeSelectOption value="any">any</NativeSelectOption>
      </NativeSelect>
      <span>of these conditions:</span>
    </div>
  );
}

function GroupBox({
  group,
  fields,
  lists,
  tags,
  onChange,
  onRemove,
}: {
  group: SegmentGroup;
  fields: SegmentFieldInfo[];
  lists: Option[];
  tags: Option[];
  onChange: (group: SegmentGroup) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-dashed p-3" role="group" aria-label="Group">
      <div className="flex items-center justify-between gap-2">
        <MatchPicker
          label="Match"
          value={group.match}
          onChange={(match) => onChange({ ...group, match })}
        />
        <Button variant="ghost" size="icon-sm" aria-label="Remove group" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {group.conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          fields={fields}
          lists={lists}
          tags={tags}
          onChange={(next) =>
            onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? next : x)) })
          }
          onRemove={() =>
            onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })
          }
        />
      ))}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({ ...group, conditions: [...group.conditions, newCondition(fields)] })
          }
        >
          <Plus />
          Add condition to group
        </Button>
      </div>
    </div>
  );
}

/** One condition: what to test, how, and against which value. */
function ConditionRow({
  condition,
  fields,
  lists,
  tags,
  onChange,
  onRemove,
}: {
  condition: SegmentCondition;
  fields: SegmentFieldInfo[];
  lists: Option[];
  tags: Option[];
  onChange: (condition: SegmentCondition) => void;
  onRemove: () => void;
}) {
  const subject = condition.type === "field" ? `field:${condition.field}` : condition.type;
  const field = condition.type === "field" ? fields.find((f) => f.key === condition.field) : null;

  function pickSubject(value: string) {
    if (value === "list") onChange({ type: "list", op: "in", listId: lists[0]?.id ?? "" });
    else if (value === "tag") onChange({ type: "tag", op: "has", tagId: tags[0]?.id ?? "" });
    else {
      const next = fields.find((f) => `field:${f.key}` === value)!;
      onChange({
        type: "field",
        field: next.key,
        op: operatorsFor(next)[0]!.value,
        value: next.kind === "enum" ? (next.options?.[0]?.value ?? "") : "",
      });
    }
  }

  const operators =
    condition.type === "list"
      ? LIST_OPERATORS
      : condition.type === "tag"
        ? TAG_OPERATORS
        : field
          ? operatorsFor(field)
          : [];
  const needsValue =
    condition.type === "field" &&
    (field ? operatorsFor(field).find((o) => o.value === condition.op)?.needsValue : false);
  const daysOp =
    condition.type === "field" &&
    (condition.op === "in_last_days" || condition.op === "more_than_days_ago");

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Condition">
      <NativeSelect
        aria-label="Condition on"
        value={subject}
        onChange={(e) => pickSubject(e.target.value)}
      >
        {fields.map((f) => (
          <NativeSelectOption key={f.key} value={`field:${f.key}`}>
            {f.label}
          </NativeSelectOption>
        ))}
        {lists.length > 0 && <NativeSelectOption value="list">List</NativeSelectOption>}
        {tags.length > 0 && <NativeSelectOption value="tag">Tag</NativeSelectOption>}
      </NativeSelect>

      <NativeSelect
        aria-label="Comparison"
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value } as SegmentCondition)}
      >
        {operators.map((op) => (
          <NativeSelectOption key={op.value} value={op.value}>
            {op.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {condition.type === "list" && (
        <NativeSelect
          aria-label="List"
          value={condition.listId}
          onChange={(e) => onChange({ ...condition, listId: e.target.value })}
        >
          {lists.map((l) => (
            <NativeSelectOption key={l.id} value={l.id}>
              {l.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {condition.type === "tag" && (
        <NativeSelect
          aria-label="Tag"
          value={condition.tagId}
          onChange={(e) => onChange({ ...condition, tagId: e.target.value })}
        >
          {tags.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {condition.type === "field" && needsValue && field?.kind === "enum" && (
        <NativeSelect
          aria-label="Value"
          value={condition.value ?? ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          {field.options?.map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {condition.type === "field" && needsValue && field?.kind !== "enum" && (
        <Input
          aria-label="Value"
          className="w-44"
          type={
            daysOp || field?.kind === "number" ? "number" : field?.kind === "date" ? "date" : "text"
          }
          min={daysOp ? 1 : undefined}
          step={field?.kind === "number" ? "any" : undefined}
          placeholder={daysOp ? "days" : undefined}
          value={condition.value ?? ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      )}

      <Button variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}
