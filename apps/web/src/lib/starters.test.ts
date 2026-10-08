import { describe, expect, it } from "vitest";
import { compileMjml } from "./compile-mjml";
import { STARTERS } from "./starters";

const ASSETS = "https://app.sendcoop.test/email";

describe("starter templates", () => {
  it("are ten, covering affiliate, ecommerce, lead generation and newsletters", () => {
    expect(STARTERS).toHaveLength(10);
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(10);
    expect(new Set(STARTERS.map((s) => s.category))).toEqual(
      new Set(["Affiliate", "Ecommerce", "Lead generation", "Newsletter"]),
    );
  });

  it.each(STARTERS.map((s) => [s.name, s] as const))(
    "%s compiles cleanly and is ready to send",
    async (_name, starter) => {
      const out = await compileMjml(starter.mjml(ASSETS));
      expect(out.errors).toEqual([]);
      expect(out.clipped).toBe(false);
      expect(out.html).toContain("<!--[if mso | IE]>");
      // Legally required: an unsubscribe link and a postal address.
      expect(out.html).toContain('href="{{unsubscribe_url}}"');
      expect(out.html).toContain("Your Company, 123 Street");
      // Every image has alt text.
      expect(out.html).not.toMatch(/<img(?![^>]*alt="[^"]+")[^>]*>/);
      expect(starter.subject.length).toBeGreaterThan(5);
    },
  );
});
