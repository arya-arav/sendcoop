"use client";

import type { TemplateEditor } from "@sendcoop/db";
import { AlignLeft, Code, FilePlus, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { chooseContentAction, type ContentSource } from "../../../actions";

const EDITORS: Record<TemplateEditor, string> = {
  visual: "drag-and-drop design",
  html: "HTML code",
  text: "plain text",
};

/** The email itself: a preview, editing, or picking what to start from. */
export function ContentCard({
  slug,
  campaignId,
  editable,
  editor,
  html,
  text,
  templates,
  starters,
}: {
  slug: string;
  campaignId: string;
  editable: boolean;
  editor: TemplateEditor;
  html: string;
  text: string;
  templates: { id: string; name: string }[];
  starters: { id: string; name: string }[];
}) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const empty = !html.trim() && !text.trim();

  function choose(source: ContentSource) {
    setError(null);
    startTransition(async () => {
      const result = await chooseContentAction(slug, campaignId, source);
      if (result?.error) setError(result.error);
      else setPick("");
    });
  }

  function useTemplate() {
    const [kind, id] = pick.split(":") as ["template" | "starter", string];
    choose(kind === "template" ? { kind, templateId: id } : { kind, starterId: id });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Email</h2>
        </CardTitle>
        <CardDescription>
          {empty
            ? "Start from one of your templates or the gallery, or from scratch."
            : `This campaign's own copy, as ${EDITORS[editor]}. Editing it doesn't change any template.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!empty && (
          <div className="grid gap-3">
            {html.trim() ? (
              <div className="relative h-80 overflow-hidden rounded-lg border bg-white">
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={html}
                  className="pointer-events-none absolute top-0 left-0 h-[200%] w-[200%] origin-top-left scale-50 border-0"
                />
              </div>
            ) : (
              <pre
                aria-label="Email preview"
                className="max-h-80 overflow-auto rounded-lg border bg-white p-4 text-sm whitespace-pre-wrap text-zinc-900"
              >
                {text}
              </pre>
            )}
            {editable && (
              <Link
                href={`/w/${slug}/campaigns/${campaignId}/design`}
                className={buttonVariants({ className: "w-fit" })}
              >
                <Pencil />
                Edit email
              </Link>
            )}
          </div>
        )}

        {editable && (
          <div className="grid gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">{empty ? "Start from" : "Replace with"}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="content-source" className="sr-only">
                  Template
                </Label>
                <NativeSelect
                  id="content-source"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">Choose a template…</option>
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
              <Button variant="outline" disabled={!pick || pending} onClick={useTemplate}>
                Use template
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => choose({ kind: "visual" })}
              >
                <FilePlus />
                Blank design
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => choose({ kind: "html" })}
              >
                <Code />
                HTML code
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => choose({ kind: "text" })}
              >
                <AlignLeft />
                Plain text
              </Button>
            </div>
            {!empty && (
              <p className="text-xs text-muted-foreground">
                Replacing discards this campaign&apos;s current email.
              </p>
            )}
            <FormError message={error} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
