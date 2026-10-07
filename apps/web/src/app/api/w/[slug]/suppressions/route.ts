import { addSuppressions, streamSuppressions } from "@sendcoop/db";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";
import { extractEmails, MAX_SUPPRESSION_FILE_BYTES } from "@/lib/suppression-input";

/** Quotes a CSV cell, and stops spreadsheets reading it as a formula. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Downloads the workspace's suppression list as CSV. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;

  const encoder = new TextEncoder();
  const pages = streamSuppressions(access.workspace.id);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("email,reason,added_at\r\n"));
    },
    async pull(controller) {
      const next = await pages.next();
      if (next.done) return controller.close();
      const lines = next.value.map((r) => `${csvCell(r.email)},${r.reason},${r.added_at}\r\n`);
      controller.enqueue(encoder.encode(lines.join("")));
    },
    async cancel() {
      await pages.return(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-suppression-list.csv"`,
      "cache-control": "no-store",
    },
  });
}

/** Adds pasted addresses (field "addresses") and/or an uploaded file (field "file"). */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Paste addresses or choose a file.");
  }
  const pasted = form.get("addresses");
  const file = form.get("file");
  let text = typeof pasted === "string" ? pasted : "";
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SUPPRESSION_FILE_BYTES) {
      return jsonError(413, "That file is too large. Split it into files under 20 MB.");
    }
    text += `\n${await file.text()}`;
  }
  const { emails, invalid } = extractEmails(text);
  if (emails.length === 0) {
    return jsonError(400, "No email addresses found. Put one address on each line.");
  }

  const added = await addSuppressions(access.workspace.id, emails, "manual");
  return Response.json({ added, alreadyListed: emails.length - added, invalid });
}
