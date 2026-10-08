"use client";

import { ArrowLeft, Eye, Save } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteTemplateButton } from "../template-actions";

// The parts every template editor shares: name, subject line, save state,
// saving, and what the server says about the saved email.

export type SaveStatus = "loading" | "saved" | "unsaved" | "saving";

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "Loading editor…",
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
};

export function useTemplateSave(
  slug: string,
  templateId: string,
  initial: { name: string; subject: string; status: SaveStatus },
) {
  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [status, setStatus] = useState<SaveStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const markUnsaved = useCallback(
    () => setStatus((s) => (s === "saving" || s === "loading" ? s : "unsaved")),
    [],
  );

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (status !== "unsaved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  /** Saves the name and subject with the editor's content. */
  async function save(content: Record<string, unknown>) {
    setError(null);
    setWarnings([]);
    setStatus("saving");
    const response = await fetch(`/api/w/${slug}/templates/${templateId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, subject, ...content }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
      warnings?: string[];
    } | null;
    if (response?.ok) {
      setStatus("saved");
      setWarnings(data?.warnings ?? []);
      return;
    }
    setError(data?.error ?? "The template couldn't be saved. Check your connection and try again.");
    setStatus("unsaved");
  }

  return {
    name,
    setName,
    subject,
    setSubject,
    status,
    setStatus,
    error,
    setError,
    warnings,
    markUnsaved,
    save,
  };
}

export function TemplateHeader({
  slug,
  templateId,
  state,
  onSave,
}: {
  slug: string;
  templateId: string;
  state: ReturnType<typeof useTemplateSave>;
  onSave: () => void;
}) {
  const { name, setName, subject, setSubject, status, error, warnings, markUnsaved } = state;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/w/${slug}/templates`}
          aria-label="Back to templates"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft />
        </Link>
        <Input
          aria-label="Template name"
          value={name}
          maxLength={100}
          onChange={(e) => {
            setName(e.target.value);
            markUnsaved();
          }}
          className="max-w-sm font-medium"
        />
        <p role="status" className="text-sm text-muted-foreground">
          {STATUS_TEXT[status]}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/w/${slug}/templates/${templateId}/preview`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Eye />
            Preview
          </Link>
          <DeleteTemplateButton slug={slug} id={templateId} name={name} />
          <Button onClick={onSave} disabled={status === "loading" || status === "saving"}>
            <Save />
            Save
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor="template-subject" className="shrink-0 text-muted-foreground">
          Subject line
        </Label>
        <Input
          id="template-subject"
          value={subject}
          maxLength={200}
          placeholder="Suggested subject for campaigns. Merge tags and spintax work here too."
          onChange={(e) => {
            setSubject(e.target.value);
            markUnsaved();
          }}
        />
      </div>
      <FormError message={error} />
      {warnings.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <p className="font-medium">Saved, but check this:</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
