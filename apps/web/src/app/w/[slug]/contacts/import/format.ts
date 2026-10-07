import type { ImportStatus } from "@sendcoop/db";

export const importStatusLabel: Record<ImportStatus, string> = {
  draft: "Needs mapping",
  queued: "Queued",
  processing: "Importing",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
