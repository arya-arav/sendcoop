import { apiListSubscribers, featureProblem, listCustomFields } from "@sendcoop/db";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";

/** Quotes a CSV cell, and stops spreadsheets reading it as a formula. */
function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : "");

/**
 * Downloads every subscriber as CSV: their details, custom fields (one
 * column each) and list ids. Streams a page at a time, so any size works.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  const workspaceId = access.workspace.id;
  const blocked = await featureProblem(workspaceId, "exportContacts");
  if (blocked) return jsonError(403, blocked);

  const fields = await listCustomFields(workspaceId);
  const header = [
    "email",
    "first_name",
    "last_name",
    "status",
    "source",
    "subscribed_at",
    "unsubscribed_at",
    "created_at",
    ...fields.map((f) => f.key),
    "lists",
  ];
  const encoder = new TextEncoder();
  let cursor: string | null = null;
  let done = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${header.map(csvCell).join(",")}\r\n`));
    },
    async pull(controller) {
      if (done) return controller.close();
      const page = await apiListSubscribers(workspaceId, { limit: 1000, cursor });
      const lines = page.rows.map((s) =>
        [
          s.email,
          s.firstName,
          s.lastName,
          s.status,
          s.source,
          iso(s.subscribedAt),
          iso(s.unsubscribedAt),
          iso(s.createdAt),
          ...fields.map((f) => (s.fields as Record<string, unknown>)[f.key]),
          s.lists.join(" "),
        ]
          .map(csvCell)
          .join(","),
      );
      if (lines.length > 0) controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
      cursor = page.nextCursor;
      if (!cursor) done = true;
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-subscribers.csv"`,
      "cache-control": "no-store",
    },
  });
}
