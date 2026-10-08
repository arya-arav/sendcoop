"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveUtmSettingsAction } from "./actions";

/** UTM tags added to ordinary links when people click. */
export function UtmForm({
  slug,
  editable,
  initial,
}: {
  slug: string;
  editable: boolean;
  initial: { addUtm: boolean; utmSource: string };
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveUtmSettingsAction(slug, values);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Link tagging</h2>
        </CardTitle>
        <CardDescription>
          When someone clicks, ordinary links get UTM tags (so Google Analytics and UTMCAP see the
          visit came from this email) and sc_cid, the click id. Affiliate network links get the
          click id in the network&apos;s sub-id instead, so its postback can report the sale.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <fieldset disabled={!editable} className="grid gap-4">
            <div className="flex items-center gap-2">
              <input
                id="add-utm"
                type="checkbox"
                className="size-4 accent-foreground"
                checked={values.addUtm}
                onChange={(e) => {
                  setValues((v) => ({ ...v, addUtm: e.target.checked }));
                  setSaved(false);
                }}
              />
              <Label htmlFor="add-utm" className="font-normal">
                Add UTM tags (tags a link already has are kept)
              </Label>
            </div>
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="utm-source">utm_source</Label>
              <Input
                id="utm-source"
                value={values.utmSource}
                maxLength={50}
                disabled={!values.addUtm}
                onChange={(e) => {
                  setValues((v) => ({ ...v, utmSource: e.target.value }));
                  setSaved(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                utm_medium is &quot;email&quot;, utm_campaign the campaign name and utm_content the
                link&apos;s text.
              </p>
            </div>
          </fieldset>
          <FormError message={error} />
          {editable && (
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save tagging"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
