import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  isSnsUrl,
  parseSesNotification,
  parseSnsMessage,
  type SnsMessage,
  verifySnsMessage,
} from "./sns";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const certificate = publicKey.export({ type: "spki", format: "pem" }).toString();
const getCertificate = async () => certificate;
const CERT_URL = "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc.pem";

/** Signs like SNS does (written out by hand from the AWS docs). */
function signed(fields: Omit<SnsMessage, "Signature" | "SigningCertURL" | "SignatureVersion">) {
  const order =
    fields.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  const text = order
    .filter((k) => fields[k as keyof typeof fields] != null)
    .map((k) => `${k}\n${fields[k as keyof typeof fields]}\n`)
    .join("");
  return {
    ...fields,
    SignatureVersion: "2" as const,
    Signature: sign("RSA-SHA256", Buffer.from(text), privateKey).toString("base64"),
    SigningCertURL: CERT_URL,
  };
}

const notification = signed({
  Type: "Notification",
  MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
  TopicArn: "arn:aws:sns:eu-west-1:123456789012:ses-feedback",
  Message: '{"notificationType":"Bounce"}',
  Timestamp: "2026-10-08T10:00:00.000Z",
});

describe("verifySnsMessage", () => {
  afterEach(() => {
    delete process.env.SNS_TEST_CERT_URL;
  });

  it("accepts a correctly signed notification and confirmation", async () => {
    expect(await verifySnsMessage(notification, getCertificate)).toBe(true);
    const confirmation = signed({
      Type: "SubscriptionConfirmation",
      MessageId: "165545c9-2a5c-472c-8df2-7ff2be2b3b1b",
      TopicArn: "arn:aws:sns:eu-west-1:123456789012:ses-feedback",
      Message: "You have chosen to subscribe to the topic ...",
      SubscribeURL: "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc",
      Token: "abc",
      Timestamp: "2026-10-08T10:00:00.000Z",
    });
    expect(await verifySnsMessage(confirmation, getCertificate)).toBe(true);
  });

  it("rejects altered messages", async () => {
    const altered = { ...notification, Message: '{"notificationType":"Complaint"}' };
    expect(await verifySnsMessage(altered, getCertificate)).toBe(false);
    expect(await verifySnsMessage({ ...notification, Signature: "AAAA" }, getCertificate)).toBe(
      false,
    );
  });

  it("only trusts certificates on SNS hosts", async () => {
    for (const url of [
      "https://evil.example/cert.pem",
      "http://sns.eu-west-1.amazonaws.com/cert.pem",
      "https://sns.eu-west-1.amazonaws.com.evil.example/cert.pem",
      "https://sns.eu-west-1.amazonaws.com/cert.txt",
    ]) {
      expect(await verifySnsMessage({ ...notification, SigningCertURL: url }, getCertificate)).toBe(
        false,
      );
    }
    // Tests can name one extra certificate URL.
    process.env.SNS_TEST_CERT_URL = "http://localhost:3998/cert.pem";
    expect(
      await verifySnsMessage(
        { ...notification, SigningCertURL: "http://localhost:3998/cert.pem" },
        getCertificate,
      ),
    ).toBe(true);
  });
});

describe("isSnsUrl", () => {
  it("allows SNS endpoints only", () => {
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription")).toBe(true);
    expect(isSnsUrl("https://sns.cn-north-1.amazonaws.com.cn/x")).toBe(true);
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com:8443/x")).toBe(false);
    expect(isSnsUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isSnsUrl("not a url")).toBe(false);
  });
});

describe("parseSnsMessage", () => {
  it("rejects bodies that aren't SNS messages", () => {
    expect(parseSnsMessage(notification)).not.toBeNull();
    expect(parseSnsMessage({ Type: "Notification" })).toBeNull();
    expect(parseSnsMessage("hello")).toBeNull();
  });
});

describe("parseSesNotification", () => {
  const mail = {
    messageId: "0100019a-ses-id",
    headers: [{ name: "X-Sendcoop-Message", value: "019a0000-0000-7000-8000-000000000001" }],
  };

  it("reads a permanent bounce as hard, with our message id from the headers", () => {
    const message = JSON.stringify({
      notificationType: "Bounce",
      mail,
      bounce: {
        bounceType: "Permanent",
        bounceSubType: "General",
        bouncedRecipients: [
          { emailAddress: "gone@example.com", diagnosticCode: "smtp; 550 5.1.1 user unknown" },
        ],
      },
    });
    expect(parseSesNotification(message)).toEqual({
      kind: "bounce",
      hard: true,
      recipients: ["gone@example.com"],
      providerMessageId: "0100019a-ses-id",
      messageId: "019a0000-0000-7000-8000-000000000001",
      detail: "smtp; 550 5.1.1 user unknown",
    });
  });

  it("reads transient bounces as soft, in the event publishing format too", () => {
    const message = JSON.stringify({
      eventType: "Bounce",
      mail: { messageId: "x" },
      bounce: {
        bounceType: "Transient",
        bounceSubType: "MailboxFull",
        bouncedRecipients: [{ emailAddress: "full@example.com" }],
      },
    });
    expect(parseSesNotification(message)).toMatchObject({
      kind: "bounce",
      hard: false,
      detail: "Transient: MailboxFull",
    });
  });

  it("reads complaints, and ignores other events", () => {
    const complaint = JSON.stringify({
      notificationType: "Complaint",
      mail,
      complaint: {
        complainedRecipients: [{ emailAddress: "angry@example.com" }],
        complaintFeedbackType: "abuse",
      },
    });
    expect(parseSesNotification(complaint)).toMatchObject({
      kind: "complaint",
      recipients: ["angry@example.com"],
      detail: "abuse",
    });
    expect(parseSesNotification(JSON.stringify({ notificationType: "Delivery", mail }))).toBeNull();
    expect(parseSesNotification("not json")).toBeNull();
  });
});
