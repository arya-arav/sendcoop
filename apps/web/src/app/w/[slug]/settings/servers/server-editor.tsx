"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type ServerForm, saveServerAction, sendTestEmailAction, type TestResult } from "./actions";

export function ServerEditor({
  slug,
  serverId,
  initial,
}: {
  slug: string;
  serverId: string | null;
  /** Saved values; secrets are always blank (they stay on the server). */
  initial: ServerForm;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ServerForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(serverId);

  const set = (key: keyof ServerForm, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };
  const field = (
    key: keyof ServerForm,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`server-${key}`}>{label}</Label>
      <Input
        id={`server-${key}`}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value)}
        autoComplete="off"
        {...props}
      />
    </div>
  );
  const secretHint = editing ? "Leave blank to keep the saved one" : undefined;

  function save() {
    startTransition(async () => {
      const result = await saveServerAction(slug, serverId, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      if (!serverId) router.replace(`/w/${slug}/settings/servers/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "Settings" : "New sending server"}</CardTitle>
        <CardDescription>
          Credentials are encrypted and never shown again after saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {field("name", "Name", { maxLength: 100, placeholder: "Main SES account" })}
        <div className="grid gap-2">
          <Label htmlFor="server-type">Type</Label>
          <NativeSelect
            id="server-type"
            value={form.type}
            disabled={editing}
            onChange={(e) => set("type", e.target.value)}
            className="w-full"
          >
            <NativeSelectOption value="ses">Amazon SES</NativeSelectOption>
            <NativeSelectOption value="smtp">SMTP</NativeSelectOption>
          </NativeSelect>
        </div>

        {form.type === "smtp" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              {field("host", "Host", { placeholder: "smtp.example.com" })}
              {field("port", "Port", { inputMode: "numeric", placeholder: "587" })}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.secure}
                onChange={(e) => set("secure", e.target.checked)}
              />
              Use TLS from the start (port 465). Otherwise STARTTLS is used when offered.
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("username", "Username (optional)")}
              {field("password", "Password", { type: "password", placeholder: secretHint })}
            </div>
          </>
        ) : (
          <>
            {field("region", "AWS region", { placeholder: "us-east-1" })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("accessKeyId", "Access key ID")}
              {field("secretAccessKey", "Secret access key", {
                type: "password",
                placeholder: secretHint,
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              Use an IAM user that can only call ses:SendEmail and ses:SendRawEmail.
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add server"}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved.
            </span>
          )}
        </div>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}

export function TestEmailPanel({
  slug,
  serverId,
  domains,
}: {
  slug: string;
  serverId: string;
  domains: { id: string; domain: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      setResult(
        await sendTestEmailAction(slug, serverId, {
          to: String(data.get("to") ?? ""),
          fromLocal: String(data.get("fromLocal") ?? ""),
          domainId: String(data.get("domainId") ?? ""),
        }),
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a test email</CardTitle>
        <CardDescription>
          Signed with your domain&apos;s DKIM key, like real campaigns.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a sending domain first: test emails are sent from it.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="test-from">From</Label>
              <div className="flex items-center gap-2">
                <Input id="test-from" name="fromLocal" defaultValue="hello" className="max-w-40" />
                <span className="text-muted-foreground">@</span>
                <NativeSelect
                  name="domainId"
                  aria-label="Sending domain"
                  defaultValue={domains[0]!.id}
                >
                  {domains.map((d) => (
                    <NativeSelectOption key={d.id} value={d.id}>
                      {d.domain}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="test-to">Send to</Label>
              <Input id="test-to" name="to" type="email" required placeholder="you@example.com" />
            </div>
            <div>
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? "Sending…" : "Send test email"}
              </Button>
            </div>
            {result && (
              <p
                role="status"
                className={result.ok ? "text-sm font-medium" : "text-sm text-destructive"}
              >
                {result.ok ? result.message : result.error}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
