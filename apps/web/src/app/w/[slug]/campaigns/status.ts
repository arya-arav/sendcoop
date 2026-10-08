import type { CampaignStatus } from "@sendcoop/db";

export const STATUS_LABELS: Record<
  CampaignStatus,
  { label: string; variant: "secondary" | "outline" | "destructive" | "default" }
> = {
  draft: { label: "Draft", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  queued: { label: "Starting", variant: "secondary" },
  sending: { label: "Sending", variant: "default" },
  sent: { label: "Sent", variant: "secondary" },
  paused: { label: "Paused", variant: "destructive" },
  canceled: { label: "Canceled", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};
