import { Card, CardContent } from "@/components/ui/card";

/** A headline number with a label and a note (the admin's stat cards). */
export function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="py-4">
      <CardContent className="grid gap-1 px-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-[26px] leading-tight font-semibold tabular-nums">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </CardContent>
    </Card>
  );
}
