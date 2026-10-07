import { describe, expect, it } from "vitest";
import { htmlToText } from "./html-to-text";

describe("htmlToText", () => {
  it("keeps the words and paragraphs, drops styles, head and comments", () => {
    const html = `<!doctype html><html><head><title>x</title><style>p{color:red}</style></head>
      <body><!--[if mso]><table><tr><td><![endif]-->
      <h1>Big   sale</h1><p>Save <b>40%</b> today&nbsp;only &amp; free shipping.</p>
      <p>Line one<br>Line two</p><ul><li>Shoes</li><li>Bags</li></ul></body></html>`;
    expect(htmlToText(html)).toBe(
      "Big sale\n\nSave 40% today only & free shipping.\n\nLine one\nLine two\n\n- Shoes\n\n- Bags",
    );
  });

  it("writes links as text and URL, keeping merge tags", () => {
    expect(
      htmlToText(
        '<p><a href="https://shop.test/?a=1&amp;b=2">Shop now</a> or ' +
          '<a href="https://shop.test">https://shop.test</a>. ' +
          '<a href="{{unsubscribe_url}}">Unsubscribe</a> <a href="#top">Top</a></p>',
      ),
    ).toBe(
      "Shop now (https://shop.test/?a=1&b=2) or https://shop.test. Unsubscribe ({{unsubscribe_url}}) Top",
    );
  });

  it("uses image alt text and decodes numeric entities", () => {
    expect(
      htmlToText('<img src="logo.png" alt="Acme"><p>&#169; 2026 &#x2014; Acme&rsquo;s</p>'),
    ).toBe("Acme© 2026 — Acme’s");
  });
});
