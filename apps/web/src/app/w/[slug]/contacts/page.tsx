import {
  countSubscribers,
  listCustomFields,
  listLists,
  getSegment,
  listSegments,
  listTags,
  searchSubscribers,
  type SubscriberFilters as Filters,
  subscriberStatus,
} from "@sendcoop/db";
import {
  ChevronLeft,
  ChevronRight,
  FileUp,
  ShieldBan,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { AddSubscriberButton } from "./add-subscriber";
import { SubscriberFilters } from "./subscriber-filters";
import { SubscriberTable } from "./subscriber-table";

const PAGE_SIZE = 50;
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const numberFormat = new Intl.NumberFormat("en");

// URL parameters are user input: anything invalid is ignored, not an error.
const searchParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(subscriberStatus.enumValues).optional().catch(undefined),
  list: z.uuid().optional().catch(undefined),
  tag: z.uuid().optional().catch(undefined),
  segment: z.uuid().optional().catch(undefined),
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
  const { workspace, role } = await requireMemberWorkspace(slug);
  // A segment id from the URL only counts if it belongs to this workspace.
  const segment = query.segment ? await getSegment(workspace.id, query.segment) : null;
  /** Filters as the browser knows them (ids); the server resolves the segment. */
  const viewFilters = {
    query: query.q,
    status: query.status,
    listId: query.list,
    tagId: query.tag,
    segmentId: segment?.id,
  };
  const filters: Filters = { ...viewFilters, segment: segment?.rules };
  const filtered = Boolean(query.q || query.status || query.list || query.tag || segment);

  const [page, workspaceTotal, lists, customFields, tags, segments] = await Promise.all([
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
    listTags(workspace.id),
    listSegments(workspace.id),
  ]);
  const segmentOptions = segments.map(({ id, name }) => ({ id, name }));
  const tagOptions = tags.map(({ id, name }) => ({ id, name }));
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
    if (query.tag) next.set("tag", query.tag);
    if (segment) next.set("segment", segment.id);
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
          <Button variant="outline" render={<Link href={`/w/${slug}/contacts/suppressions`} />}>
            <ShieldBan />
            Suppression list
          </Button>
          {editable && (
            <Button variant="outline" render={<Link href={`/w/${slug}/contacts/import`} />}>
              <FileUp />
              Import
            </Button>
          )}
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
                ? "Import a CSV or add people one at a time. Signup forms are coming."
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
          <SubscriberFilters lists={listOptions} tags={tagOptions} segments={segmentOptions} />

          <SubscriberTable
            // A new page or filter starts a fresh selection.
            key={JSON.stringify([filters, query.after, query.before])}
            slug={slug}
            rows={page.rows.map((r) => ({
              id: r.id,
              email: r.email,
              name: [r.firstName, r.lastName].filter(Boolean).join(" "),
              status: r.status,
              lists: r.lists,
              tags: r.tags,
              added: dateFormat.format(r.createdAt),
            }))}
            total={page.total}
            filters={viewFilters}
            lists={listOptions}
            tags={tagOptions}
            editable={editable}
          />

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
