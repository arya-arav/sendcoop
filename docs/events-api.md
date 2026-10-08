# Events API

Start automations from your own systems: a trial started, a course completed, a plan changed. Any
automation whose trigger is **An event from the API** with the same event name starts for that
subscriber.

```
POST https://<your tracking domain>/v1/events
Content-Type: application/json
```

Requests are signed exactly like the [conversion API](conversion-api.md): the same
`Sendcoop-Workspace`, `Sendcoop-Timestamp` and `Sendcoop-Signature` headers, with your API secret.

## Body

| Field           | Type   | Notes                                                                   |
| --------------- | ------ | ----------------------------------------------------------------------- |
| `event`         | string | The event's name, e.g. `trial_started` (letters, numbers, `.` `-` `_`). |
| `email`         | string | The subscriber's email. Or send `subscriber_id`.                        |
| `subscriber_id` | string | Sendcoop's id for the subscriber.                                       |
| `event_id`      | string | Optional: your id for it. The same id again starts nothing.             |
| `data`          | object | Optional: values the automation can use.                                |

The subscriber must already exist in the workspace and be subscribed.

## Example

```bash
BODY='{"event":"trial_started","email":"pat@example.com","event_id":"trial-1042","data":{"plan":"pro"}}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SENDCOOP_SECRET" | sed 's/^.*= //')
curl -sS -X POST "https://<your tracking domain>/v1/events" \
  -H "Content-Type: application/json" \
  -H "Sendcoop-Workspace: $SENDCOOP_WORKSPACE" \
  -H "Sendcoop-Timestamp: $TS" \
  -H "Sendcoop-Signature: sha256=$SIG" \
  -d "$BODY"
```

## Responses

| Status | Body                     | Meaning                                       |
| ------ | ------------------------ | --------------------------------------------- |
| 202    | `{"result":"queued"}`    | Received; matching automations start shortly. |
| 200    | `{"result":"duplicate"}` | This `event_id` was received before.          |
| 401    | `{"error":"…"}`          | Missing, stale or wrong signature.            |
| 422    | `{"error":"…"}`          | Bad event name, or no such subscriber.        |
