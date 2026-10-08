"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendTestAction } from "../../../actions";

/** Sends the saved draft to one address. */
export function TestSendForm({
  slug,
  campaignId,
  defaultTo,
}: {
  slug: string;
  campaignId: string;
  defaultTo: string;
}) {
  const [to, setTo] = useState(defaultTo);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const outcome = await sendTestAction(slug, campaignId, to);
      setResult(
        outcome.ok ? { ok: true, text: outcome.message } : { ok: false, text: outcome.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Send a test</h2>
        </CardTitle>
        <CardDescription>
          The saved email, through your sending server, with &quot;[Test]&quot; before the subject.
          Merge tags show their fallbacks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={send} className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-64 flex-1 gap-2">
            <Label htmlFor="test-to">Send to</Label>
            <Input
              id="test-to"
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            <Send />
            {pending ? "Sending…" : "Send test"}
          </Button>
        </form>
        {result?.ok && (
          <p role="status" className="mt-3 text-sm">
            {result.text}
          </p>
        )}
        {result && !result.ok && (
          <div className="mt-3">
            <FormError message={result.text} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
