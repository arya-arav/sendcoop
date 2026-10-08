"use client";

import "grapesjs/dist/css/grapes.min.css";
import type { Editor } from "grapesjs";
import { useEffect, useRef } from "react";
import { emailBlocks } from "@/lib/email-blocks";
import { EditorHeader, type EditorTarget, useContentSave } from "./template-header";

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

/**
 * The drag-and-drop editor (GrapesJS with MJML, which renders reliably in
 * Gmail and Outlook). Saves the editor project, so editing picks up where it
 * left off, and the MJML, which the server compiles into the HTML that gets sent.
 */
export function VisualEditor({
  slug,
  target,
  design,
  mjml,
  assets,
  images,
}: {
  slug: string;
  /** Where it saves, and what the header shows. */
  target: EditorTarget;
  design: Record<string, unknown> | null;
  mjml: string | null;
  /** Absolute URL of the placeholder images used by blocks. */
  assets: string;
  /** The workspace's uploaded images, for the image picker. */
  images: { src: string; width: number; height: number; name: string }[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const state = useContentSave(target);
  const { setStatus, setError, markUnsaved } = state;

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
        editor?.on("update", markUnsaved);
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

  async function save() {
    const editor = editorRef.current;
    if (!editor) return;
    // Text being typed lives in the canvas until editing stops: stop it so
    // the latest words are saved.
    const view = editor.getEditing()?.getView() as
      { disableEditing?: () => Promise<void> } | undefined;
    await view?.disableEditing?.();
    await state.save({ editor: "visual", design: editor.getProjectData(), mjml: editor.getHtml() });
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-3">
      <EditorHeader target={target} state={state} onSave={save} />
      <div ref={container} className="min-h-0 flex-1 overflow-hidden rounded-lg border" />
    </div>
  );
}
