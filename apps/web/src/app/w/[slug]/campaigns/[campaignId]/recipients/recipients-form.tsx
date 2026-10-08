"use client";

import type { CampaignAudience } from "@sendcoop/db";
import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countRecipientsAction, saveRecipientsAction } from "../../actions";

type Option = { id: string; name: string; count?: number };
type ListKey = "lists" | "segments" | "excludeLists" | "excludeSegments";

const people = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "recipient" : "recipients"}`;

/** Checkboxes for some of the workspace's lists or segments. */
function Choices({
  legend,
  options,
  chosen,
  onToggle,
  disabled,
  idPrefix,
  empty,
}: {
  legend: string;
  options: Option[];
  chosen: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
  idPrefix: string;
  empty: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        options.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${idPrefix}-${o.id}`}
              className="size-4 accent-foreground"
              checked={chosen.includes(o.id)}
              disabled={disabled}
              onChange={() => onToggle(o.id)}
            />
            <Label htmlFor={`${idPrefix}-${o.id}`} className="font-normal">
              {o.name}
              {o.count !== undefined && (
                <span className="text-muted-foreground">({o.count.toLocaleString("en")})</span>
              )}
            </Label>
          </div>
        ))
      )}
    </fieldset>
  );
}

/** Step 1: who gets the campaign, with a live count. */
export function RecipientsForm({
  slug,
  campaignId,
  editable,
  initialName,
  initialAudience,
  initialCount,
  lists,
  segments,
}: {
  slug: string;
  campaignId: string;
  editable: boolean;
  initialName: string;
  initialAudience: CampaignAudience;
  initialCount: number;
  lists: Option[];
  segments: Option[];
}) {
  const [name, setName] = useState(initialName);
  const [audience, setAudience] = useState(initialAudience);
  const [count, setCount] = useState<number | null>(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);
  const first = useRef(true);

  // Recount shortly after each change; only the newest answer is shown.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved(false);
    setCount(null);
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      const result = await countRecipientsAction(slug, audience);
      if (request === latest.current) setCount(result.ok ? result.count : 0);
    }, 250);
    return () => clearTimeout(timer);
  }, [slug, audience]);

  function toggle(key: ListKey, id: string) {
    setAudience((a) => ({
      ...a,
      [key]: a[key].includes(id) ? a[key].filter((x) => x !== id) : [...a[key], id],
    }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveRecipientsAction(slug, campaignId, { name, audience });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCount(result.count);
      setSaved(true);
    });
  }

  const disabled = !editable;
  const noLists = (
    <>
      No lists yet.{" "}
      <Link href={`/w/${slug}/lists`} className="underline">
        Create one
      </Link>
    </>
  );
  const noSegments = (
    <>
      No segments yet.{" "}
      <Link href={`/w/${slug}/segments`} className="underline">
        Create one
      </Link>
    </>
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="campaign-name">Campaign name</Label>
        <Input
          id="campaign-name"
          value={name}
          maxLength={100}
          disabled={disabled}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Only you see this; recipients see the subject.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Send to</h2>
          </CardTitle>
          <CardDescription>
            Unsubscribed, bounced and suppressed people are always left out, and nobody gets it
            twice.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div role="radiogroup" aria-label="Send to" className="grid gap-2">
            {[
              { value: true, label: "Everyone subscribed" },
              { value: false, label: "People in specific lists or segments" },
            ].map((choice) => (
              <div key={choice.label} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="everyone"
                  id={`everyone-${choice.value}`}
                  className="size-4 accent-foreground"
                  checked={audience.everyone === choice.value}
                  disabled={disabled}
                  onChange={() => setAudience((a) => ({ ...a, everyone: choice.value }))}
                />
                <Label htmlFor={`everyone-${choice.value}`} className="font-normal">
                  {choice.label}
                </Label>
              </div>
            ))}
          </div>
          {!audience.everyone && (
            <div className="grid gap-6 sm:grid-cols-2">
              <Choices
                legend="Lists"
                idPrefix="include-list"
                options={lists}
                chosen={audience.lists}
                onToggle={(id) => toggle("lists", id)}
                disabled={disabled}
                empty={noLists}
              />
              <Choices
                legend="Segments"
                idPrefix="include-segment"
                options={segments}
                chosen={audience.segments}
                onToggle={(id) => toggle("segments", id)}
                disabled={disabled}
                empty={noSegments}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Don&apos;t send to</h2>
          </CardTitle>
          <CardDescription>
            Leave out anyone in these, for example customers who already bought.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <Choices
            legend="Lists"
            idPrefix="exclude-list"
            options={lists}
            chosen={audience.excludeLists}
            onToggle={(id) => toggle("excludeLists", id)}
            disabled={disabled}
            empty="No lists yet."
          />
          <Choices
            legend="Segments"
            idPrefix="exclude-segment"
            options={segments}
            chosen={audience.excludeSegments}
            onToggle={(id) => toggle("excludeSegments", id)}
            disabled={disabled}
            empty="No segments yet."
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/40 px-4 py-3">
        <p role="status" aria-live="polite" className="flex items-center gap-2 font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          {count === null ? "Counting…" : people(count)}
        </p>
        {editable && (
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-muted-foreground">Saved</span>}
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save recipients"}
            </Button>
          </div>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}
