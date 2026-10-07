import { verify } from "node:crypto";
import { z } from "zod";

// Amazon SNS HTTP(S) deliveries: how SES reports bounces and complaints.
// Every message is signed by SNS; the signing certificate is only ever
// fetched from an SNS host, so a forged message can't point us elsewhere.

const snsMessageSchema = z.object({
  Type: z.enum(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"]),
  MessageId: z.string(),
  TopicArn: z.string(),
  Subject: z.string().nullish(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(["1", "2"]),
  Signature: z.string(),
  SigningCertURL: z.string(),
  SubscribeURL: z.string().optional(),
  Token: z.string().optional(),
});

export type SnsMessage = z.infer<typeof snsMessageSchema>;

export function parseSnsMessage(body: unknown): SnsMessage | null {
  const result = snsMessageSchema.safeParse(body);
  return result.success ? result.data : null;
}

/** An https URL on an SNS endpoint, e.g. https://sns.us-east-1.amazonaws.com/... */
export function isSnsUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function stringToSign(message: SnsMessage) {
  const keys =
    message.Type === "Notification"
      ? (["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const)
      : ([
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ] as const);
  return keys
    .filter((k) => message[k] !== undefined && message[k] !== null)
    .map((k) => `${k}\n${message[k]}\n`)
    .join("");
}

const certificates = new Map<string, string>();

async function fetchCertificate(url: string) {
  const cached = certificates.get(url);
  if (cached) return cached;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) throw new Error(`Certificate download failed: ${response.status}`);
  const pem = await response.text();
  // The test certificate changes with every test run, so it is never cached.
  if (url !== process.env.SNS_TEST_CERT_URL) certificates.set(url, pem);
  return pem;
}

/**
 * Whether SNS really sent this message. In development and CI,
 * SNS_TEST_CERT_URL names one extra certificate URL to trust, because
 * tests can't be signed by AWS.
 */
export async function verifySnsMessage(
  message: SnsMessage,
  getCertificate: (url: string) => Promise<string> = fetchCertificate,
): Promise<boolean> {
  const trusted =
    (isSnsUrl(message.SigningCertURL) &&
      new URL(message.SigningCertURL).pathname.endsWith(".pem")) ||
    (Boolean(process.env.SNS_TEST_CERT_URL) &&
      message.SigningCertURL === process.env.SNS_TEST_CERT_URL);
  if (!trusted) return false;
  try {
    const certificate = await getCertificate(message.SigningCertURL);
    return verify(
      message.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256",
      Buffer.from(stringToSign(message)),
      certificate,
      Buffer.from(message.Signature, "base64"),
    );
  } catch {
    return false;
  }
}

const recipientsSchema = z.array(z.object({ emailAddress: z.string() }));

// Both SES formats: identity notifications (notificationType) and
// configuration set event publishing (eventType).
const sesEventSchema = z.object({
  notificationType: z.string().optional(),
  eventType: z.string().optional(),
  mail: z.object({
    messageId: z.string(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  }),
  bounce: z
    .object({
      bounceType: z.string(),
      bounceSubType: z.string().optional(),
      bouncedRecipients: z.array(
        z.object({ emailAddress: z.string(), diagnosticCode: z.string().optional() }),
      ),
    })
    .optional(),
  complaint: z
    .object({
      complainedRecipients: recipientsSchema,
      complaintFeedbackType: z.string().optional(),
    })
    .optional(),
});

export type SesFeedback = {
  kind: "bounce" | "complaint";
  hard?: boolean;
  recipients: string[];
  providerMessageId: string;
  messageId?: string;
  detail?: string;
};

/** The bounce or complaint in an SES notification; null for other events (deliveries, opens). */
export function parseSesNotification(message: string): SesFeedback | null {
  let data: unknown;
  try {
    data = JSON.parse(message);
  } catch {
    return null;
  }
  const parsed = sesEventSchema.safeParse(data);
  if (!parsed.success) return null;
  const event = parsed.data;
  const type = event.notificationType ?? event.eventType;
  const base = {
    providerMessageId: event.mail.messageId,
    messageId: event.mail.headers?.find((h) => h.name.toLowerCase() === "x-sendcoop-message")
      ?.value,
  };
  if (type === "Bounce" && event.bounce) {
    const { bounce } = event;
    return {
      ...base,
      kind: "bounce",
      // Transient and Undetermined bounces may succeed later.
      hard: bounce.bounceType === "Permanent",
      recipients: bounce.bouncedRecipients.map((r) => r.emailAddress),
      detail:
        bounce.bouncedRecipients.find((r) => r.diagnosticCode)?.diagnosticCode ??
        [bounce.bounceType, bounce.bounceSubType].filter(Boolean).join(": "),
    };
  }
  if (type === "Complaint" && event.complaint) {
    return {
      ...base,
      kind: "complaint",
      recipients: event.complaint.complainedRecipients.map((r) => r.emailAddress),
      detail: event.complaint.complaintFeedbackType,
    };
  }
  return null;
}
