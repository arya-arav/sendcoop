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
  initial: {
    addUtm: boolean;
    utmSource: string;
    trackOpens: boolean;
    attributionWindowDays: number;
  };
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
          <h2>Tracking options</h2>
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
            <div className="flex items-start gap-2">
              <input
                id="track-opens"
                type="checkbox"
                className="mt-1 size-4 accent-foreground"
                checked={values.trackOpens}
                aria-describedby="track-opens-hint"
                onChange={(e) => {
                  setValues((v) => ({ ...v, trackOpens: e.target.checked }));
                  setSaved(false);
                }}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="track-opens">Track opens</Label>
                <span id="track-opens-hint" className="text-xs text-muted-foreground">
                  A tiny image in HTML emails. Apple Mail and security scanners load it without
                  anyone reading, so those opens are counted separately; clicks are more reliable.
                </span>
              </div>
            </div>
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="attribution-window">Attribution window (days)</Label>
              <Input
                id="attribution-window"
                type="number"
                min={1}
                max={90}
                value={values.attributionWindowDays}
                aria-describedby="attribution-window-hint"
                onChange={(e) => {
                  setValues((v) => ({ ...v, attributionWindowDays: Number(e.target.value) }));
                  setSaved(false);
                }}
              />
              <p id="attribution-window-hint" className="text-xs text-muted-foreground">
                When a sale arrives without a click id but with the buyer&apos;s email, their last
                email click within this many days gets the credit.
              </p>
            </div>
          </fieldset>
          <FormError message={error} />
          {editable && (
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save options"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
