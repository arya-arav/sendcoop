import {
  claimDueWebhookDeliveries,
  getIntegrationSecret,
  recordWebhookDelivery,
} from "@sendcoop/db";
import { deliverWebhook } from "../webhooks";

/**
 * Sends due webhook deliveries (D78), a few at a time. Each gets one try
 * here; a failure is retried later on WEBHOOK_RETRY_MINUTES.
 */
export async function sendWebhookDeliveries({
  deliver = deliverWebhook,
}: { deliver?: typeof deliverWebhook } = {}) {
  const due = await claimDueWebhookDeliveries();
  const secrets = new Map<string, string>();
  let delivered = 0;
  const queue = [...due];
  const work = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      let secret = secrets.get(d.workspace_id);
      if (!secret) {
        secret = await getIntegrationSecret(d.workspace_id, "webhooks");
        secrets.set(d.workspace_id, secret);
      }
      const outcome = await deliver(d.url, { id: d.id, ...d.payload }, secret, { attempts: 1 });
      await recordWebhookDelivery(d.id, outcome);
      if (outcome.ok) delivered++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, due.length) }, work));
  return { claimed: due.length, delivered };
}
