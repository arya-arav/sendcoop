import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileMjml, GMAIL_CLIP_BYTES } from "./compile-mjml";
import { emailBlocks, emailFromBlocks } from "./email-blocks";

const ASSETS = "https://app.sendcoop.test/email";
const blocks = emailBlocks(ASSETS);

describe("email blocks", () => {
  it("are the six the editor offers", () => {
    expect(blocks.map((b) => b.label)).toEqual([
      "Header",
      "Text",
      "Button",
      "Image",
      "Product",
      "Footer",
    ]);
  });

  it.each(blocks.map((b) => [b.label, b.id] as const))(
    "%s compiles cleanly, with Outlook's table layout",
    async (_label, id) => {
      const out = await compileMjml(emailFromBlocks(ASSETS, [id]));
      expect(out.errors).toEqual([]);
      // Outlook (Word engine) gets fixed-width tables in conditional comments.
      expect(out.html).toContain("<!--[if mso | IE]>");
      expect(out.html).toMatch(/<table[^>]*role="presentation"/);
    },
  );

  it("make a full email that stacks on phones and stays under Gmail's clipping size", async () => {
    const out = await compileMjml(
      emailFromBlocks(
        ASSETS,
        blocks.map((b) => b.id),
      ),
    );
    expect(out.errors).toEqual([]);
    expect(out.clipped).toBe(false);
    expect(out.bytes).toBeLessThan(GMAIL_CLIP_BYTES / 2);
    // Columns are side by side from 480px and full width below.
    expect(out.html).toMatch(/@media only screen and \(min-width:480px\)/);
    // Images have alt text and absolute URLs; merge tags survive.
    expect(out.html).not.toMatch(/<img(?![^>]*alt="[^"]+")[^>]*>/);
    expect(out.html).toContain(`src="${ASSETS}/product.png"`);
    expect(out.html).toContain('href="{{unsubscribe_url}}"');
  });
});

describe("compileMjml", () => {
  it("reports mistakes without failing", async () => {
    const out = await compileMjml(
      '<mjml><mj-body><mj-section><mj-column><mj-text colour="red">Hi</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    expect(out.html).toContain("Hi");
    expect(out.errors.join()).toMatch(/colour/);
  });

  it("never includes files from the server", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mjml-"));
    const secret = join(dir, "secret.mjml");
    writeFileSync(
      secret,
      "<mj-section><mj-column><mj-text>SECRET</mj-text></mj-column></mj-section>",
    );
    try {
      const out = await compileMjml(
        `<mjml><mj-body><mj-include path="${secret.replaceAll("\\", "/")}" /></mj-body></mjml>`,
      );
      expect(out.html).not.toContain("SECRET");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
