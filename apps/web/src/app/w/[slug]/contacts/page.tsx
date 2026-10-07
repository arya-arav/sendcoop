import {
  countSubscribers,
  listCustomFields,
  listLists,
  listSubscribers,
  type SubscriberStatus,
} from "@sendcoop/db";
import { SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { AddSubscriberButton } from "./add-subscriber";

const PAGE_SIZE = 50; // search and paging arrive in D9
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const numberFormat = new Intl.NumberFormat("en");

const statusStyle: Record<
  SubscriberStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  subscribed: { label: "Subscribed", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  unsubscribed: { label: "Unsubscribed", variant: "outline" },
  bounced: { label: "Bounced", variant: "destructive" },
  complained: { label: "Complained", variant: "destructive" },
};

export default async function ContactsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const [subscribers, total, lists, customFields] = await Promise.all([
    listSubscribers(workspace.id, { limit: PAGE_SIZE }),
    countSubscribers(workspace.id),
    listLists(workspace.id),
    listCustomFields(workspace.id),
  ]);
  const fieldViews = customFields.map(({ key, label, type, options }) => ({
    key,
    label,
    type,
    options,
  }));
  const editable = canManage(role);
  // Alphabetical, so lists are easy to find when picking.
  const listOptions = lists
    .map(({ id, name }) => ({ id, name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Everyone you can email from this workspace."
              : `${numberFormat.format(total)} ${total === 1 ? "subscriber" : "subscribers"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href={`/w/${slug}/contacts/fields`} />}>
            <SlidersHorizontal />
            Custom fields
          </Button>
          {editable && total > 0 && (
            <AddSubscriberButton slug={slug} lists={listOptions} fields={fieldViews} />
          )}
        </div>
      </div>

      {total === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No subscribers yet</p>
            <p className="text-sm text-muted-foreground">
              {editable
                ? "Add people one at a time now. CSV import and signup forms are coming."
                : "An owner or admin can add the first subscribers."}
            </p>
          </div>
          {editable && (
            <AddSubscriberButton
              slug={slug}
              lists={listOptions}
              fields={fieldViews}
              label="Add your first subscriber"
            />
          )}
        </Card>
      ) : (
        <>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lists</TableHead>
                  <TableHead className="w-36 pr-4">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((s) => {
                  const status = statusStyle[s.status];
                  const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4 font-medium">{s.email}</TableCell>
                      <TableCell className={name ? undefined : "text-muted-foreground"}>
                        {name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {s.lists.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {s.lists.map((l) => (
                              <Badge key={l.id} variant="outline">
                                {l.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-muted-foreground">
                        {dateFormat.format(s.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          {total > subscribers.length && (
            <p className="text-sm text-muted-foreground">
              Showing the newest {numberFormat.format(subscribers.length)} of{" "}
              {numberFormat.format(total)}. Search and paging are coming next.
            </p>
          )}
        </>
      )}
    </div>
  );
}
