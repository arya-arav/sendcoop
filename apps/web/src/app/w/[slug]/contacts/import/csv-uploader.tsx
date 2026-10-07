"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 100 * 1024 * 1024;

type Upload =
  | { state: "idle" }
  | { state: "uploading"; name: string; percent: number }
  | { state: "failed"; message: string };

/** Picks or drops a CSV and streams it to the upload endpoint with progress. */
export function CsvUploader({ slug }: { slug: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const [dragging, setDragging] = useState(false);

  function start(file: File) {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setUpload({ state: "failed", message: "Choose a .csv file." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setUpload({ state: "failed", message: "The file is larger than 100 MB." });
      return;
    }

    // XMLHttpRequest, because fetch can't report upload progress.
    const request = new XMLHttpRequest();
    request.open("POST", `/api/w/${encodeURIComponent(slug)}/imports`);
    request.setRequestHeader("content-type", "text/csv");
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUpload({
          state: "uploading",
          name: file.name,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };
    request.onload = () => {
      const body = safeJson(request.responseText);
      if (request.status === 201 && body?.id) {
        router.push(`/w/${slug}/contacts/import/${body.id}`);
      } else {
        setUpload({ state: "failed", message: body?.error ?? "The upload failed. Try again." });
      }
    };
    request.onerror = () =>
      setUpload({ state: "failed", message: "The upload failed. Check your connection." });
    setUpload({ state: "uploading", name: file.name, percent: 0 });
    request.send(file);
  }

  const uploading = upload.state === "uploading";

  return (
    <div className="grid gap-3">
      <FormError message={upload.state === "failed" ? upload.message : null} />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !uploading) start(file);
        }}
        data-dragging={dragging || undefined}
        className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors data-dragging:border-primary data-dragging:bg-muted"
      >
        <FileUp className="size-8 text-muted-foreground" aria-hidden="true" />
        {uploading ? (
          <div className="grid w-full max-w-sm gap-2" aria-live="polite">
            <p className="text-sm font-medium">Uploading {upload.name}…</p>
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuenow={upload.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${upload.percent}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{upload.percent}%</p>
          </div>
        ) : (
          <>
            <div>
              <p className="font-medium">Drop a CSV file here</p>
              <p className="text-sm text-muted-foreground">
                Up to 100 MB. One subscriber per row, with a column for email addresses.
              </p>
            </div>
            <Button onClick={() => input.current?.click()}>Choose file</Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,text/csv"
          aria-label="CSV file"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) start(file);
          }}
        />
      </div>
    </div>
  );
}

function safeJson(text: string): { id?: string; error?: string } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
