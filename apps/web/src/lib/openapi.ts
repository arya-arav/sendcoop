// The REST API's OpenAPI 3.1 description (D77), served at /api/v1/openapi.json.
// Keep it in step with the route handlers under app/api/v1.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const errors = {
  "401": { description: "Missing, invalid or revoked API key.", content: json(ref("Error")) },
  "403": {
    description: "The plan doesn't include the API, or a limit was reached.",
    content: json(ref("Error")),
  },
  "429": { description: "Over 300 requests a minute for this key.", content: json(ref("Error")) },
};
const page = (item: string) => ({
  type: "object",
  required: ["data", "next_cursor"],
  properties: {
    data: { type: "array", items: ref(item) },
    next_cursor: {
      type: ["string", "null"],
      description: "Pass as ?cursor= for the next page; null on the last page.",
    },
  },
});
const pageParams = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  { name: "cursor", in: "query", schema: { type: "string" } },
];
const subscriberParam = {
  name: "subscriber",
  in: "path",
  required: true,
  description: "The subscriber's id, or their email address.",
  schema: { type: "string" },
};

export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Sendcoop API",
      version: "1.0.0",
      description:
        'Manage a workspace\'s subscribers and conversions. Create an API key under Settings > API keys and send it as a Bearer token. Errors look like { "error": { "code", "message" } }.',
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ apiKey: [] }],
    paths: {
      "/subscribers": {
        get: {
          summary: "List subscribers, newest first",
          parameters: [
            ...pageParams,
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["subscribed", "pending", "unsubscribed", "bounced", "complained"],
              },
            },
            { name: "list_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "A page of subscribers.", content: json(page("Subscriber")) },
            ...errors,
          },
        },
        post: {
          summary: "Add a subscriber (subscribed straight away)",
          requestBody: { required: true, content: json(ref("NewSubscriber")) },
          responses: {
            "201": {
              description: "Added.",
              content: json({ type: "object", properties: { data: ref("Subscriber") } }),
            },
            "409": {
              description: "The email is already a subscriber.",
              content: json(ref("Error")),
            },
            "422": {
              description: "Something in the body isn't valid.",
              content: json(ref("Error")),
            },
            ...errors,
          },
        },
      },
      "/subscribers/{subscriber}": {
        parameters: [subscriberParam],
        get: {
          summary: "Get a subscriber",
          responses: {
            "200": {
              description: "The subscriber.",
              content: json({ type: "object", properties: { data: ref("Subscriber") } }),
            },
            "404": { description: "No such subscriber.", content: json(ref("Error")) },
            ...errors,
          },
        },
        patch: {
          summary: "Change names or fields, add or remove lists, or unsubscribe",
          requestBody: { required: true, content: json(ref("SubscriberChanges")) },
          responses: {
            "200": {
              description: "The subscriber, changed.",
              content: json({ type: "object", properties: { data: ref("Subscriber") } }),
            },
            "404": { description: "No such subscriber.", content: json(ref("Error")) },
            "422": {
              description: "Something in the body isn't valid.",
              content: json(ref("Error")),
            },
            ...errors,
          },
        },
        delete: {
          summary: "Delete a subscriber and their history",
          responses: {
            "204": { description: "Deleted." },
            "404": { description: "No such subscriber.", content: json(ref("Error")) },
            ...errors,
          },
        },
      },
      "/lists": {
        get: {
          summary: "List the workspace's lists",
          responses: {
            "200": {
              description: "Every list.",
              content: json({
                type: "object",
                properties: { data: { type: "array", items: ref("List") } },
              }),
            },
            ...errors,
          },
        },
      },
      "/conversions": {
        get: {
          summary: "List conversions, newest first",
          parameters: pageParams,
          responses: {
            "200": { description: "A page of conversions.", content: json(page("Conversion")) },
            ...errors,
          },
        },
        post: {
          summary: "Record a sale, lead or refund",
          description:
            "The body of the Conversion API (click_id or email, event, value, currency, txid, status). The same txid twice updates the first.",
          requestBody: { required: true, content: json(ref("NewConversion")) },
          responses: {
            "201": { description: "Recorded.", content: json(ref("ConversionResult")) },
            "200": {
              description: "An existing txid, updated.",
              content: json(ref("ConversionResult")),
            },
            "422": {
              description: "Something in the body isn't valid.",
              content: json(ref("Error")),
            },
            ...errors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "An API key: sc_live_…" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: { code: { type: "string" }, message: { type: "string" } },
            },
          },
        },
        Subscriber: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            status: {
              type: "string",
              enum: ["subscribed", "pending", "unsubscribed", "bounced", "complained"],
            },
            source: { type: "string" },
            fields: { type: "object", additionalProperties: true },
            timezone: { type: ["string", "null"] },
            lists: { type: "array", items: { type: "string", format: "uuid" } },
            subscribed_at: { type: ["string", "null"], format: "date-time" },
            unsubscribed_at: { type: ["string", "null"], format: "date-time" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        NewSubscriber: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            fields: {
              type: "object",
              additionalProperties: true,
              description: "Custom field values by key (Settings > Custom fields).",
            },
            lists: { type: "array", items: { type: "string", format: "uuid" } },
          },
        },
        SubscriberChanges: {
          type: "object",
          additionalProperties: false,
          properties: {
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            fields: { type: "object", additionalProperties: true, description: "Merged in." },
            status: { type: "string", enum: ["unsubscribed"] },
            add_lists: { type: "array", items: { type: "string", format: "uuid" } },
            remove_lists: { type: "array", items: { type: "string", format: "uuid" } },
          },
        },
        List: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: ["string", "null"] },
            subscriber_count: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Conversion: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            event: { type: "string", enum: ["sale", "lead", "signup", "custom"] },
            status: { type: "string" },
            value: { type: "number" },
            currency: { type: "string" },
            value_in_reporting_currency: { type: ["number", "null"] },
            source: { type: "string" },
            click_id: { type: ["string", "null"] },
            txid: { type: ["string", "null"] },
            campaign_id: { type: ["string", "null"] },
            automation_id: { type: ["string", "null"] },
            subscriber_id: { type: ["string", "null"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        NewConversion: {
          type: "object",
          properties: {
            click_id: { type: "string" },
            email: { type: "string", format: "email" },
            event: { type: "string", enum: ["sale", "lead", "signup", "custom"] },
            value: { type: "number" },
            currency: { type: "string" },
            txid: { type: "string" },
            status: { type: "string" },
          },
        },
        ConversionResult: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                result: { type: "string" },
                id: { type: ["string", "null"] },
                attributed_by: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  };
}
