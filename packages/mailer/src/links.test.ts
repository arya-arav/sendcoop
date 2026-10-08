import { describe, expect, it } from "vitest";
import { extractLinks } from "./links";

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
