"use client";

import "grapesjs/dist/css/grapes.min.css";
import type { Editor } from "grapesjs";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteTemplateButton } from "../template-actions";

type Status = "loading" | "saved" | "unsaved" | "saving";

const STATUS_TEXT: Record<Status, string> = {
  loading: "Loading editor…",
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
};

/**
 * The drag-and-drop editor (GrapesJS with MJML, which renders reliably in
 * Gmail and Outlook). Saves the editor project, so editing picks up where it
 * left off, plus the MJML and the compiled HTML that gets sent.
 */
export function VisualEditor({
  slug,
  templateId,
  initialName,
  design,
  mjml,
}: {
  slug: string;
  templateId: string;
  initialName: string;
  design: Record<string, unknown> | null;
  mjml: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let editor: Editor | null = null;
    let cancelled = false;
    (async () => {
      // Browser-only libraries: loaded here, never on the server.
      const [{ default: grapesjs }, { default: mjmlPlugin }] = await Promise.all([
        import("grapesjs"),
        import("grapesjs-mjml"),
      ]);
      if (cancelled || !container.current) return;
      editor = grapesjs.init({
        container: container.current,
        height: "100%",
        storageManager: false,
        plugins: [(e) => mjmlPlugin(e, {})],
        ...(design ? { projectData: design } : { components: mjml ?? "" }),
      });
      editorRef.current = editor;
      editor.on("load", () => {
        setStatus("saved");
        // Changes after loading mark the template unsaved.
        editor?.on("update", () => setStatus((s) => (s === "saving" ? s : "unsaved")));
      });
    })();
    return () => {
      cancelled = true;
      editor?.destroy();
      editorRef.current = null;
    };
    // The editor loads once; later prop changes come from our own saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (status !== "unsaved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  async function save() {
    const editor = editorRef.current;
    if (!editor) return;
    setError(null);
    setStatus("saving");
    // Text being typed lives in the canvas until editing stops: stop it so
    // the latest words are saved.
    const view = editor.getEditing()?.getView() as
      { disableEditing?: () => Promise<void> } | undefined;
    await view?.disableEditing?.();
    const source = editor.getHtml();
    const compiled = editor.runCommand("mjml-code-to-html") as { html: string } | undefined;
    const response = await fetch(`/api/w/${slug}/templates/${templateId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        design: editor.getProjectData(),
        mjml: source,
        html: compiled?.html ?? "",
      }),
    }).catch(() => null);
    if (response?.ok) {
      setStatus("saved");
      return;
    }
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "The template couldn't be saved. Check your connection and try again.");
    setStatus("unsaved");
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-3">
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
            setStatus("unsaved");
          }}
          className="max-w-sm font-medium"
        />
        <p role="status" className="text-sm text-muted-foreground">
          {STATUS_TEXT[status]}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <DeleteTemplateButton slug={slug} id={templateId} name={name} />
          <Button onClick={save} disabled={status === "loading" || status === "saving"}>
            <Save />
            Save
          </Button>
        </div>
      </div>
      <FormError message={error} />
      <div ref={container} className="min-h-0 flex-1 overflow-hidden rounded-lg border" />
    </div>
  );
}
