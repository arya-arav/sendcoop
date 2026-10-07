import { listSegments, previewSegment } from "@sendcoop/db";
import { Filter, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { DeleteSegmentButton } from "./delete-segment";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const numberFormat = new Intl.NumberFormat("en");

export default async function SegmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const segments = await listSegments(workspace.id);
  // Counts are computed now, so they always reflect current data.
  const counts = await Promise.all(
    segments.map((s) =>
      previewSegment(workspace.id, s.rules, { sampleSize: 0 }).then((r) => r.count),
    ),
  );
  const editable = canManage(role);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
          <p className="text-sm text-muted-foreground">
            Groups of subscribers defined by rules, always up to date.
          </p>
        </div>
        {editable && segments.length > 0 && (
          <Button render={<Link href={`/w/${slug}/segments/new`} />}>
            <Plus />
            New segment
          </Button>
        )}
      </div>

      {segments.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <Filter className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No segments yet</p>
            <p className="text-sm text-muted-foreground">
              For example: on “Keto buyers”, lead score above 50, added in the last 30 days.
            </p>
          </div>
          {editable && (
            <Button render={<Link href={`/w/${slug}/segments/new`} />}>
              <Plus />
              Create your first segment
            </Button>
          )}
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead className="w-32 text-right">Subscribers</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead className="w-40">Updated</TableHead>
                {editable && <TableHead className="w-12 pr-4" aria-label="Actions" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment, index) => {
                const count = segment.rules.conditions.reduce(
                  (n, c) => n + (c.type === "group" ? c.conditions.length : 1),
                  0,
                );
                return (
                  <TableRow key={segment.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link href={`/w/${slug}/segments/${segment.id}`} className="hover:underline">
                        {segment.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link
                        href={`/w/${slug}/contacts?segment=${segment.id}`}
                        className="hover:underline"
                      >
                        {numberFormat.format(counts[index]!)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {count} {count === 1 ? "condition" : "conditions"}, matching{" "}
                      {segment.rules.match}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormat.format(segment.updatedAt)}
                    </TableCell>
                    {editable && (
                      <TableCell className="pr-4 text-right">
                        <DeleteSegmentButton slug={slug} id={segment.id} name={segment.name} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
