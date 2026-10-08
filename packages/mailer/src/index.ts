import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { z } from "zod";

export * from "./html-to-text";
export * from "./links";
export * from "./personalize";
export * from "./preheader";
export * from "./sns";
export * from "./unsubscribe";

// Builds outgoing messages (DKIM-signed with the sending domain's key) and
// hands the same signed bytes to whichever driver a workspace uses.

export type OutgoingMessage = {
  from: { email: string; name?: string };
  to: string;
  replyTo?: string;
  subject: string;
  /** Empty for a plain-text email: then only the text part is sent. */
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type DkimKey = { domainName: string; keySelector: string; privateKey: string };

/** The complete message as bytes, DKIM-signed when a key is given. */
export async function buildRawMessage(message: OutgoingMessage, dkim?: DkimKey): Promise<Buffer> {
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const info = await composer.sendMail({
    from: message.from.name
      ? { name: message.from.name, address: message.from.email }
      : message.from.email,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    html: message.html || undefined,
    text: message.text,
    headers: message.headers,
    dkim: dkim
      ? {
          ...dkim,
          headerFieldNames:
            "from:to:subject:date:message-id:reply-to:list-unsubscribe:list-unsubscribe-post",
        }
      : undefined,
  });
  return info.message as Buffer;
}

export type SmtpConfig = {
  type: "smtp";
  host: string;
  port: number;
  /** TLS from the start (port 465); otherwise STARTTLS when offered. */
  secure: boolean;
  username?: string;
  password?: string;
};

export type SesConfig = {
  type: "ses";
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type ServerConfig = SmtpConfig | SesConfig;

/** Validates a stored or submitted driver config. */
export const serverConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("smtp"),
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().max(320).optional(),
    password: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("ses"),
    region: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "Choose an AWS region like us-east-1."),
    accessKeyId: z.string().trim().min(16).max(128),
    secretAccessKey: z.string().min(16).max(256),
  }),
]);

/** What lists show about a server: no secrets. */
export function serverSummary(config: ServerConfig) {
  return config.type === "smtp" ? `${config.host}:${config.port}` : `Amazon SES · ${config.region}`;
}

export type Envelope = { from: string; to: string[] };

export interface MailDriver {
  send(raw: Buffer, envelope: Envelope): Promise<{ messageId?: string }>;
  close(): void;
}

/** pool keeps SMTP connections open across a batch instead of reconnecting per message. */
export function createDriver(config: ServerConfig, { pool = false } = {}): MailDriver {
  return config.type === "smtp" ? smtpDriver(config, pool) : sesDriver(config);
}

function smtpDriver(config: SmtpConfig, pool: boolean): MailDriver {
  const transport = nodemailer.createTransport({
    ...(pool ? { pool: true as const, maxConnections: 3, maxMessages: 100 } : {}),
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  return {
    async send(raw, envelope) {
      const info = await transport.sendMail({ envelope, raw });
      return { messageId: info.messageId };
    },
    close: () => transport.close(),
  };
}

function sesDriver(config: SesConfig): MailDriver {
  const client = new SESv2Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Only a server setting can redirect SES (the local emulator in
    // development); customers can never point it somewhere else.
    endpoint: process.env.SES_ENDPOINT || undefined,
  });
  return {
    async send(raw, envelope) {
      const result = await client.send(
        new SendEmailCommand({
          FromEmailAddress: envelope.from,
          Destination: { ToAddresses: envelope.to },
          Content: { Raw: { Data: raw } },
        }),
      );
      return { messageId: result.MessageId };
    },
    close: () => client.destroy(),
  };
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return PRIVATE_V4.some((r) => r.test(address));
  const v6 = address.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    v6.startsWith("::ffff:")
  );
}

/**
 * Refuses SMTP hosts on private or loopback networks, so a workspace can't use
 * our servers to reach internal services. Local development opts out with
 * ALLOW_PRIVATE_SMTP_HOSTS=true (Mailpit runs on localhost).
 */
export async function smtpHostProblem(host: string): Promise<string | null> {
  if (process.env.ALLOW_PRIVATE_SMTP_HOSTS === "true") return null;
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      return "That host is on a private network. Use your provider's public SMTP host.";
    }
    return null;
  } catch {
    return "That host couldn't be found.";
  }
}
