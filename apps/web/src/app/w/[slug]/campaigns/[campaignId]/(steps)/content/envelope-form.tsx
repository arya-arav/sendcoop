"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { saveEnvelopeAction } from "../../../actions";

type Envelope = {
  subject: string;
  preheader: string;
  fromName: string;
  fromLocal: string;
  sendingDomainId: string | null;
  sendingServerId: string | null;
  replyTo: string;
};

/** Subject, preview text and sender. */
export function EnvelopeForm({
  slug,
  campaignId,
  editable,
  initial,
  domains,
  servers,
}: {
  slug: string;
  campaignId: string;
  editable: boolean;
  initial: Envelope;
  domains: { id: string; label: string; verified: boolean }[];
  servers: { id: string; label: string }[];
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Envelope) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value || (key.endsWith("Id") ? null : "") }));
    setSaved(false);
  };
  const domain = domains.find((d) => d.id === values.sendingDomainId);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveEnvelopeAction(slug, campaignId, values);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Subject and sender</h2>
        </CardTitle>
        <CardDescription>
          What people see in their inbox before they open it. Merge tags like {"{{first_name}}"} and
          spintax work in the subject and preview text.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <fieldset disabled={!editable} className="grid gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={values.subject}
                maxLength={200}
                onChange={set("subject")}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="preheader">Preview text</Label>
              <Input
                id="preheader"
                value={values.preheader}
                maxLength={200}
                onChange={set("preheader")}
                aria-describedby="preheader-hint"
              />
              <p id="preheader-hint" className="text-xs text-muted-foreground">
                Shown after the subject in most inboxes. Optional.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="from-name">From name</Label>
                <Input
                  id="from-name"
                  value={values.fromName}
                  maxLength={100}
                  onChange={set("fromName")}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="from-local">From address</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="from-local"
                    value={values.fromLocal}
                    maxLength={64}
                    onChange={set("fromLocal")}
                    className="min-w-0"
                  />
                  <span aria-hidden="true">@</span>
                  <NativeSelect
                    aria-label="Sending domain"
                    value={values.sendingDomainId ?? ""}
                    onChange={set("sendingDomainId")}
                  >
                    <option value="">Choose a domain</option>
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                        {d.verified ? "" : " (not verified)"}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {domains.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/w/${slug}/settings/domains`} className="underline">
                      Add a sending domain
                    </Link>{" "}
                    first.
                  </p>
                ) : (
                  domain &&
                  !domain.verified && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Verify this domain&apos;s DNS records before sending, or emails may land in
                      spam.
                    </p>
                  )
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="reply-to">Reply-to address</Label>
                <Input
                  id="reply-to"
                  type="email"
                  value={values.replyTo}
                  placeholder="Optional: replies go to the From address"
                  onChange={set("replyTo")}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="server">Sending server</Label>
                <NativeSelect
                  id="server"
                  value={values.sendingServerId ?? ""}
                  onChange={set("sendingServerId")}
                >
                  <option value="">Choose a server</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
                {servers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/w/${slug}/settings/servers/new`} className="underline">
                      Add a sending server
                    </Link>{" "}
                    first.
                  </p>
                )}
              </div>
            </div>
          </fieldset>
          <FormError message={error} />
          {editable && (
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save subject and sender"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
