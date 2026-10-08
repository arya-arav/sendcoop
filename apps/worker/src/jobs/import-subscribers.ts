import {
  claimImport,
  finishImport,
  getSql,
  type ImportCounters,
  type ImportRow,
  importSubscriberBatch,
  listCustomFields,
  listLists,
  mappingProblem,
  mapRow,
  updateImportProgress,
  workspaceQuota,
} from "@sendcoop/db";
import type { ImportJob } from "@sendcoop/queue";
import { getStream, putStream, remove } from "@sendcoop/storage";
import { parse } from "csv-parse";
import { PassThrough, Transform } from "node:stream";

export const IMPORT_BATCH_SIZE = 1000;

/** New subscribers after which an import refreshes the table statistics. */
const ANALYZE_AFTER = 10_000;

/**
 * Imports one uploaded CSV. Streams the file (so memory stays flat whatever
 * its size), checks each row with the same mapRow the preview uses, writes
 * batches with importSubscriberBatch, saves progress after every batch, and
 * writes skipped rows to a CSV report.
 *
 * Row numbers match a spreadsheet: with a header row, the first subscriber is row 2.
 */
export async function processImport(
  { importId, workspaceId }: ImportJob,
  { batchSize = IMPORT_BATCH_SIZE, allowRestart = false } = {},
): Promise<void> {
  const upload = await claimImport(workspaceId, importId, { allowRestart });
  if (!upload) return; // not queued: already done, canceled, or a duplicate job

  const counters: ImportCounters = {
    processedRows: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    bytesProcessed: 0,
  };
  const started = performance.now();
  let peakRss = process.memoryUsage().rss;
  let peakHeap = process.memoryUsage().heapUsed;
  const reportKey = `imports/${workspaceId}/${importId}-skipped.csv`;
  const report = new PassThrough();
  const reportSaved = putStream(reportKey, report);
  report.write("row,email,reason\r\n");

  try {
    const [fields, lists] = await Promise.all([
      listCustomFields(workspaceId),
      listLists(workspaceId),
    ]);
    const mapping = upload.mapping!;
    // Fields may have been deleted since the mapping was saved.
    const problem = mappingProblem(mapping, upload.columns.length, fields);
    if (problem) throw new ImportError(problem);
    const ownLists = new Set(lists.map((l) => l.id));
    const listIds = upload.listIds.filter((id) => ownLists.has(id));
    const emailColumn = mapping.columns.indexOf("email");

    const seen = new Map<string, number>(); // email -> row number, to catch duplicates
    let batch: ImportRow[] = [];
    // New people beyond the plan's subscriber limit are skipped (D73).
    let room = (await workspaceQuota(workspaceId)).room.subscribers;

    const flush = async () => {
      const result = await importSubscriberBatch(workspaceId, batch, {
        listIds,
        updateExisting: upload.updateExisting,
        maxNew: room,
      });
      room -= result.created;
      for (const email of result.overLimit) {
        skip(seen.get(email) ?? 0, email, "Over your plan's subscriber limit.");
      }
      counters.createdCount += result.created;
      counters.updatedCount += result.updated;
      counters.skippedCount += result.unchanged;
      batch = [];
      const memory = process.memoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      peakHeap = Math.max(peakHeap, memory.heapUsed);
      await updateImportProgress(importId, counters);
    };

    const skip = (row: number, email: string, reason: string) => {
      counters.errorCount++;
      report.write(`${row},${csvCell(email)},${csvCell(reason)}\r\n`);
    };

    let recordIndex = 0;
    for await (const record of readRecords(upload, (bytes) => (counters.bytesProcessed += bytes))) {
      const rowNumber = recordIndex + 1;
      recordIndex++;
      if (upload.hasHeader && rowNumber === 1) continue;
      if (record.every((cell) => cell.trim() === "")) continue;
      counters.processedRows++;

      const mapped = mapRow(record, mapping, fields);
      if (!mapped.ok) {
        skip(rowNumber, (record[emailColumn] ?? "").trim(), mapped.errors.join(" "));
        continue;
      }
      const { email } = mapped.subscriber;
      const firstSeen = seen.get(email);
      if (firstSeen !== undefined) {
        skip(rowNumber, email, `Same email as row ${firstSeen}.`);
        continue;
      }
      seen.set(email, rowNumber);
      batch.push(mapped.subscriber);
      if (batch.length >= batchSize) await flush();
    }
    if (batch.length > 0) await flush();

    report.end();
    await reportSaved;
    if (counters.errorCount === 0) await remove(reportKey);
    const seconds = (performance.now() - started) / 1000;
    console.log(
      `[worker] import ${importId}: ${counters.processedRows} rows in ${seconds.toFixed(1)}s ` +
        `(${Math.round(counters.processedRows / seconds)}/s), peak memory ${Math.round(peakRss / 1024 / 1024)} MB (heap ${Math.round(peakHeap / 1024 / 1024)} MB)`,
    );
    // A big import can leave the planner's statistics far behind (it would
    // still think the list is empty, and count audiences very slowly).
    if (counters.createdCount >= ANALYZE_AFTER) {
      await getSql()`analyze subscribers`;
      await getSql()`analyze list_memberships`;
    }
    await finishImport(importId, {
      ...counters,
      status: "completed",
      errorReportKey: counters.errorCount > 0 ? reportKey : null,
    });
  } catch (error) {
    report.destroy();
    await reportSaved.catch(() => {});
    await remove(reportKey);
    const message =
      error instanceof ImportError
        ? error.message
        : "The import stopped unexpectedly. Subscribers imported so far were kept.";
    if (!(error instanceof ImportError)) {
      console.error(`[worker] import ${importId} failed`, error);
    }
    await finishImport(importId, { ...counters, status: "failed", error: message });
  }
}

/** Problems the user can fix; their message is shown as is. */
class ImportError extends Error {}

/** Parsed CSV records from storage, decoded with the encoding found at upload. */
function readRecords(
  upload: { fileKey: string; encoding: string; delimiter: string },
  onBytes: (bytes: number) => void,
): AsyncIterable<string[]> {
  const decoder = new TextDecoder(upload.encoding);
  const decode = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onBytes(chunk.length);
      callback(null, decoder.decode(chunk, { stream: true }));
    },
    flush(callback) {
      callback(null, decoder.decode());
    },
  });
  const parser = parse({
    delimiter: upload.delimiter,
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    // Blank lines are kept (and skipped by the caller) so row numbers match a
    // spreadsheet, where a blank line is still a row.
  });
  const source = getStream(upload.fileKey);
  source.on("error", (error) => parser.destroy(error));
  decode.on("error", (error) => parser.destroy(error));
  return source.pipe(decode).pipe(parser);
}

/** Quotes a value for the report CSV when needed. */
function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
