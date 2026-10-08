import { createHash } from "node:crypto";
import { addMedia, uploadLimitBytes } from "@sendcoop/db";
import { mediaConfigured, putMedia } from "@sendcoop/storage/media";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";
import { ImageError, MAX_IMAGE_UPLOAD_BYTES, processImage } from "@/lib/process-image";

// Image uploads from the template editor. The image is re-encoded on the
// server and stored publicly under a hash of its content, so email clients
// can load it and the same image is stored once.

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!mediaConfigured()) return jsonError(503, "Image uploads aren't set up on this server yet.");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_UPLOAD_BYTES + 64 * 1024) {
    return jsonError(413, "That image is over 10 MB. Use a smaller one.");
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError(400, "Choose an image to upload.");
  }
  if (!(file instanceof File) || file.size === 0) {
    return jsonError(400, "Choose an image to upload.");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return jsonError(413, "That image is over 10 MB. Use a smaller one.");
  }
  const planBytes = await uploadLimitBytes(access.workspace.id);
  if (planBytes !== null && file.size > planBytes) {
    return jsonError(
      413,
      `That image is over ${Math.round(planBytes / 1024 / 1024)} MB, the most your plan allows.`,
    );
  }

  let image;
  try {
    image = await processImage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImageError) return jsonError(400, error.message);
    throw error;
  }

  const hash = createHash("sha256").update(image.data).digest("hex").slice(0, 32);
  const key = `media/${access.workspace.id}/${hash}.${image.extension}`;
  const url = await putMedia(key, image.data, image.contentType);
  const saved = await addMedia(access.workspace.id, {
    key,
    url,
    fileName: file.name.slice(0, 200) || `image.${image.extension}`,
    contentType: image.contentType,
    width: image.width,
    height: image.height,
    bytes: image.data.length,
  });

  // The shape GrapesJS's asset manager expects.
  return Response.json({
    data: [
      {
        type: "image",
        src: saved.url,
        width: saved.width,
        height: saved.height,
        name: saved.fileName,
      },
    ],
  });
}
