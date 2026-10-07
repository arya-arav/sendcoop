import type { DomainStatus } from "@sendcoop/db";
import { Badge } from "@/components/ui/badge";

const labels: Record<
  DomainStatus,
  { text: string; variant: "default" | "secondary" | "destructive" }
> = {
  pending: { text: "Waiting for DNS", variant: "secondary" },
  verified: { text: "Verified", variant: "default" },
  failed: { text: "Records missing", variant: "destructive" },
};

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const label = labels[status];
  return <Badge variant={label.variant}>{label.text}</Badge>;
}
