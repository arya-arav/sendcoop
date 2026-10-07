import { getImport } from "@sendcoop/db";
import { z } from "zod";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";

/** Import progress, polled by the import page while it runs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; importId: string }> },
) {
  const { slug, importId } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!z.uuid().safeParse(importId).success) return jsonError(404, "Import not found.");

  const upload = await getImport(access.workspace.id, importId);
  if (!upload) return jsonError(404, "Import not found.");

  return Response.json(
    {
      status: upload.status,
      fileSize: upload.fileSize,
      bytesProcessed: upload.bytesProcessed,
      processedRows: upload.processedRows,
      createdCount: upload.createdCount,
      updatedCount: upload.updatedCount,
      skippedCount: upload.skippedCount,
      errorCount: upload.errorCount,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
