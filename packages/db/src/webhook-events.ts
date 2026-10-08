// Browser-safe. The events outgoing webhooks can send (D78).
export const WEBHOOK_EVENTS = [
  "subscriber.subscribed",
  "subscriber.unsubscribed",
  "email.clicked",
  "conversion.created",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
