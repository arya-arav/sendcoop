import Anthropic from "@anthropic-ai/sdk";

// AI assist (D70), server-side only: subject lines, email copy, and a draft
// automation from a goal. Claude Opus 5.5 answers in JSON (structured
// outputs), at low effort: these are short writing jobs. If Claude declines
// a request, the server-side fallback lets another model answer it.
// Off unless ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is set; tests point
// ANTHROPIC_BASE_URL at a fake.

export const AI_MODEL = "claude-opus-5-5";

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 }));

export class AiError extends Error {}

/** One JSON answer that matches `schema`. */
async function askJson<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  if (!aiAvailable()) throw new AiError("AI assist isn't set up on this server.");
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiError("AI assist is busy right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiError(`AI assist failed (${error.status ?? "network"}). Try again.`);
    }
    throw error;
  }
  if (response.stop_reason === "refusal") {
    throw new AiError("AI assist couldn't help with this one. Try describing it differently.");
  }
  if (response.stop_reason === "max_tokens")
    throw new AiError("The answer ran too long. Try a shorter brief.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("AI assist sent back something unreadable. Try again.");
  }
}

const SYSTEM = `You write marketing emails for small businesses, affiliate marketers and creators.
Write plainly and specifically, like a person writing to one reader: short sentences, no hype,
no clickbait, no ALL CAPS, at most one exclamation mark per email. Never invent facts, prices,
discounts, testimonials or statistics the brief doesn't give; leave a clear placeholder in
[square brackets] instead. Personalize with merge tags in this exact form:
{{first_name | there}} (a fallback after the bar). Links point to the URLs the brief gives,
or to https://example.com/... placeholders.`;

export type SubjectSuggestions = { subjects: string[]; preheader: string };

export function suggestSubjects(input: { content: string; goal: string | null }) {
  return askJson<SubjectSuggestions>(
    SYSTEM,
    `Suggest five subject lines (under 60 characters each, varied in approach: curiosity, benefit,
question, plain, personal) and one preheader (under 90 characters) for this email.
${input.goal ? `The goal of the email: ${input.goal}\n` : ""}
<email>
${input.content.slice(0, 20_000)}
</email>`,
    {
      type: "object",
      properties: {
        subjects: { type: "array", items: { type: "string" } },
        preheader: { type: "string" },
      },
      required: ["subjects", "preheader"],
      additionalProperties: false,
    },
  );
}

export type EmailDraft = { subject: string; html: string; text: string };

export function draftEmail(input: { brief: string; format: "html" | "text" }) {
  return askJson<EmailDraft>(
    SYSTEM,
    `Write one email from this brief. ${
      input.format === "html"
        ? "Give the body as simple HTML: <p> paragraphs, <a> links, at most one <ul>; no <html>, <head>, <style> or inline styles."
        : "Give the body as plain text in `text`, and the same as <p> paragraphs in `html`."
    } Keep it under 200 words.

<brief>
${input.brief.slice(0, 5_000)}
</brief>`,
    {
      type: "object",
      properties: {
        subject: { type: "string" },
        html: { type: "string" },
        text: { type: "string" },
      },
      required: ["subject", "html", "text"],
      additionalProperties: false,
    },
  );
}

export type FlowDraft = {
  name: string;
  trigger: "joined_list" | "converted" | "clicked_no_conversion" | "lead_status_new" | "api_event";
  exitOnConversion: boolean;
  steps: (
    { type: "email"; name: string; subject: string; body: string } | { type: "wait"; days: number }
  )[];
};

export function draftFlow(input: { goal: string }) {
  return askJson<FlowDraft>(
    SYSTEM,
    `Design an email automation for this goal: a trigger and 2 to 5 emails with waits between
them (1 to 14 days). Each email body is plain text with blank lines between paragraphs, under
150 words. Set exitOnConversion when the sequence is selling something.
Triggers: joined_list (someone joins a list), converted (someone buys), clicked_no_conversion
(clicked an email but didn't buy), lead_status_new (a new lead), api_event (an event from the
user's own app).

<goal>
${input.goal.slice(0, 2_000)}
</goal>`,
    {
      type: "object",
      properties: {
        name: { type: "string" },
        trigger: {
          type: "string",
          enum: [
            "joined_list",
            "converted",
            "clicked_no_conversion",
            "lead_status_new",
            "api_event",
          ],
        },
        exitOnConversion: { type: "boolean" },
        steps: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["email"] },
                  name: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["type", "name", "subject", "body"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["wait"] },
                  days: { type: "integer" },
                },
                required: ["type", "days"],
                additionalProperties: false,
              },
            ],
          },
        },
      },
      required: ["name", "trigger", "exitOnConversion", "steps"],
      additionalProperties: false,
    },
  );
}
