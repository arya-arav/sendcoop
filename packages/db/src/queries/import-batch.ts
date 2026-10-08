import { getSql } from "../client";
import type { FieldValue } from "../custom-fields";

export type ImportRow = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  fields: Record<string, FieldValue>;
};

export type BatchResult = {
  /** New subscribers. */
  created: number;
  /** Existing subscribers whose name or fields changed (only with updateExisting). */
  updated: number;
  /** Existing subscribers left as they were. */
  unchanged: number;
  /** New people left out: the plan's subscriber limit was reached (D73). */
  overLimit: string[];
};

/**
 * Writes one batch of import rows in a single transaction. Emails must already
 * be normalised and unique within the batch. Arrays are passed through unnest(),
 * so a batch is a handful of parameters however many rows it has.
 *
 * New people are created as subscribed (source "import"). Existing people keep
 * their status; with updateExisting, non-empty names and fields from the file
 * are written over theirs. Everyone in the batch is added to listIds, which the
 * caller must have checked belong to the workspace.
 */
export async function importSubscriberBatch(
  workspaceId: string,
  rows: ImportRow[],
  {
    listIds,
    updateExisting,
    maxNew = Infinity,
  }: { listIds: string[]; updateExisting: boolean; maxNew?: number },
): Promise<BatchResult> {
  if (rows.length === 0) return { created: 0, updated: 0, unchanged: 0, overLimit: [] };

  // Over the plan's limit, only the first maxNew new people are added.
  let overLimit: string[] = [];
  if (Number.isFinite(maxNew)) {
    const known = new Set(
      (
        await getSql()<{ email: string }[]>`
          select email from subscribers
          where workspace_id = ${workspaceId} and email = any(${rows.map((r) => r.email)}::text[])`
      ).map((r) => r.email),
    );
    const fresh = rows.filter((r) => !known.has(r.email));
    if (fresh.length > maxNew) {
      overLimit = fresh.slice(Math.max(0, maxNew)).map((r) => r.email);
      const left = new Set(overLimit);
      rows = rows.filter((r) => !left.has(r.email));
      if (rows.length === 0) return { created: 0, updated: 0, unchanged: 0, overLimit };
    }
  }

  const emails = rows.map((r) => r.email);
  const firstNames = rows.map((r) => r.firstName);
  const lastNames = rows.map((r) => r.lastName);
  const fields = rows.map((r) => JSON.stringify(r.fields));

  return getSql().begin(async (sql) => {
    const inserted = await sql<{ id: string }[]>`
      insert into subscribers
        (workspace_id, email, first_name, last_name, fields, status, source, subscribed_at)
      select ${workspaceId}, t.email, t.first_name, t.last_name, t.fields::jsonb,
             'subscribed', 'import', now()
      from unnest(${emails}::text[], ${firstNames}::text[], ${lastNames}::text[], ${fields}::text[])
        as t(email, first_name, last_name, fields)
      on conflict (workspace_id, email) do nothing
      returning id`;

    const existing = await sql<{ id: string }[]>`
      select id from subscribers
      where workspace_id = ${workspaceId}
        and email = any(${emails}::text[])
        and id <> all(${inserted.map((r) => r.id)}::uuid[])`;

    let updated = 0;
    if (updateExisting && existing.length > 0) {
      // Only rows where something actually changes count as updated.
      const result = await sql`
        update subscribers s set
          first_name = coalesce(t.first_name, s.first_name),
          last_name = coalesce(t.last_name, s.last_name),
          fields = s.fields || t.fields::jsonb,
          updated_at = now()
        from unnest(${emails}::text[], ${firstNames}::text[], ${lastNames}::text[], ${fields}::text[])
          as t(email, first_name, last_name, fields)
        where s.workspace_id = ${workspaceId}
          and s.email = t.email
          and s.id = any(${existing.map((r) => r.id)}::uuid[])
          and (
            (t.first_name is not null and t.first_name is distinct from s.first_name)
            or (t.last_name is not null and t.last_name is distinct from s.last_name)
            or not (s.fields @> t.fields::jsonb)
          )`;
      updated = result.count;
    }

    if (listIds.length > 0) {
      const ids = [...inserted, ...existing].map((r) => r.id);
      await sql`
        insert into list_memberships (list_id, subscriber_id)
        select l, s from unnest(${listIds}::uuid[]) l cross join unnest(${ids}::uuid[]) s
        on conflict do nothing`;
    }

    return {
      created: inserted.length,
      updated,
      unchanged: existing.length - updated,
      overLimit,
    };
  });
}
