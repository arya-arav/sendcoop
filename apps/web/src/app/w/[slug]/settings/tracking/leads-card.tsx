"use client";

import { useState, useTransition } from "react";
import { CopyField } from "@/components/copy-field";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { saveLeadListAction } from "./actions";

export function leadExamples(webhookUrl: string) {
  return `# A new lead, from your form tool (JSON or form fields)
curl -sS -X POST "${webhookUrl}" -H "Content-Type: application/json" \\
  -d '{"lead_id":"L-1042","email":"pat@example.com","name":"Pat Smith","sc_cid":"<from the landing page URL>"}'

# Later, from your CRM: qualified, then sold with its value (or lost)
curl -sS -X POST "${webhookUrl}" -H "Content-Type: application/json" \\
  -d '{"lead_id":"L-1042","status":"sold","value":2500}'`;
}

/** Lead forms and CRMs: the webhook URL, how stages work, and the list leads join. */
export function LeadsCard({
  slug,
  webhookUrl,
  lists,
  listId,
}: {
  slug: string;
  /** null for members. */
  webhookUrl: string | null;
  lists: { id: string; name: string }[];
  listId: string | null;
}) {
  const [chosen, setChosen] = useState(listId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Leads</h2>
        </CardTitle>
        <CardDescription>
          For lead generation: send each lead from your form tool (directly, or with Zapier or
          Make), then its status as it&apos;s worked: new, qualified, sold or lost. A sold lead
          counts as revenue for the email that brought it in.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {webhookUrl ? (
          <>
            <CopyField label="Lead webhook URL" value={webhookUrl} />
            <p className="text-xs text-muted-foreground">
              Fields: email, lead_id (the tool&apos;s id, for later updates), name or first_name and
              last_name, sc_cid (from the landing page URL, e.g. in a hidden field), status, value,
              currency.
            </p>
            <CopyField label="Lead examples" value={leadExamples(webhookUrl)} multiline />
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await saveLeadListAction(slug, chosen || null);
                  if (!result.ok) setError(result.error);
                  else setMessage("Saved.");
                });
              }}
            >
              <Label htmlFor="lead-list">Add new leads to a list (optional)</Label>
              <div className="flex flex-wrap gap-2">
                <NativeSelect
                  id="lead-list"
                  value={chosen}
                  onChange={(e) => {
                    setChosen(e.target.value);
                    setMessage(null);
                  }}
                >
                  <option value="">Don&apos;t add them to a list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
              <FormError message={error} />
              {message && (
                <p role="status" className="text-sm text-muted-foreground">
                  {message}
                </p>
              )}
            </form>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can see the lead webhook URL.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
