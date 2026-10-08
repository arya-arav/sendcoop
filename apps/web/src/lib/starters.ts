// Starter designs for the template gallery: ready-made emails for the
// common affiliate, ecommerce and lead generation jobs. Written in MJML
// with the same look as the editor's blocks, merge tags included.

export type StarterCategory = "Affiliate" | "Ecommerce" | "Lead generation" | "Newsletter";

export type Starter = {
  id: string;
  name: string;
  category: StarterCategory;
  description: string;
  subject: string;
  mjml: (assets: string) => string;
};

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#18181b";
const BODY = "#3f3f46";
const MUTED = "#71717a";

// Small builders so each starter reads like an outline.
const email = (sections: string[], background = "#f4f4f5") =>
  `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="${FONT}" />
      <mj-text font-size="16px" line-height="1.6" color="${BODY}" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${background}" width="600px">
${sections.join("\n")}
  </mj-body>
</mjml>`;

const section = (columns: string, { padding = "16px 24px", background = "#ffffff" } = {}) =>
  `<mj-section background-color="${background}" padding="${padding}">${columns}</mj-section>`;

const column = (content: string, width?: string) =>
  `<mj-column${width ? ` width="${width}"` : ""} vertical-align="middle">${content}</mj-column>`;

const heading = (text: string, size = 26) =>
  `<mj-text font-size="${size}px" font-weight="700" line-height="1.25" color="${INK}">${text}</mj-text>`;

const paragraph = (text: string) => `<mj-text>${text}</mj-text>`;

const small = (text: string) =>
  `<mj-text font-size="13px" line-height="1.5" color="${MUTED}">${text}</mj-text>`;

const button = (label: string, href: string, color = INK) =>
  `<mj-button href="${href}" background-color="${color}" color="#ffffff" font-size="16px" font-weight="700" border-radius="6px" inner-padding="14px 28px">${label}</mj-button>`;

const image = (src: string, alt: string, href?: string) =>
  `<mj-image src="${src}" alt="${alt}"${href ? ` href="${href}"` : ""} padding="0" />`;

const logo = (assets: string) =>
  section(
    column(`<mj-image src="${assets}/logo.png" alt="Your logo" width="160px" padding="0" />`),
    {
      padding: "24px 24px 8px",
    },
  );

const footer = (reason: string) =>
  section(
    column(
      `<mj-text align="center" font-size="12px" line-height="1.6" color="${MUTED}">Your Company, 123 Street, City, Country<br />${reason}<br /><a href="{{unsubscribe_url}}" style="color:${MUTED}">Unsubscribe</a></mj-text>`,
    ),
    { padding: "24px", background: "#f4f4f5" },
  );

const product = (
  assets: string,
  name: string,
  blurb: string,
  price: string,
  cta: string,
  color: string,
) =>
  section(
    column(image(`${assets}/product.png`, name, "https://example.com/product"), "40%") +
      column(
        `<mj-text font-size="18px" font-weight="700" color="${INK}" padding="0 0 0 16px">${name}</mj-text>` +
          `<mj-text font-size="14px" line-height="1.5" padding="8px 0 0 16px">${blurb}</mj-text>` +
          `<mj-text font-size="20px" font-weight="700" color="${INK}" padding="12px 0 0 16px">${price}</mj-text>` +
          `<mj-button href="https://example.com/product" align="left" background-color="${color}" color="#ffffff" font-size="15px" font-weight="700" border-radius="6px" inner-padding="12px 24px" padding="16px 0 0 16px">${cta}</mj-button>`,
        "60%",
      ),
  );

const SIGNED_UP = "You're getting this email because you signed up on our website.";
const CUSTOMER = "You're getting this email because you're a customer.";

