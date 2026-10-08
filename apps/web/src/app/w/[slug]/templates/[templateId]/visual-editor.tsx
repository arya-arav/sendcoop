"use client";

import "grapesjs/dist/css/grapes.min.css";
import type { Editor } from "grapesjs";
import { ArrowLeft, Eye, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emailBlocks } from "@/lib/email-blocks";
import { DeleteTemplateButton } from "../template-actions";

type Status = "loading" | "saved" | "unsaved" | "saving";

const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" width="36" height="36" style="fill:none" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Icons for our blocks in the editor's panel (plain SVG: the panel isn't React). */
const BLOCK_ICONS: Record<string, string> = {
  "sc-header": icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>'),
  "sc-text": icon('<path d="M4 6h16M4 10h16M4 14h10M4 18h12"/>'),
  "sc-button": icon('<rect x="3" y="8" width="18" height="8" rx="3"/><path d="M9 12h6"/>'),
  "sc-image": icon(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  ),
  "sc-product": icon('<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  "sc-footer": icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18"/>'),
};

const STATUS_TEXT: Record<Status, string> = {
  loading: "Loading editor…",
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
};

/**
 * The drag-and-drop editor (GrapesJS with MJML, which renders reliably in
 * Gmail and Outlook). Saves the editor project, so editing picks up where it
 * left off, and the MJML, which the server compiles into the HTML that gets sent.
 */
export function VisualEditor({
  slug,
  templateId,
  initialName,
  design,
  mjml,
  assets,
  images,
}: {
  slug: string;
  templateId: string;
  initialName: string;
  design: Record<string, unknown> | null;
  mjml: string | null;
  /** Absolute URL of the placeholder images used by blocks. */
  assets: string;
  /** The workspace's uploaded images, for the image picker. */
  images: { src: string; width: number; height: number; name: string }[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

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
        // Double-clicking an image opens the picker: the workspace's images,
        // and uploads, which the server checks, resizes and stores publicly.
        assetManager: {
          assets: images.map((image) => ({ type: "image", ...image })),
          upload: `/api/w/${slug}/media`,
          multiUpload: false,
          // Our own upload, so a refused file shows our message (and no
          // unhandled error).
          uploadFile: async (event: Event) => {
            const input = event.target as HTMLInputElement | null;
            const file = (event as DragEvent).dataTransfer?.files?.[0] ?? input?.files?.[0];
            if (!file) return;
            setError(null);
            const body = new FormData();
            body.append("file", file);
            const response = await fetch(`/api/w/${slug}/media`, { method: "POST", body }).catch(
              () => null,
            );
            const data = (await response?.json().catch(() => null)) as {
              error?: string;
              data?: { src: string; width: number; height: number; name: string }[];
            } | null;
            if (input) input.value = "";
            if (!response?.ok || !data?.data) {
              setError(data?.error ?? "The image couldn't be uploaded. Try again.");
              return;
            }
            editor?.AssetManager.add(data.data.map((image) => ({ type: "image", ...image })));
          },
        },
        blockManager: {
          // Clicking a block adds it too, so building doesn't need dragging
          // (keyboard and touch users). It goes after the selected section,
          // or at the end of the email.
          appendOnClick: (block, ed) => {
            const body = ed.getWrapper()?.findType("mj-body")[0];
            if (!body) return;
            let section = ed.getSelected();
            while (section && section.parent() !== body) section = section.parent();
            const added = body.append(block.getContent() as string, {
              at: section ? section.index() + 1 : undefined,
            });
            if (added[0]) ed.select(added[0]);
          },
        },
        plugins: [
          (e) =>
            mjmlPlugin(e, {
              // Layout pieces from the plugin; content comes from our blocks below.
              blocks: [
                "mj-1-column",
                "mj-2-columns",
                "mj-3-columns",
                "mj-divider",
                "mj-spacer",
                "mj-social-group",
              ],
              block: () => ({ category: "Layout" }),
            }),
        ],
        ...(design ? { projectData: design } : { components: mjml ?? "" }),
      });
      for (const block of emailBlocks(assets)) {
        editor.Blocks.add(block.id, {
          label: block.label,
          category: "Content",
          content: block.mjml,
          media: BLOCK_ICONS[block.id],
        });
      }
      editorRef.current = editor;
      editor.on("load", () => {
        setStatus("saved");
        // Start with the blocks panel open: that is where building starts.
        editor?.Panels.getButton("views", "open-blocks")?.set("active", true);
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
    setWarnings([]);
    setStatus("saving");
    // Text being typed lives in the canvas until editing stops: stop it so
    // the latest words are saved.
    const view = editor.getEditing()?.getView() as
      { disableEditing?: () => Promise<void> } | undefined;
    await view?.disableEditing?.();
    const source = editor.getHtml();
    const response = await fetch(`/api/w/${slug}/templates/${templateId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        design: editor.getProjectData(),
        mjml: source,
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
      warnings?: string[];
      bytes?: number;
      clipped?: boolean;
    } | null;
    if (response?.ok) {
      setStatus("saved");
      setWarnings([
        ...(data?.clipped
          ? [
              `Gmail cuts off emails over 102 KB and this one is ${Math.round((data.bytes ?? 0) / 1024)} KB. Remove some content so the end (and your unsubscribe link) shows.`,
            ]
          : []),
        ...(data?.warnings ?? []),
      ]);
      return;
    }
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
          <Link
            href={`/w/${slug}/templates/${templateId}/preview`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Eye />
            Preview
          </Link>
          <DeleteTemplateButton slug={slug} id={templateId} name={name} />
          <Button onClick={save} disabled={status === "loading" || status === "saving"}>
            <Save />
            Save
          </Button>
        </div>
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
      <div ref={container} className="min-h-0 flex-1 overflow-hidden rounded-lg border" />
    </div>
  );
}
