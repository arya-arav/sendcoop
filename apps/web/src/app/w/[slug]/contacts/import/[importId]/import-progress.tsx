"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

export type ImportSnapshot = {
  status: string;
  fileSize: number;
  bytesProcessed: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
};

const numberFormat = new Intl.NumberFormat("en");

/** Live progress while an import is queued or running; refreshes the page when it ends. */
export function ImportProgress({
  slug,
  importId,
  initial,
}: {
  slug: string;
  importId: string;
  initial: ImportSnapshot;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/w/${slug}/imports/${importId}`, { cache: "no-store" });
      if (!response.ok || stopped) return;
      const next = (await response.json()) as ImportSnapshot;
      setSnapshot(next);
      if (next.status !== "queued" && next.status !== "processing") {
        stopped = true;
        clearInterval(timer);
        router.refresh(); // the server renders the final summary
      }
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [slug, importId, router]);

  const percent =
    snapshot.status === "queued"
      ? 0
      : Math.min(99, Math.floor((snapshot.bytesProcessed / Math.max(snapshot.fileSize, 1)) * 100));

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex items-baseline justify-between gap-4" aria-live="polite">
          <p className="font-medium">
            {snapshot.status === "queued" ? "Waiting to start…" : "Importing…"}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {numberFormat.format(snapshot.processedRows)} rows read · {percent}%
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Import progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Added" value={snapshot.createdCount} />
          <Stat label="Updated" value={snapshot.updatedCount} />
          <Stat label="Already here" value={snapshot.skippedCount} />
          <Stat label="Skipped" value={snapshot.errorCount} />
        </dl>
        <p className="text-sm text-muted-foreground">
          You can leave this page; the import keeps running.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{numberFormat.format(value)}</dd>
    </div>
  );
}
