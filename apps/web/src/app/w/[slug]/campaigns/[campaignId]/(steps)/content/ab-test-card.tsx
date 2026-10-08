"use client";

import { FlaskConical } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { saveAbTestAction } from "../../../actions";

export type AbTestView = {
  enabled: boolean;
  testPercent: number;
  waitHours: number;
  metric: "clicks" | "revenue";
  subject: string;
  preheader: string;
  hasVariant: boolean;
};

/** Test a second subject and/or email on part of the audience; the better one goes to the rest. */
export function AbTestCard({
  slug,
  campaignId,
  initial,
  templates,
  starters,
}: {
  slug: string;
  campaignId: string;
  initial: AbTestView;
  templates: { id: string; name: string }[];
  starters: { id: string; name: string }[];
}) {
  const [values, setValues] = useState(initial);
  const [content, setContent] = useState(initial.hasVariant ? "keep" : "same");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof AbTestView>(key: K, value: AbTestView[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  function save(enabled: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveAbTestAction(slug, campaignId, { ...values, enabled, content });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      set("enabled", enabled);
      if (enabled) setContent("keep");
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4" aria-hidden="true" />
          <h2>A/B test</h2>
        </CardTitle>
        <CardDescription>
          Send two versions to part of your audience. After the test, the version with more clicks
          (or revenue) goes to everyone else.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!values.enabled ? (
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={pending} onClick={() => set("enabled", true)}>
              Set up an A/B test
            </Button>
            {saved && <span className="text-sm text-muted-foreground">A/B test turned off</span>}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Version A is the subject and email above. Version B:
            </p>
            <div className="grid gap-2">
              <Label htmlFor="b-subject">Version B subject</Label>
              <Input
                id="b-subject"
                value={values.subject}
                maxLength={200}
                onChange={(e) => set("subject", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-preheader">Version B preview text</Label>
              <Input
                id="b-preheader"
                value={values.preheader}
                maxLength={200}
                onChange={(e) => set("preheader", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-content">Version B email</Label>
              <NativeSelect
                id="b-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              >
                {initial.hasVariant && <option value="keep">Keep version B&apos;s email</option>}
                <option value="same">Same email as A (test the subject only)</option>
                {templates.length > 0 && (
                  <optgroup label="Your templates">
                    {templates.map((t) => (
                      <option key={t.id} value={`template:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Gallery">
                  {starters.map((s) => (
                    <option key={s.id} value={`starter:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid content-start gap-2">
                <Label htmlFor="ab-share">Test on</Label>
                <NativeSelect
                  id="ab-share"
                  value={values.testPercent}
                  onChange={(e) => set("testPercent", Number(e.target.value))}
                >
                  {[10, 20, 30, 40, 50].map((p) => (
                    <option key={p} value={p}>
                      {p}% ({p / 2}% each)
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="ab-wait">Then wait</Label>
                <NativeSelect
                  id="ab-wait"
                  value={values.waitHours}
                  onChange={(e) => set("waitHours", Number(e.target.value))}
                >
                  {[1, 2, 4, 8, 12, 24, 48].map((h) => (
                    <option key={h} value={h}>
                      {h} {h === 1 ? "hour" : "hours"}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="ab-metric">Winner has the most</Label>
                <NativeSelect
                  id="ab-metric"
                  value={values.metric}
                  onChange={(e) => set("metric", e.target.value as AbTestView["metric"])}
                >
                  <option value="clicks">Clicks</option>
                  <option value="revenue">Revenue</option>
                </NativeSelect>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Measured per email sent. On a tie, or with no clicks or revenue yet, version A wins.
            </p>
            <FormError message={error} />
            <div className="flex flex-wrap items-center justify-end gap-3">
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
              <Button variant="ghost" disabled={pending} onClick={() => save(false)}>
                Turn off
              </Button>
              <Button disabled={pending} onClick={() => save(true)}>
                {pending ? "Saving…" : "Save A/B test"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
