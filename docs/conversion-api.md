# Conversion API

Report sales, leads and refunds from your own server. Sendcoop credits each one to the email that
led to it and shows the revenue in that campaign's report.

Use it when the sale happens somewhere a browser pixel can't see or can't be trusted with: a
payment webhook, a CRM, a subscription renewal, a refund.

## Endpoint

```
POST https://<your tracking domain>/v1/conversions
Content-Type: application/json
```

Your tracking domain, workspace id and API secret are in **Settings > Tracking > Conversion API**.
Keep the secret on your server: anyone who has it can report sales.

## Signing requests

Every request carries three headers:

| Header               | Value                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| `Sendcoop-Workspace` | Your workspace id                                                                     |
| `Sendcoop-Timestamp` | The current time in Unix seconds                                                      |
| `Sendcoop-Signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<body>`, keyed with your API secret |

Sign the exact bytes you send. Requests more than 5 minutes off the current time are refused, so
sign each one anew; the secret itself is never sent.

## Body

All fields are optional; send what you know.

| Field         | Type   | Default    | Notes                                                                       |
| ------------- | ------ | ---------- | --------------------------------------------------------------------------- |
| `click_id`    | string |            | The `sc_cid` parameter Sendcoop added to the link the buyer clicked.        |
| `email`       | string |            | The buyer's email: credits a recent email to them when there's no click id. |
| `event`       | string | `sale`     | `sale`, `lead`, `signup` or `custom`.                                       |
| `value`       | number | `0`        | The amount, e.g. `49.99`. Never negative: refunds use `status`.             |
| `currency`    | string | `USD`      | Three-letter code.                                                          |
| `status`      | string | `approved` | `pending`, `approved`, `rejected` or `reversed` (refunded or charged back). |
| `order_id`    | string |            | Your id for it. The same id again is ignored, unless its status changed.    |
| `occurred_at` | string | now        | ISO 8601 time, within the past year. Attribution looks back from here.      |

Only `approved` conversions count as revenue. To refund a sale, send its `order_id` again with
`"status": "reversed"`.

## Example

```bash
SENDCOOP_WORKSPACE="<workspace id>"
SENDCOOP_SECRET="<API secret>"
BODY='{"click_id":"sc4Fh9KqZ2LmPx7Ty1","value":49.99,"currency":"USD","order_id":"1042"}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SENDCOOP_SECRET" | sed 's/^.*= //')
curl -sS -X POST "https://<your tracking domain>/v1/conversions" \
  -H "Content-Type: application/json" \
  -H "Sendcoop-Workspace: $SENDCOOP_WORKSPACE" \
  -H "Sendcoop-Timestamp: $TS" \
  -H "Sendcoop-Signature: sha256=$SIG" \
  -d "$BODY"
```

In Node.js:

```js
import { createHmac } from "node:crypto";

const body = JSON.stringify({ email: "buyer@example.com", value: 49.99, order_id: "1042" });
const timestamp = Math.floor(Date.now() / 1000);
const signature = createHmac("sha256", process.env.SENDCOOP_SECRET)
  .update(`${timestamp}.${body}`)
  .digest("hex");
await fetch("https://<your tracking domain>/v1/conversions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Sendcoop-Workspace": process.env.SENDCOOP_WORKSPACE,
    "Sendcoop-Timestamp": String(timestamp),
    "Sendcoop-Signature": `sha256=${signature}`,
  },
  body,
});
```

## Responses

| Status | Body                                                    | Meaning                                                              |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
| 201    | `{"result":"created","id":"…","attributed_by":"click"}` | Recorded. `attributed_by`: `click`, `email`, `subscriber` or `none`. |
| 200    | `{"result":"updated","id":"…","attributed_by":null}`    | Seen before; its status changed.                                     |
| 200    | `{"result":"duplicate","id":null,"attributed_by":null}` | Seen before; nothing new.                                            |
| 400    | `{"error":"…"}`                                         | The body isn't JSON.                                                 |
| 401    | `{"error":"…"}`                                         | Missing, stale or wrong signature.                                   |
| 422    | `{"error":"value must be a number …"}`                  | A field is invalid; the error names it.                              |

Repeating a request is always safe with an `order_id`, so retry on network errors and 5xx.
