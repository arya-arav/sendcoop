import { createServer, type Server } from "node:http";

// A stand-in for the Claude Messages API (POST /v1/messages), for the AI
// assist tests: the app runs with ANTHROPIC_BASE_URL pointing here (see
// playwright.config.ts). It answers each kind of request with fixed JSON,
// as structured outputs would, and keeps the requests for checking.

export type FakeAnthropic = {
  requests: Record<string, unknown>[];
  close: () => Promise<void>;
};

const ANSWERS: [RegExp, unknown][] = [
  [
    /Suggest five subject lines/,
    {
      subjects: [
        "Your boots are waiting",
        "20% off boots, until Sunday",
        "Ready for spring?",
        "The boots everyone asks about",
        "A quick note about boots",
      ],
      preheader: "The spring sale ends Sunday.",
    },
  ],
  [
    /Write one email from this brief/,
    {
      subject: "Spring boots, 20% off until Sunday",
      html: '<p>Hi {{first_name | there}},</p>\n<p>Our spring sale is on: 20% off every pair of boots until Sunday.</p>\n<p><a href="https://shop.example/boots">See the boots</a></p>',
      text: "Hi {{first_name | there}},\n\nOur spring sale is on: 20% off every pair of boots until Sunday.\n\nSee the boots: https://shop.example/boots",
    },
  ],
  [
    /Design an email automation for this goal/,
    {
      name: "Webinar to course",
      trigger: "joined_list",
      exitOnConversion: true,
      steps: [
        {
          type: "email",
          name: "Replay",
          subject: "Here's the webinar replay",
          body: "Hi {{first_name | there}},\n\nThanks for coming. Here's the replay.",
        },
        { type: "wait", days: 2 },
        {
          type: "email",
          name: "Course",
          subject: "The course, if you want to go further",
          body: "Hi {{first_name | there}},\n\nIf the webinar helped, the course goes deeper.",
        },
      ],
    },
  ],
];

export async function startFakeAnthropic(port = 3010): Promise<FakeAnthropic> {
  const requests: Record<string, unknown>[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const request = JSON.parse(body || "{}") as { messages?: { content: string }[] };
      requests.push({ ...request, headers: req.headers });
      const prompt = String(request.messages?.[0]?.content ?? "");
      const answer = ANSWERS.find(([pattern]) => pattern.test(prompt))?.[1];
      res.writeHead(answer ? 200 : 400, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          answer
            ? {
                id: `msg_fake_${requests.length}`,
                type: "message",
                role: "assistant",
                model: "claude-opus-5-5",
                content: [{ type: "text", text: JSON.stringify(answer) }],
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: { input_tokens: 100, output_tokens: 100 },
              }
            : { type: "error", error: { type: "invalid_request_error", message: "unexpected" } },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { requests, close: () => new Promise((r) => server.close(() => r())) };
}
