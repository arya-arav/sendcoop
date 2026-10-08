import { listLists } from "@sendcoop/db";
import { ListChecks } from "lucide-react";
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
import { ListRowActions, NewListButton } from "./list-actions";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const numberFormat = new Intl.NumberFormat("en");

export default async function ListsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const lists = await listLists(workspace.id);
  const editable = canManage(role);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Lists</h1>
          <p className="text-sm text-muted-foreground">
            Group subscribers by offer, lead source or product.
          </p>
        </div>
        {editable && lists.length > 0 && <NewListButton slug={slug} />}
      </div>

      {lists.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <ListChecks className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No lists yet</p>
            <p className="text-sm text-muted-foreground">
              {editable
                ? "Create a list, then import or collect subscribers into it."
                : "An owner or admin can create the first list."}
            </p>
          </div>
          {editable && <NewListButton slug={slug} label="Create your first list" />}
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead className="w-32 text-right">Subscribers</TableHead>
                <TableHead className="w-40">Created</TableHead>
                {editable && <TableHead className="w-12 pr-4" aria-label="Actions" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell className="pl-4 whitespace-normal">
                    <p className="font-medium">{list.name}</p>
                    {list.description && (
                      <p className="text-sm text-muted-foreground">{list.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numberFormat.format(list.subscriberCount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormat.format(list.createdAt)}
                  </TableCell>
                  {editable && (
                    <TableCell className="pr-4 text-right">
                      <ListRowActions
                        slug={slug}
                        list={{ id: list.id, name: list.name, description: list.description }}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
