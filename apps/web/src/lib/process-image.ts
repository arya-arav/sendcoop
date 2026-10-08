import sharp from "sharp";

// Prepares an uploaded image for email: decoded and re-encoded (so only
// real images get through, never what the file claims to be), turned the
// right way up, stripped of metadata such as GPS location, and scaled to at
// most 1200px wide (emails are 600px; twice that for sharp screens).
// Formats are ones every email client shows: JPG, PNG and GIF.

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 1200;
const MAX_INPUT_PIXELS = 50_000_000;

export class ImageError extends Error {}

export type ProcessedImage = {
  data: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/gif";
  extension: "jpg" | "png" | "gif";
  width: number;
  height: number;
};

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  let hasAlpha = false;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    format = meta.format;
    hasAlpha = Boolean(meta.hasAlpha);
  } catch {
    throw new ImageError("That file isn't an image we can read. Use a JPG, PNG, GIF or WebP.");
  }
  if (format === "svg") {
    throw new ImageError("SVG images don't show in Gmail or Outlook. Use a PNG instead.");
  }
  if (!format || !["jpeg", "png", "gif", "webp"].includes(format)) {
    throw new ImageError("Use a JPG, PNG, GIF or WebP image.");
  }

  const animated = format === "gif";
  const image = sharp(input, { animated, limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true });

  // WebP isn't shown by Outlook on Windows: convert it like the others.
  const target =
    format === "gif" ? "gif" : format === "png" || (format === "webp" && hasAlpha) ? "png" : "jpg";
  const encoded =
    target === "gif"
      ? image.gif()
      : target === "png"
        ? image.png({ compressionLevel: 9 })
        : image.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true });
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });

  return {
    data,
    contentType: target === "gif" ? "image/gif" : target === "png" ? "image/png" : "image/jpeg",
    extension: target,
    width: info.width,
    // Animated GIFs report all frames stacked; one frame is the real height.
    height: info.pageHeight ?? info.height,
  };
}
