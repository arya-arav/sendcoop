import {
  countSubscribers,
  listCustomFields,
  listLists,
  searchSubscribers,
  type SubscriberFilters as Filters,
  subscriberStatus,
  type SubscriberStatus,
} from "@sendcoop/db";
import { ChevronLeft, ChevronRight, SearchX, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { AddSubscriberButton } from "./add-subscriber";
import { SubscriberFilters } from "./subscriber-filters";

const PAGE_SIZE = 50;
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

// URL parameters are user input: anything invalid is ignored, not an error.
const searchParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(subscriberStatus.enumValues).optional().catch(undefined),
  list: z.uuid().optional().catch(undefined),
  after: z.uuid().optional().catch(undefined),
  before: z.uuid().optional().catch(undefined),
});

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = searchParamsSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const filters: Filters = { query: query.q, status: query.status, listId: query.list };
  const filtered = Boolean(query.q || query.status || query.list);

  const { workspace, role } = await requireMemberWorkspace(slug);
  const [page, workspaceTotal, lists, customFields] = await Promise.all([
    searchSubscribers(workspace.id, {
      filters,
      after: query.after,
      before: query.before,
      limit: PAGE_SIZE,
    }),
    // The unfiltered total tells "no subscribers yet" apart from "no matches".
    filtered ? countSubscribers(workspace.id) : null,
    listLists(workspace.id),
    listCustomFields(workspace.id),
  ]);
  const total = workspaceTotal ?? page.total;

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

  /** Same filters, different page. */
  function pageHref(cursor: { after?: string; before?: string }) {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    if (query.status) next.set("status", query.status);
    if (query.list) next.set("list", query.list);
    if (cursor.after) next.set("after", cursor.after);
    if (cursor.before) next.set("before", cursor.before);
    return `/w/${slug}/contacts?${next}`;
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total === 0
              ? "Everyone you can email from this workspace."
              : filtered
                ? `${numberFormat.format(page.total)} of ${numberFormat.format(total)} ${total === 1 ? "subscriber" : "subscribers"} match`
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
          <SubscriberFilters lists={listOptions} />

          {page.rows.length === 0 ? (
            <Card className="items-center gap-3 py-12 text-center">
              <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">No subscribers match</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search, or clear the filters.
                </p>
              </div>
            </Card>
          ) : (
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
                  {page.rows.map((s) => {
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
          )}

          {(page.prevCursor || page.nextCursor) && (
            <nav aria-label="Pages" className="flex items-center justify-end gap-2">
              {page.prevCursor ? (
                <Button
                  variant="outline"
                  render={<Link href={pageHref({ before: page.prevCursor })} />}
                >
                  <ChevronLeft />
                  Previous
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <ChevronLeft />
                  Previous
                </Button>
              )}
              {page.nextCursor ? (
                <Button
                  variant="outline"
                  render={<Link href={pageHref({ after: page.nextCursor })} />}
                >
                  Next
                  <ChevronRight />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Next
                  <ChevronRight />
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
