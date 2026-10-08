import { describe, expect, it } from "vitest";
import { mergeValuesFor, personalize, renderContent, seededRandom } from "./personalize";

const values = mergeValuesFor({
  email: "ana@example.com",
  firstName: "Ana",
  lastName: null,
  fields: { plan: "Pro", credits: 0, company: "Tom & Jerry <Ltd>" },
});

describe("merge tags", () => {
  it("fill in built-ins and custom fields, ignoring spacing and case", () => {
    expect(
      renderContent(
        "Hi {{first_name}} ({{ EMAIL }}), {{full_name}} on {{plan}}: {{credits}}",
        values,
      ),
    ).toBe("Hi Ana (ana@example.com), Ana on Pro: 0");
  });

  it("use the fallback when the value is missing or blank", () => {
    expect(renderContent("Hi {{last_name | there}}!", values)).toBe("Hi there!");
    expect(renderContent('Hi {{ unknown_field | "dear reader" }}!', values)).toBe(
      "Hi dear reader!",
    );
    expect(renderContent("Hi {{nickname}}!", values)).toBe("Hi !");
    expect(renderContent("{{first_name|friend}}", values)).toBe("Ana");
  });

  it("escape subscriber data in HTML, but not the author's fallback markup", () => {
    expect(renderContent("<p>{{company}}</p>", values, { html: true })).toBe(
      "<p>Tom &#38; Jerry &#60;Ltd&#62;</p>",
    );
    expect(renderContent("<p>{{company}}</p>", values)).toBe("<p>Tom & Jerry <Ltd></p>");
    expect(renderContent("{{last_name | Fish &amp; Chips}}", values, { html: true })).toBe(
      "Fish &amp; Chips",
    );
  });

  it("leave kept tags for a later step", () => {
    expect(
      renderContent('<a href="{{ unsubscribe_url }}">x</a>', values, {
        html: true,
        keep: ["unsubscribe_url"],
      }),
    ).toBe('<a href="{{ unsubscribe_url }}">x</a>');
  });
});

describe("spintax", () => {
  const random = () => seededRandom("seed");

  it("picks one option per group, nested groups included", () => {
    for (let i = 0; i < 50; i++) {
      const out = renderContent("{Hi|Hello|Hey} there, {big {sale|deal}|new arrivals}!", values, {
        random: seededRandom(`r${i}`),
      });
      expect(out).toMatch(/^(Hi|Hello|Hey) there, (big (sale|deal)|new arrivals)!$/);
    }
  });

  it("uses every option across recipients", () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) =>
        renderContent("{a|b|c}", values, { random: seededRandom(`m${i}`) }),
      ),
    );
    expect(seen).toEqual(new Set(["a", "b", "c"]));
  });

  it("is repeatable for the same seed", () => {
    const template = "{one|two|three|four|five|six}";
    expect(renderContent(template, values, { random: random() })).toBe(
      renderContent(template, values, { random: random() }),
    );
  });

  it("leaves CSS, scripts, comments and pipe-less braces alone", () => {
    const html =
      "<style>a{color:red}@media (max-width:600px){p{margin:0}}</style>" +
      "<!--[if mso]>{x|y}<![endif]--><p>{Hi|Hi}</p><p>{not spintax}</p>";
    expect(renderContent(html, values, { html: true, random: random() })).toBe(
      "<style>a{color:red}@media (max-width:600px){p{margin:0}}</style>" +
        "<!--[if mso]>{x|y}<![endif]--><p>Hi</p><p>{not spintax}</p>",
    );
  });

  it("never treats tags, fallbacks or subscriber data as spintax", () => {
    const tricky = mergeValuesFor({
      email: "x@example.com",
      firstName: "{A|B}",
      lastName: null,
      fields: null,
    });
    expect(
      renderContent("{{first_name}} {{last_name | a|b}} {Hi|Hi}", tricky, { random: random() }),
    ).toBe("{A|B} a|b Hi");
  });
});

describe("personalize", () => {
  it("renders subject, HTML and text for one recipient", () => {
    const out = personalize(
      {
        subject: "{{first_name | Friend}}, {your|a} gift",
        html: '<p>Hi {{first_name}}</p><a href="{{unsubscribe_url}}">Leave</a>',
        text: "Hi {{first_name}}\nLeave: {{unsubscribe_url}}",
      },
      values,
      "019a0000-0000-7000-8000-000000000001",
    );
    expect(out.subject).toMatch(/^Ana, (your|a) gift$/);
    expect(out.html).toBe('<p>Hi Ana</p><a href="{{unsubscribe_url}}">Leave</a>');
    expect(out.text).toBe("Hi Ana\nLeave: {{unsubscribe_url}}");
  });
});

describe("preheaders", () => {
  it("go hidden right after <body>, personalized and escaped", () => {
    const out = personalize(
      {
        subject: "Hi",
        html: "<html><body><p>Body</p></body></html>",
        text: "Body",
        preheader: "{{first_name | Friend}}, 40% off <today>",
      },
      values,
      "seed",
    );
    expect(out.html).toMatch(
      /^<html><body><div style="display:none;[^"]*mso-hide:all">Ana, 40% off &#60;today&#62;(&zwnj;&nbsp;)+<\/div><p>Body<\/p>/,
    );
    expect(out.text).toBe("Body");
  });

  it("are left out of plain-text emails and when empty", () => {
    expect(
      personalize({ subject: "", html: "", text: "x", preheader: "Hi" }, values, "s").html,
    ).toBe("");
    expect(personalize({ subject: "", html: "<p>x</p>", text: "x" }, values, "s").html).toBe(
      "<p>x</p>",
    );
  });
});
