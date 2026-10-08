// Browser-safe. Ready-made automations (D69): installed in one click as a
// draft with its emails written; the user picks the list or tag where the
// trigger needs one, reads the emails over, and goes live.

import type {
  ActionStep,
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationTrigger,
  ConditionStep,
  WaitUnit,
} from "./automations";

type Step =
  | { email: string; subject: string; body: string }
  | { wait: number; unit: WaitUnit }
  | { action: ActionStep }
  | { exit: true }
  | { condition: ConditionStep; yes: Step[]; no: Step[] };

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  /** For the gallery: who it's for. */
  audience: "everyone" | "affiliate" | "ecommerce" | "leadgen";
  trigger: AutomationTrigger;
  /** What the user still chooses before going live, if anything. */
  setup: string | null;
  exitOnConversion: boolean;
  steps: Step[];
};

/** An email's HTML: short paragraphs and one button, merge tags for the name. */
function html(body: string) {
  const paragraphs = body
    .split("\n\n")
    .map((p) => {
      const button = p.match(/^\[(.+)\]\((.+)\)$/);
      if (button) {
        return `<p style="margin:24px 0"><a href="${button[2]}" style="background:#111827;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${button[1]}</a></p>`;
      }
      return `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  return `<html><body style="margin:0;background:#f4f4f5"><div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#18181b">
${paragraphs}
</div></body></html>`;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "welcome",
    name: "Welcome series",
    description: "Three emails over five days for everyone who joins a list.",
    audience: "everyone",
    trigger: { type: "joined_list", listId: "" },
    setup: "Choose the list that starts it.",
    exitOnConversion: false,
    steps: [
      {
        email: "Welcome",
        subject: "Welcome, {{first_name | friend}}!",
        body: "Hi {{first_name | there}},\n\nThanks for joining. Here's what to expect: one useful email a week, no fluff, and you can leave any time.\n\nTo start, here's the one thing most people find helpful first.\n\n[Start here](https://example.com/start)\n\nTalk soon,\n{{sender_name | The team}}",
      },
      { wait: 2, unit: "days" },
      {
        email: "Our best stuff",
        subject: "The three things readers like most",
        body: "Hi {{first_name | there}},\n\nOf everything we've written, these three get the most replies:\n\n1. The beginner's guide\n2. The checklist\n3. The case study\n\n[Read them](https://example.com/best)",
      },
      { wait: 3, unit: "days" },
      {
        email: "A gift",
        subject: "A small thank-you",
        body: "Hi {{first_name | there}},\n\nYou've been with us a few days now, so here's a thank-you: our toolkit, free.\n\n[Get the toolkit](https://example.com/gift)",
      },
      { exit: true },
    ],
  },
  {
    id: "affiliate-bridge",
    name: "Affiliate bridge sequence",
    description:
      "Story, offer, follow-up: warms new subscribers up to an affiliate offer, and stops when they buy.",
    audience: "affiliate",
    trigger: { type: "joined_list", listId: "" },
    setup: "Choose the list that starts it, and put your affiliate link in the emails.",
    exitOnConversion: true,
    steps: [
      {
        email: "The problem",
        subject: "The mistake I made for two years",
        body: "Hi {{first_name | there}},\n\nFor two years I did this the hard way. I'll tell you what changed tomorrow, but first, the mistake: …\n\nTomorrow: what I use now.",
      },
      { wait: 1, unit: "days" },
      {
        email: "The offer",
        subject: "What I use now",
        body: "Hi {{first_name | there}},\n\nYesterday I promised to show you what I use. Here it is: it's the reason I stopped wasting weekends on this.\n\n[See it here](https://example.com/your-affiliate-link)\n\nIt's not for everyone. If you're starting out, it's worth a look.",
      },
      { wait: 2, unit: "days" },
      {
        condition: { kind: "activity", event: "clicked", nodeId: null },
        yes: [
          {
            email: "Questions",
            subject: "Questions about it?",
            body: "Hi {{first_name | there}},\n\nYou had a look the other day. The questions people ask most: does it work for beginners (yes), and is there a guarantee (yes, 60 days).\n\n[Take another look](https://example.com/your-affiliate-link)",
          },
          { exit: true },
        ],
        no: [
          {
            email: "Last chance",
            subject: "Before you go",
            body: "Hi {{first_name | there}},\n\nOne last note about this, then I'll drop it. If it's not for you, no problem at all.\n\n[The offer](https://example.com/your-affiliate-link)",
          },
          { exit: true },
        ],
      },
    ],
  },
  {
    id: "abandoned-cart",
    name: "Abandoned cart",
    description:
      "Two reminders after a cart is left behind (an API event from your store); stops when they buy.",
    audience: "ecommerce",
    trigger: { type: "api_event", event: "cart_abandoned" },
    setup: "Send a cart_abandoned event from your store through the events API.",
    exitOnConversion: true,
    steps: [
      { wait: 1, unit: "hours" },
      {
        email: "Reminder",
        subject: "You left something behind",
        body: "Hi {{first_name | there}},\n\nYour cart is still waiting for you, saved just as you left it.\n\n[Back to your cart](https://example.com/cart)",
      },
      { wait: 1, unit: "days" },
      {
        email: "Offer",
        subject: "Still thinking? Here's 10% off",
        body: "Hi {{first_name | there}},\n\nIf it helps you decide: use SAVE10 for 10% off your order, today and tomorrow.\n\n[Finish your order](https://example.com/cart)",
      },
      { exit: true },
    ],
  },
  {
    id: "post-purchase",
    name: "Post-purchase upsell",
    description:
      "Thanks them after a purchase, helps them get started, then suggests what goes with it.",
    audience: "ecommerce",
    trigger: { type: "converted", minValue: null },
    setup: null,
    exitOnConversion: false,
    steps: [
      { wait: 1, unit: "days" },
      {
        email: "Getting started",
        subject: "Thank you, here's how to get the most out of it",
        body: "Hi {{first_name | there}},\n\nThank you for your order! A few tips so you get the most out of it from day one.\n\n[The quick-start guide](https://example.com/guide)",
      },
      { wait: 4, unit: "days" },
      {
        email: "Upsell",
        subject: "Customers who bought this also love…",
        body: "Hi {{first_name | there}},\n\nPeople who bought what you did often add this, and say it made the difference.\n\n[Take a look](https://example.com/upsell)",
      },
      { exit: true },
    ],
  },
  {
    id: "lead-nurture",
    name: "Lead nurture",
    description:
      "For new leads: value first, then a nudge; engaged leads get tagged for your team.",
    audience: "leadgen",
    trigger: { type: "lead_status", stage: "new" },
    setup: null,
    exitOnConversion: true,
    steps: [
      {
        email: "Thanks",
        subject: "Thanks for getting in touch",
        body: "Hi {{first_name | there}},\n\nThanks for your interest! While we prepare your answer, here's what clients usually want to know first.\n\n[Read the FAQ](https://example.com/faq)",
      },
      { wait: 2, unit: "days" },
      {
        email: "Case study",
        subject: "How one client saved 12 hours a week",
        body: "Hi {{first_name | there}},\n\nA short story about a client in a situation like yours, and what changed for them.\n\n[Read the case study](https://example.com/case-study)",
      },
      { wait: 3, unit: "days" },
      {
        condition: { kind: "activity", event: "clicked", nodeId: null },
        yes: [{ action: { type: "add_tag", tagId: "" } }, { exit: true }],
        no: [
          {
            email: "Check-in",
            subject: "Is now a good time?",
            body: "Hi {{first_name | there}},\n\nNo pressure: if now isn't the right time, just reply \"later\" and we'll check back in a few months.\n\n[Book a call](https://example.com/call)",
          },
          { exit: true },
        ],
      },
    ],
  },
];

/** A template as an automation's graph, and the content of its emails by step id. */
export function templateGraph(template: AutomationTemplate) {
  const nodes: AutomationNode[] = [
    { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
  ];
  const edges: AutomationEdge[] = [];
  const emails: Record<string, { subject: string; html: string }> = {};
  let count = 0;
  const id = (kind: string) => `${kind}-${++count}`;

  function lay(steps: Step[], from: string, handle: "yes" | "no" | null, x: number, y: number) {
    let previous = from;
    let edgeHandle = handle;
    for (const step of steps) {
      y += 140;
      let node: AutomationNode;
      if ("email" in step) {
        node = {
          id: id("email"),
          type: "email",
          position: { x, y },
          data: { campaignId: null, name: step.email, subject: step.subject },
        };
        emails[node.id] = { subject: step.subject, html: html(step.body) };
      } else if ("wait" in step) {
        node = {
          id: id("wait"),
          type: "wait",
          position: { x, y },
          data: { amount: step.wait, unit: step.unit },
        };
      } else if ("action" in step) {
        node = { id: id("action"), type: "action", position: { x, y }, data: step.action };
      } else if ("exit" in step) {
        node = { id: id("exit"), type: "exit", position: { x, y }, data: {} };
      } else {
        node = { id: id("condition"), type: "condition", position: { x, y }, data: step.condition };
      }
      nodes.push(node);
      edges.push({
        id: `e-${previous}-${node.id}`,
        source: previous,
        target: node.id,
        sourceHandle: edgeHandle,
      });
      edgeHandle = null;
      previous = node.id;
      if ("condition" in step) {
        lay(step.yes, node.id, "yes", x - 280, y);
        lay(step.no, node.id, "no", x + 280, y);
        return;
      }
    }
  }
  lay(template.steps, "trigger", null, 0, 0);
  return { graph: { nodes, edges } satisfies AutomationGraph, emails };
}