export const STARTERS: Starter[] = [
  {
    id: "affiliate-review",
    name: "Product review",
    category: "Affiliate",
    description: "An honest review of one product, with pros, cons and your affiliate link.",
    subject: "I tried {Product name|it} for 30 days. Here's my verdict",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("I tested Product name for 30 days") +
              paragraph(
                "Hi {{first_name | there}}, you asked whether it's worth the money. Here's what I found after a month of daily use.",
              ),
          ),
        ),
        section(
          column(
            image(`${assets}/image.png`, "Product name in use", "https://example.com/go/product"),
          ),
          {
            padding: "0",
          },
        ),
        section(
          column(
            heading("What I liked", 18) +
              paragraph(
                "&#10003; Easy to set up<br />&#10003; Great value<br />&#10003; Helpful support",
              ),
            "50%",
          ) +
            column(
              heading("What could be better", 18) +
                paragraph("&#10007; Short trial<br />&#10007; Few colours"),
              "50%",
            ),
        ),
        section(
          column(
            paragraph(
              "My verdict: a clear yes for most people. The link below gets you the current discount.",
            ) +
              button("Check the price", "https://example.com/go/product", "#16a34a") +
              small(
                "I earn a small commission if you buy through my link, at no extra cost to you.",
              ),
          ),
        ),
        footer(SIGNED_UP),
      ]),
  },
  {
    id: "affiliate-top-picks",
    name: "Top picks roundup",
    category: "Affiliate",
    description: "Three recommended products in one email, each with its own link.",
    subject: "My 3 favourite finds this month",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("3 things worth your money this month") +
              paragraph(
                "Hi {{first_name | there}}, I tried a lot of products so you don't have to. These made the cut.",
              ),
          ),
        ),
        product(
          assets,
          "Pick #1: Product name",
          "Why it's the best overall.",
          "$39",
          "See the deal",
          "#16a34a",
        ),
        product(
          assets,
          "Pick #2: Product name",
          "Best on a budget.",
          "$19",
          "See the deal",
          "#16a34a",
        ),
        product(
          assets,
          "Pick #3: Product name",
          "The premium choice.",
          "$89",
          "See the deal",
          "#16a34a",
        ),
        section(
          column(
            small("Links are affiliate links: I may earn a commission, at no extra cost to you."),
          ),
        ),
        footer(SIGNED_UP),
      ]),
  },
  {
    id: "product-launch",
    name: "Product launch",
    category: "Ecommerce",
    description: "Announce something new with a big image and one clear call to action.",
    subject: "It's here: meet Product name",
    mjml: (assets) =>
      email([
        logo(assets),
        section(column(image(`${assets}/image.png`, "Product name", "https://example.com/new")), {
          padding: "0",
        }),
        section(
          column(
            heading("Meet Product name", 30) +
              paragraph(
                "{{first_name | Hi}}, it's finally here. Made for the way you work, and available today.",
              ) +
              button("Shop the launch", "https://example.com/new"),
          ),
          { padding: "24px 24px 32px" },
        ),
        footer(CUSTOMER),
      ]),
  },
  {
    id: "flash-sale",
    name: "Flash sale",
    category: "Ecommerce",
    description: "A short, urgent sale: big discount, end time and one button.",
    subject: "{Ends tonight|48 hours only}: 40% off everything",
    mjml: (assets) =>
      email(
        [
          logo(assets),
          section(
            column(
              `<mj-text align="center" font-size="15px" font-weight="700" color="#dc2626">FLASH SALE</mj-text>` +
                `<mj-text align="center" font-size="56px" font-weight="700" line-height="1" color="${INK}">40% OFF</mj-text>` +
                `<mj-text align="center">Everything in store, until midnight Sunday.<br />Use code <strong>FLASH40</strong> at checkout.</mj-text>` +
                button("Shop the sale", "https://example.com/sale", "#dc2626"),
            ),
            { padding: "32px 24px" },
          ),
          footer(CUSTOMER),
        ],
        "#fef2f2",
      ),
  },
  {
    id: "abandoned-cart",
    name: "Abandoned cart",
    category: "Ecommerce",
    description: "Bring shoppers back to the cart they left, with the product shown.",
    subject: "{{first_name | You}}, you left something in your cart",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("Still thinking it over?") +
              paragraph(
                "Hi {{first_name | there}}, you left this in your cart. We saved it for you, but stock is limited.",
              ),
          ),
        ),
        product(assets, "Product name", "Size M, colour blue.", "$39", "Complete checkout", INK),
        section(column(small("Questions? Just reply to this email and a real person will help."))),
        footer(CUSTOMER),
      ]),
  },
  {
    id: "review-request",
    name: "Review request",
    category: "Ecommerce",
    description: "Ask a recent customer how it went and for a review.",
    subject: "How are you getting on with your order?",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("How did we do?") +
              paragraph(
                "Hi {{first_name | there}}, your order arrived a few days ago. Would you take a minute to tell other shoppers what you think?",
              ) +
              `<mj-text align="center" font-size="32px" color="#f59e0b">&#9733;&#9733;&#9733;&#9733;&#9733;</mj-text>` +
              button("Write a review", "https://example.com/review"),
          ),
          { padding: "24px 24px 32px" },
        ),
        footer(CUSTOMER),
      ]),
  },
  {
    id: "newsletter",
    name: "Weekly newsletter",
    category: "Newsletter",
    description: "A digest of three stories with images and links.",
    subject: "This week: 3 ideas worth your time",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("This week's best") +
              paragraph("Hi {{first_name | there}}, here's what's new."),
          ),
        ),
        ...[1, 2, 3].map((n) =>
          section(
            column(
              image(`${assets}/product.png`, `Story ${n}`, "https://example.com/blog"),
              "35%",
            ) +
              column(
                `<mj-text font-size="18px" font-weight="700" color="${INK}" padding="0 0 0 16px">Story headline ${n}</mj-text>` +
                  `<mj-text font-size="14px" line-height="1.5" padding="8px 0 0 16px">A two-line summary that makes people want to read more.</mj-text>` +
                  `<mj-text font-size="14px" font-weight="700" padding="8px 0 0 16px"><a href="https://example.com/blog" style="color:${INK}">Read more &#8594;</a></mj-text>`,
                "65%",
              ),
          ),
        ),
        footer(SIGNED_UP),
      ]),
  },
  {
    id: "welcome",
    name: "Welcome",
    category: "Lead generation",
    description: "Greet new subscribers and tell them what to expect.",
    subject: "Welcome, {{first_name | friend}}!",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("Welcome aboard, {{first_name | friend}}!") +
              paragraph("Thanks for joining. Here's what you'll get from us:") +
              paragraph(
                "&#8226; One useful email a week, never spam<br />&#8226; Subscriber-only deals<br />&#8226; Early access to new products",
              ) +
              button("Start here", "https://example.com/start"),
          ),
          { padding: "24px 24px 32px" },
        ),
        footer(SIGNED_UP),
      ]),
  },
  {
    id: "lead-magnet",
    name: "Lead magnet delivery",
    category: "Lead generation",
    description: "Deliver the free guide or download someone signed up for.",
    subject: "Here's your free guide",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(
            heading("Your free guide is ready") +
              paragraph(
                "Hi {{first_name | there}}, as promised, here's your copy. It takes about 10 minutes to read.",
              ) +
              button("Download the guide", "https://example.com/guide.pdf", "#2563eb") +
              small("The link works for 30 days. Save the file to keep it."),
          ),
          { padding: "24px 24px 32px" },
        ),
        footer(SIGNED_UP),
      ]),
  },
  {
    id: "webinar",
    name: "Webinar invitation",
    category: "Lead generation",
    description: "Invite people to a live session, with date, time and a sign-up button.",
    subject: "You're invited: free live training on Thursday",
    mjml: (assets) =>
      email([
        logo(assets),
        section(
          column(image(`${assets}/image.png`, "Webinar speaker", "https://example.com/webinar")),
          { padding: "0" },
        ),
        section(
          column(
            heading("Free live training: Topic of the session") +
              paragraph(
                "Hi {{first_name | there}}, join us live and learn the three steps we use every day. Bring your questions.",
              ) +
              `<mj-text font-size="16px" font-weight="700" color="${INK}">Thursday, 7 pm (your time)<br />45 minutes + Q&amp;A</mj-text>` +
              button("Save my seat", "https://example.com/webinar", "#7c3aed"),
          ),
          { padding: "24px 24px 32px" },
        ),
        footer(SIGNED_UP),
      ]),
  },
];

export function findStarter(id: string) {
  return STARTERS.find((s) => s.id === id) ?? null;
}
