"use client";

import { ArrowLeft, Eye, Save } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UtmcapLinkButton } from "./utmcap-link-button";
import { Label } from "@/components/ui/label";

// The parts every email editor shares (templates and campaign content):
// save state, saving, what the server says about the saved email, and for
// templates the name and subject line.

export type SaveStatus = "loading" | "saved" | "unsaved" | "saving";

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "Loading editor…",
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
};

/** Where an editor saves to, and what its header shows. */
export type EditorTarget = {
  saveUrl: string;
  backHref: string;
  backLabel: string;
  previewHref?: string;
  /** Templates have a name and subject line in the editor; campaigns set them elsewhere. */
  meta?: { name: string; subject: string };
  /** Shown before Save, e.g. a delete button. */
  actions?: React.ReactNode;
  /** Set when the workspace has UTMCAP connected: offers "Insert UTMCAP link". */
  utmcapSlug?: string;
};

export function useContentSave(target: EditorTarget) {
  const [name, setName] = useState(target.meta?.name ?? "");
  const [subject, setSubject] = useState(target.meta?.subject ?? "");
  const [status, setStatus] = useState<SaveStatus>("loading");
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

  /** Saves the editor's content (and the name and subject, for templates). */
  async function save(content: Record<string, unknown>) {
    setError(null);
    setWarnings([]);
    setStatus("saving");
    const response = await fetch(target.saveUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(target.meta ? { name, subject } : {}), ...content }),
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
    setError(data?.error ?? "Your changes couldn't be saved. Check your connection and try again.");
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

export function EditorHeader({
  target,
  state,
  onSave,
  onInsertLink,
}: {
  target: EditorTarget;
  state: ReturnType<typeof useContentSave>;
  onSave: () => void;
  /** Puts a link where the user is editing. */
  onInsertLink?: (url: string, text: string) => void;
}) {
  const { name, setName, subject, setSubject, status, error, warnings, markUnsaved } = state;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={target.backHref}
          aria-label={target.backLabel}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft />
        </Link>
        {target.meta && (
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
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {STATUS_TEXT[status]}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {target.utmcapSlug && onInsertLink && (
            <UtmcapLinkButton slug={target.utmcapSlug} onInsert={onInsertLink} />
          )}
          {target.previewHref && (
            <Link
              href={target.previewHref}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Eye />
              Preview
            </Link>
          )}
          {target.actions}
          <Button onClick={onSave} disabled={status === "loading" || status === "saving"}>
            <Save />
            Save
          </Button>
        </div>
      </div>
      {target.meta && (
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
      )}
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
