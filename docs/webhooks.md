# Webhooks from Sendcoop

Sendcoop can call your server: from an automation's **Call a webhook** step, for example to
create a deal in your CRM when someone finishes a sequence.

## What arrives

A `POST` with a JSON body:

```json
{
  "event": "automation.webhook",
  "automation": { "id": "…", "name": "Trial nurture", "step": "action-…" },
  "run": { "id": "…", "trigger": { "trigger": "api_event", "plan": "pro" } },
  "subscriber": {
    "id": "…",
    "email": "pat@example.com",
    "first_name": "Pat",
    "last_name": null,
    "status": "subscribed",
    "fields": { "plan": "pro" }
  },
  "sent_at": "2026-10-08T14:02:11.508Z"
}
```

Answer with any 2xx within 10 seconds. A network error, a `429` or a `5xx` is retried twice
(after 1 and 3 seconds); after that the step is marked failed and the subscriber carries on through
the automation.

## Checking it's from Sendcoop

Each request carries two headers:

| Header               | Value                                                         |
| -------------------- | ------------------------------------------------------------- |
| `Sendcoop-Timestamp` | Unix seconds                                                  |
| `Sendcoop-Signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<raw body>` |

The key is your workspace's webhook secret. Compute the HMAC over the body exactly as it arrived,
compare in constant time, and refuse timestamps more than 5 minutes old.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function isFromSendcoop(rawBody, headers, secret) {
  const t = Number(headers["sendcoop-timestamp"]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`,
  );
  const given = Buffer.from(headers["sendcoop-signature"] ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

## Addresses

Webhooks go to public `https://` addresses. Private and internal addresses (10.x, 192.168.x,
localhost, cloud metadata and so on) are refused, and redirects aren't followed.
