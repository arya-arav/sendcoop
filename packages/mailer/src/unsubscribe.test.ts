import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildRawMessage, listUnsubscribeHeaders, withUnsubscribeLink } from "./index";

const URL = "https://app.test/u/abc.def";

describe("withUnsubscribeLink", () => {
  it("fills in {{unsubscribe_url}} wherever the design has it", () => {
    const out = withUnsubscribeLink(
      {
        html: '<a href="{{unsubscribe_url}}">Leave</a> or <a href="{{ unsubscribe_url }}">here</a>',
        text: "Leave: {{unsubscribe_url}}",
      },
      URL,
    );
    expect(out.html).toBe(`<a href="${URL}">Leave</a> or <a href="${URL}">here</a>`);
    expect(out.text).toBe(`Leave: ${URL}`);
  });

  it("adds a footer before </body> when the design has no link", () => {
    const out = withUnsubscribeLink(
      { html: "<html><body><p>Hi</p></body></html>", text: "Hi\n" },
      URL,
    );
    expect(out.html).toMatch(
      new RegExp(
        `<p>Hi</p><p [^>]+>Don't want these emails\\? <a href="${URL}"[^>]*>Unsubscribe</a></p></body></html>$`,
      ),
    );
    expect(out.text).toBe(`Hi\n\n--\nUnsubscribe: ${URL}\n`);
  });

  it("appends the footer to a fragment and escapes the link", () => {
    const out = withUnsubscribeLink({ html: "<p>Hi</p>", text: "Hi" }, "https://a.test/?x=1&y=2");
    expect(out.html).toMatch(/^<p>Hi<\/p><p .*href="https:\/\/a\.test\/\?x=1&#38;y=2"/);
  });
});

describe("listUnsubscribeHeaders", () => {
  it("are DKIM-signed, as Gmail and Yahoo require", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const headers = listUnsubscribeHeaders("https://app.test/api/unsubscribe/abc.def");
    expect(headers).toEqual({
      "List-Unsubscribe": "<https://app.test/api/unsubscribe/abc.def>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    const raw = await buildRawMessage(
      {
        from: { email: "news@mail.acme.test" },
        to: "reader@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
        text: "Hi",
        headers,
      },
      {
        domainName: "mail.acme.test",
        keySelector: "sc1",
        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      },
    );
    const text = raw.toString();
    expect(text).toContain("List-Unsubscribe: <https://app.test/api/unsubscribe/abc.def>");
    expect(text).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    const signed = text.match(/DKIM-Signature:[\s\S]*?\bh=([^;]+);/)?.[1]?.replace(/\s/g, "");
    expect(signed?.toLowerCase().split(":")).toEqual(
      expect.arrayContaining(["list-unsubscribe", "list-unsubscribe-post"]),
    );
  });
});

describe("plain-text emails", () => {
  it("get the unsubscribe link in the text only, and no HTML part", async () => {
    const out = withUnsubscribeLink({ html: "", text: "Hi Ana" }, URL);
    expect(out.html).toBe("");
    expect(out.text).toBe(`Hi Ana\n\n--\nUnsubscribe: ${URL}\n`);
    const raw = (
      await buildRawMessage({
        from: { email: "news@mail.acme.test" },
        to: "ana@example.com",
        subject: "Quick question",
        ...out,
      })
    ).toString();
    expect(raw).toMatch(/^Content-Type: text\/plain/m);
    expect(raw).not.toContain("text/html");
  });
});
