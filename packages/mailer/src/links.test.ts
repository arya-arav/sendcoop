import { describe, expect, it } from "vitest";
import { extractLinks, rewriteLinks } from "./links";

describe("extractLinks", () => {
  it("finds each link in an HTML email in order, with its text or image alt", () => {
    const html = `
      <a href="https://shop.test/sale?a=1&amp;b=2" class="btn"><span>Shop the sale</span></a>
      <a href='https://vendor.hop.clickbank.net/?affiliate=me'><img src="x.png" alt="Get it"></a>
      <a href="https://shop.test/sale?a=1&amp;b=2">Shop again</a>
      <a href="mailto:hi@shop.test">Email us</a> <a href="#top">Top</a> <a href="tel:123">Call</a>
      <a href="{{unsubscribe_url}}">Unsubscribe</a>
      <a href="https://shop.test/u?e={{email}}">Your page</a>`;
    expect(extractLinks(html, "")).toEqual([
      { url: "https://shop.test/sale?a=1&b=2", label: "Shop the sale", position: 0 },
      { url: "https://vendor.hop.clickbank.net/?affiliate=me", label: "Get it", position: 1 },
      { url: "https://shop.test/sale?a=1&b=2", label: "Shop again", position: 2 },
      { url: "https://shop.test/u?e={{email}}", label: "Your page", position: 3 },
    ]);
  });

  it("finds bare URLs in plain-text emails, without trailing punctuation", () => {
    const text =
      "Read it at https://blog.test/post. Or (https://blog.test/b), and {{unsubscribe_url}}";
    expect(extractLinks("", text)).toEqual([
      { url: "https://blog.test/post", label: null, position: 0 },
      { url: "https://blog.test/b", label: null, position: 1 },
    ]);
  });
});

describe("rewriteLinks", () => {
  const track = (position: number) => `https://t.test/c/${position}`;

  it("swaps each tracked link in HTML, and the same URLs in its text version", () => {
    const out = rewriteLinks(
      {
        html: '<a href="https://shop.test/a?x=1&amp;y=2">A</a> <a href="mailto:x@y.z">M</a> <a class="b" href=\'https://shop.test/b\'>B</a> <a href="{{unsubscribe_url}}">U</a>',
        text: "A (https://shop.test/a?x=1&y=2) B (https://shop.test/b). Other https://other.test",
      },
      track,
    );
    expect(out.html).toBe(
      '<a href="https://t.test/c/0">A</a> <a href="mailto:x@y.z">M</a> <a class="b" href=\'https://t.test/c/1\'>B</a> <a href="{{unsubscribe_url}}">U</a>',
    );
    expect(out.text).toBe(
      "A (https://t.test/c/0) B (https://t.test/c/1). Other https://other.test",
    );
  });

  it("swaps bare URLs in plain-text emails by position, keeping punctuation", () => {
    expect(
      rewriteLinks({ html: "", text: "See https://a.test/x. And https://a.test/x!" }, track),
    ).toEqual({
      html: "",
      text: "See https://t.test/c/0. And https://t.test/c/1!",
    });
  });

  it("leaves links alone when there's nothing to track them with", () => {
    const body = { html: '<a href="https://a.test">A</a>', text: "https://a.test" };
    expect(rewriteLinks(body, () => null)).toEqual(body);
  });
});
