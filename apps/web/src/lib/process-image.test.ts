import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageError, processImage } from "./process-image";

const solid = (width: number, height: number, alpha = false) =>
  sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 200, g: 0, b: 0, alpha: 0.5 } : { r: 200, g: 0, b: 0 },
    },
  });

describe("processImage", () => {
  it("scales big photos down to 1200px wide and drops metadata", async () => {
    const input = await solid(3000, 2000)
      .withExif({ IFD0: { Copyright: "secret-owner" } })
      .jpeg()
      .toBuffer();
    const out = await processImage(input);
    expect(out).toMatchObject({
      contentType: "image/jpeg",
      extension: "jpg",
      width: 1200,
      height: 800,
    });
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("keeps small images their size, and PNGs as PNG", async () => {
    const out = await processImage(await solid(300, 100, true).png().toBuffer());
    expect(out).toMatchObject({ contentType: "image/png", width: 300, height: 100 });
  });

  it("turns WebP into JPG, or PNG when it has transparency", async () => {
    expect((await processImage(await solid(50, 50).webp().toBuffer())).contentType).toBe(
      "image/jpeg",
    );
    expect((await processImage(await solid(50, 50, true).webp().toBuffer())).contentType).toBe(
      "image/png",
    );
  });

  it("keeps GIFs as GIFs, with the height of one frame", async () => {
    const out = await processImage(await solid(80, 40).gif().toBuffer());
    expect(out).toMatchObject({ contentType: "image/gif", width: 80, height: 40 });
  });

  it("refuses SVG and anything that isn't an image", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    await expect(processImage(svg)).rejects.toThrow(/SVG images don't show/);
    await expect(processImage(Buffer.from("<html>not an image</html>"))).rejects.toBeInstanceOf(
      ImageError,
    );
  });
});
