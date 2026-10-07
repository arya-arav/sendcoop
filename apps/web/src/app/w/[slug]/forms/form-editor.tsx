"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormValues, saveFormAction } from "./actions";

type Option = { id: string; name: string };

export function FormEditor({
  slug,
  formId,
  initial,
  fieldOptions,
  lists,
  share,
}: {
  slug: string;
  formId: string | null;
  initial: FormValues;
  /** Fields that can be added: first/last name and custom fields. */
  fieldOptions: { key: string; label: string }[];
  lists: Option[];
  /** Hosted link and embed code, once the form is saved. */
  share: { hostedUrl: string; embedHtml: string } | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }
  function toggle(key: "fields" | "listIds", id: string, on: boolean) {
    const current = values[key];
    set(key, on ? [...current, id] : current.filter((x) => x !== id));
  }

  function save() {
    startTransition(async () => {
      const result = await saveFormAction(slug, formId, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      if (!formId) router.replace(`/w/${slug}/forms/${result.id}`);
      else router.refresh();
    });
  }

  const text = (key: keyof FormValues, label: string, opts: { max: number; long?: boolean }) => {
    const id = `form-${key}`;
    const value = (values[key] as string | null) ?? "";
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        {opts.long ? (
          <Textarea
            id={id}
            rows={2}
            maxLength={opts.max}
            value={value}
            onChange={(e) => set(key, e.target.value as never)}
          />
        ) : (
          <Input
            id={id}
            maxLength={opts.max}
            value={value}
            onChange={(e) => set(key, e.target.value as never)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Form</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {text("name", "Internal name", { max: 100 })}
            {text("title", "Heading", { max: 120 })}
            {text("description", "Description (optional)", { max: 500, long: true })}
            {text("buttonText", "Button text", { max: 40 })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
            <CardDescription>Email is always asked. Pick anything else to collect.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2">
            {fieldOptions.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={values.fields.includes(f.key)}
                  onChange={(e) => toggle("fields", f.key, e.target.checked)}
                />
                {f.label}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>After signing up</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Add to lists</legend>
              {lists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lists yet.</p>
              ) : (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={values.listIds.includes(l.id)}
                        onChange={(e) => toggle("listIds", l.id, e.target.checked)}
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={values.doubleOptIn}
                onChange={(e) => set("doubleOptIn", e.target.checked)}
              />
              <span>
                <span className="font-medium">Double opt-in</span>
                <span className="block text-muted-foreground">
                  New subscribers confirm by email first. Recommended: it keeps typos and fake
                  addresses off your list and protects your sender reputation.
                </span>
              </span>
            </label>
            {text("successMessage", "Thank-you message", { max: 300, long: true })}
            {text("redirectUrl", "Redirect to a page instead (optional)", { max: 500 })}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : formId ? "Save changes" : "Create form"}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved.
            </span>
          )}
        </div>
        <FormError message={error} />
      </div>

      <aside className="grid content-start gap-4">
        {share ? (
          <>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Hosted page</CardTitle>
                <CardDescription>Share this link anywhere.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <CopyField label="Hosted page link" value={share.hostedUrl} />
                <a
                  href={share.hostedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sm font-medium underline"
                >
                  Open
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Embed code</CardTitle>
                <CardDescription>
                  Paste into any website. Plain HTML, works without JavaScript.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CopyField label="Embed code" value={share.embedHtml} multiline />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card size="sm">
            <CardHeader>
              <CardDescription>Create the form to get its link and embed code.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </aside>
    </div>
  );
}

function CopyField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      {multiline ? (
        <Textarea
          aria-label={label}
          readOnly
          rows={8}
          value={value}
          className="font-mono text-xs"
        />
      ) : (
        <Input aria-label={label} readOnly value={value} className="font-mono text-xs" />
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
