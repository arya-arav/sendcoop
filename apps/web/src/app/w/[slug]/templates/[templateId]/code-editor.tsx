"use client";

import type { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { EditorHeader, type EditorTarget, useContentSave } from "./template-header";

/**
 * Code modes: write the email's HTML yourself (the text version is made
 * from it on save), or write plain text, sent without any HTML. A live
 * preview sits next to the code.
 */
export function CodeEditor({
  target,
  mode,
  initialContent,
}: {
  /** Where it saves, and what the header shows. */
  target: EditorTarget;
  mode: "html" | "text";
  initialContent: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [preview, setPreview] = useState(initialContent);
  const state = useContentSave(target);
  const { setStatus, markUnsaved } = state;

  useEffect(() => {
    let view: EditorView | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const [{ EditorView, basicSetup }, { html }] = await Promise.all([
        import("codemirror"),
        import("@codemirror/lang-html"),
      ]);
      if (cancelled || !host.current) return;
      view = new EditorView({
        doc: initialContent,
        parent: host.current,
        extensions: [
          basicSetup,
          ...(mode === "html" ? [html()] : []),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": mode === "html" ? "HTML code" : "Email text",
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            markUnsaved();
            clearTimeout(timer);
            timer = setTimeout(() => setPreview(update.state.doc.toString()), 300);
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
          }),
        ],
      });
      viewRef.current = view;
      setStatus("saved");
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      view?.destroy();
      viewRef.current = null;
    };
    // The editor loads once; later prop changes come from our own saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const doc = viewRef.current?.state.doc.toString() ?? "";
    setPreview(doc);
    await state.save(
      mode === "html" ? { editor: "html", html: doc } : { editor: "text", text: doc },
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-3">
      <EditorHeader target={target} state={state} onSave={save} />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div
          ref={host}
          className="min-h-64 overflow-hidden rounded-lg border bg-background [&_.cm-editor]:h-full"
        />
        <figure className="flex min-h-64 flex-col gap-1">
          <figcaption className="text-xs text-muted-foreground">
            {mode === "html" ? "Preview" : "Preview: sent as plain text, with no formatting"}
          </figcaption>
          {mode === "html" ? (
            <iframe
              title="Live preview"
              sandbox=""
              srcDoc={preview}
              className="min-h-0 flex-1 rounded-lg border bg-white"
            />
          ) : (
            <pre
              aria-label="Text preview"
              className="min-h-0 flex-1 overflow-auto rounded-lg border bg-white p-4 font-mono text-sm whitespace-pre-wrap text-zinc-900"
            >
              {preview}
            </pre>
          )}
        </figure>
      </div>
    </div>
  );
}
