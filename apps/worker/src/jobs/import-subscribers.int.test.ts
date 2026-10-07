import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import {
  createCustomField,
  createImport,
  createList,
  createSubscriber,
  deleteCustomField,
  getImport,
  getSql,
  type ImportMapping,
  queueImport,
  searchSubscribers,
} from "@sendcoop/db";
import { exists, getStream, putStream } from "@sendcoop/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processImport } from "./import-subscribers";

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let listId: string;
let planFieldId: string;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Worker import', ${`int-worker-${run}`}) returning id`;
  ws = row!.id;
  const list = await createList(ws, { name: "Imported", description: null });
  const plan = await createCustomField(ws, {
    key: "plan",
    label: "Plan",
    type: "dropdown",
    options: ["Starter", "Pro"],
  });
  if (!list.ok || !plan.ok) throw new Error("setup");
  listId = list.list.id;
  planFieldId = plan.field.id;
  await createSubscriber(ws, {
    email: "existing@example.com",
    firstName: "Existing",
    lastName: null,
    status: "unsubscribed",
  });
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

/** Stores a file and creates a queued import for it. */
async function queued(
  bytes: Uint8Array,
  format: { encoding: string; delimiter: string; hasHeader: boolean; columns: string[] },
  mapping: ImportMapping,
  options: { listIds?: string[]; updateExisting?: boolean } = {},
) {
  const fileKey = `imports/${ws}/${crypto.randomUUID()}.csv`;
  const fileSize = await putStream(fileKey, Readable.from([Buffer.from(bytes)]));
  const created = await createImport(ws, {
    createdBy: null,
    fileKey,
    fileName: "test.csv",
    fileSize,
    ...format,
    sampleRows: [],
    mapping,
  });
  await queueImport(ws, created.id, {
    mapping,
    listIds: options.listIds ?? [],
    updateExisting: options.updateExisting ?? false,
  });
  return created.id;
}

describe("processImport", () => {
  it("imports a messy UTF-8 file and reports the rows it skipped", async () => {
    const csv = [
      "Email,First name,Plan",
      "ana@example.com,Ana,Pro", // row 2: created
      "not-an-email,Bad,Pro", // row 3: invalid email
      "", // row 4: blank, ignored and not counted
      "bo@example.com,Bo,Gold", // row 5: bad plan
      "ANA@example.com,Ana again,Starter", // row 6: duplicate of row 2
      '"cy@example.com","Cy, the ""third""",Starter', // row 7: quoted
      "existing@example.com,Changed,Pro", // row 8: already here, unchanged
      ",,", // row 9: empty values only, ignored
      "dee@example.com,Dee,", // row 10: created, no plan
    ].join("\n");
    const id = await queued(
      new TextEncoder().encode(csv),
      {
        encoding: "utf-8",
        delimiter: ",",
        hasHeader: true,
        columns: ["Email", "First name", "Plan"],
      },
      { columns: ["email", "first_name", "field:plan"] },
      { listIds: [listId] },
    );

    await processImport({ importId: id, workspaceId: ws }, { batchSize: 2 });

    const result = await getImport(ws, id);
    expect(result).toMatchObject({
      status: "completed",
      processedRows: 7,
      totalRows: 7,
      createdCount: 3,
      updatedCount: 0,
      skippedCount: 1,
      errorCount: 3,
    });
    expect(result?.bytesProcessed).toBe(result?.fileSize);

    const cy = (await searchSubscribers(ws, { filters: { query: "cy@" } })).rows[0];
    expect(cy).toMatchObject({
      firstName: 'Cy, the "third"',
      fields: { plan: "Starter" },
      source: "import",
    });
    const existing = (await searchSubscribers(ws, { filters: { query: "existing@" } })).rows[0];
    expect(existing).toMatchObject({ firstName: "Existing", status: "unsubscribed" });

    // Everyone valid is on the list, including the existing subscriber.
    const [members] = await sql<{ n: number }[]>`
      select count(*)::int as n from list_memberships where list_id = ${listId}`;
    expect(members?.n).toBe(4);

    const report = await text(getStream(result!.errorReportKey!));
    expect(report.trim().split("\r\n")).toEqual([
      "row,email,reason",
      "3,not-an-email,“not-an-email” isn't a valid email.",
      '5,bo@example.com,"Plan must be one of: Starter, Pro."',
      "6,ana@example.com,Same email as row 2.",
    ]);
  });

  it("reads Windows-1252 files without a header and updates existing subscribers", async () => {
    // "Müller" and "Zoë" in Windows-1252, separated by semicolons, no header row.
    const encode = (s: string) =>
      Uint8Array.from([...s].map((c) => ({ ü: 0xfc, ë: 0xeb })[c] ?? c.charCodeAt(0)));
    const id = await queued(
      encode("existing@example.com;Müller\nzoe@example.com;Zoë\n"),
      {
        encoding: "windows-1252",
        delimiter: ";",
        hasHeader: false,
        columns: ["Column 1", "Column 2"],
      },
      { columns: ["email", "last_name"] },
      { updateExisting: true },
    );

    await processImport({ importId: id, workspaceId: ws });

    expect(await getImport(ws, id)).toMatchObject({
      status: "completed",
      processedRows: 2,
      createdCount: 1,
      updatedCount: 1,
      errorCount: 0,
      errorReportKey: null,
    });
    const existing = (await searchSubscribers(ws, { filters: { query: "existing@" } })).rows[0];
    expect(existing).toMatchObject({ lastName: "Müller", status: "unsubscribed" });
    expect((await searchSubscribers(ws, { filters: { query: "zoe@" } })).rows[0]?.lastName).toBe(
      "Zoë",
    );
  });

  it("fails with a clear message if a mapped field was deleted", async () => {
    const id = await queued(
      new TextEncoder().encode("email,plan\nx@example.com,Pro\n"),
      { encoding: "utf-8", delimiter: ",", hasHeader: true, columns: ["email", "plan"] },
      { columns: ["email", "field:plan"] },
    );
    await deleteCustomField(ws, planFieldId);

    await processImport({ importId: id, workspaceId: ws });

    const result = await getImport(ws, id);
    expect(result).toMatchObject({
      status: "failed",
      error: "A column is mapped to a field that no longer exists.",
      createdCount: 0,
    });
    expect(await exists(`imports/${ws}/${id}-skipped.csv`)).toBe(false);
  });

  it("does nothing for an import that isn't queued", async () => {
    const id = await queued(
      new TextEncoder().encode("email\nonce@example.com\n"),
      { encoding: "utf-8", delimiter: ",", hasHeader: true, columns: ["email"] },
      { columns: ["email"] },
    );
    await processImport({ importId: id, workspaceId: ws });
    const first = await getImport(ws, id);
    // A duplicate job for the same import must not run it again.
    await processImport({ importId: id, workspaceId: ws });
    expect(await getImport(ws, id)).toEqual(first);
  });
});
