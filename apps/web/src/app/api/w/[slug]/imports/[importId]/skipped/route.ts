import { Readable } from "node:stream";
import { getImport } from "@sendcoop/db";
import { exists, getStream } from "@sendcoop/storage";
import { z } from "zod";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";

/** Downloads the CSV of rows an import skipped, with the reason for each. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; importId: string }> },
) {
  const { slug, importId } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!z.uuid().safeParse(importId).success) return jsonError(404, "Import not found.");

  const upload = await getImport(access.workspace.id, importId);
  if (!upload?.errorReportKey || !(await exists(upload.errorReportKey))) {
    return jsonError(404, "No skipped rows for this import.");
  }

  const name = upload.fileName.replace(/\.(csv|txt)$/i, "").replace(/[^\w.-]+/g, "_");
  return new Response(Readable.toWeb(getStream(upload.errorReportKey)) as ReadableStream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-skipped-rows.csv"`,
      "cache-control": "no-store",
    },
  });
}
