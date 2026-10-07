import { readSesWebhookToken, recordFeedback } from "@sendcoop/db";
import {
  isSnsUrl,
  parseSesNotification,
  parseSnsMessage,
  verifySnsMessage,
} from "@sendcoop/mailer";

// Amazon SNS posts SES bounce and complaint notifications here; each sending
// server has its own URL (the signed token names it). Messages must carry a
// valid SNS signature, and only affect emails sent through that server.

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const serverId = readSesWebhookToken(token);
  if (!serverId) return new Response("Unknown webhook", { status: 404 });

  let body: unknown;
  try {
    // SNS sends JSON with a text/plain content type.
    body = JSON.parse(await request.text());
  } catch {
    return new Response("Expected an SNS message", { status: 400 });
  }
  const message = parseSnsMessage(body);
  if (!message) return new Response("Expected an SNS message", { status: 400 });
  if (!(await verifySnsMessage(message))) {
    return new Response("Invalid signature", { status: 403 });
  }

  switch (message.Type) {
    case "SubscriptionConfirmation": {
      // Subscribing this URL to the SES topic: confirm it, as the AWS console asks.
      if (!message.SubscribeURL || !isSnsUrl(message.SubscribeURL)) {
        return new Response("Unexpected subscribe URL", { status: 400 });
      }
      const confirmed = await fetch(message.SubscribeURL, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      }).catch(() => null);
      return new Response(null, { status: confirmed?.ok ? 200 : 502 });
    }
    case "Notification": {
      const feedback = parseSesNotification(message.Message);
      if (feedback) await recordFeedback(serverId, feedback);
      return new Response(null, { status: 200 });
    }
    default:
      return new Response(null, { status: 200 });
  }
}
