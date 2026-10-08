import {
  createImport,
  featureProblem,
  findMemberWorkspace,
  listCustomFields,
  suggestMapping,
  uploadLimitBytes,
} from "@sendcoop/db";
import { FileTooLargeError, putStream, readHead, remove } from "@sendcoop/storage";
import { headers } from "next/headers";
import { crossSite } from "@/lib/api-auth";
import { auth } from "@/lib/auth";
import { CsvFormatError, detectCsvFormat, MAX_IMPORT_BYTES } from "@/lib/csv-format";
import { canManage } from "@/lib/permissions";

const HEAD_BYTES = 256 * 1024;

const error = (status: number, message: string) => Response.json({ error: message }, { status });

/**
 * Upload a CSV for import. The browser sends the raw file as the request body
 * (not multipart), so it streams to storage without being held in memory.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Cookie auth: only accept requests from our own pages (always with an Origin).
  if (!request.headers.get("origin") || crossSite(request.headers)) {
    return error(403, "Cross-site upload refused.");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return error(401, "Log in again to upload.");
  const membership = await findMemberWorkspace(session.user.id, (await params).slug);
  if (!membership) return error(404, "Workspace not found.");
  if (!canManage(membership.role)) {
    return error(403, "Only workspace owners and admins can import subscribers.");
  }

  // The plan: whether it imports at all, and how big a file (D73+).
  const blocked = await featureProblem(membership.workspace.id, "importContacts");
  if (blocked) return error(403, blocked);
  const planBytes = await uploadLimitBytes(membership.workspace.id);
  const maxBytes = Math.min(MAX_IMPORT_BYTES, planBytes ?? MAX_IMPORT_BYTES);
  const tooLarge = `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB${
    maxBytes < MAX_IMPORT_BYTES ? ", the most your plan allows" : ""
  }.`;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return error(413, tooLarge);
  if (!request.body) return error(400, "Choose a CSV file to upload.");

  const fileName = (decodeURIComponent(request.headers.get("x-file-name") ?? "") || "import.csv")
    .replace(/[\r\n]/g, "")
    .slice(0, 200);
  const workspaceId = membership.workspace.id;
  const fileKey = `imports/${workspaceId}/${crypto.randomUUID()}.csv`;

  let fileSize: number;
  try {
    fileSize = await putStream(fileKey, request.body, { maxBytes });
  } catch (cause) {
    if (cause instanceof FileTooLargeError) return error(413, tooLarge);
    throw cause;
  }
  if (fileSize === 0) {
    await remove(fileKey);
    return error(400, "The file is empty.");
  }

  try {
    const head = await readHead(fileKey, HEAD_BYTES);
    const format = detectCsvFormat(head, fileSize <= HEAD_BYTES);
    const fields = await listCustomFields(workspaceId);
    const created = await createImport(workspaceId, {
      createdBy: session.user.id,
      fileKey,
      fileName,
      fileSize,
      ...format,
      mapping: suggestMapping(format.columns.length, {
        headers: format.hasHeader ? format.columns : null,
        sampleRows: format.sampleRows,
        fields,
      }),
    });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (cause) {
    await remove(fileKey);
    if (cause instanceof CsvFormatError) return error(422, cause.message);
    throw cause;
  }
}
