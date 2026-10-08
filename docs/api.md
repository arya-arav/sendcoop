# REST API

Manage a workspace's subscribers and conversions from your own code. The
API is part of the Growth and Pro plans.

- **Base URL:** `https://<your app>/api/v1`
- **Description:** `/api/v1/openapi.json` (OpenAPI 3.1, for clients and code generators)
- **Keys:** Settings > API keys. Send one as `Authorization: Bearer sc_live_…`. A key
  is shown once; Sendcoop keeps only its hash. Make one per tool, and revoke
  any you stop using.
- **Limits:** 300 requests a minute per key (then `429` with `Retry-After`).

## Endpoints

| Method | Path                                           | What it does                                                                    |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/subscribers?status=&list_id=&limit=&cursor=` | Subscribers, newest first                                                       |
| POST   | `/subscribers`                                 | Add someone: `email`, `first_name`, `last_name`, `fields`, `lists`              |
| GET    | `/subscribers/{id or email}`                   | One subscriber, with their lists                                                |
| PATCH  | `/subscribers/{id or email}`                   | Names, `fields` (merged), `add_lists`, `remove_lists`, `status: "unsubscribed"` |
| DELETE | `/subscribers/{id or email}`                   | Delete them and their history                                                   |
| GET    | `/lists`                                       | Lists, with subscriber counts                                                   |
| GET    | `/conversions?limit=&cursor=`                  | Conversions, newest first                                                       |
| POST   | `/conversions`                                 | Record a sale, lead or refund (the [Conversion API](conversion-api.md) body)    |

People added through the API are subscribed straight away, so only add
people who asked to hear from you. The API can unsubscribe someone but not
subscribe them again: they have to do that themselves.

## Answers

Lists come as `{ "data": [...], "next_cursor": "..." }`: pass `next_cursor`
as `?cursor=` for the next page; it's `null` on the last one. Errors come as
`{ "error": { "code": "...", "message": "..." } }`:

| Status | Code             | When                                        |
| ------ | ---------------- | ------------------------------------------- |
| 400    | `invalid_json`   | The body isn't a JSON object                |
| 401    | `unauthorized`   | No key, or a wrong or revoked one           |
| 403    | `plan_required`  | The plan doesn't include the API            |
| 403    | `quota_exceeded` | The plan's subscriber limit is reached      |
| 404    | `not_found`      | No such subscriber                          |
| 409    | `already_exists` | The email is already a subscriber           |
| 422    | `invalid`        | A field isn't valid; the message says which |
| 429    | `rate_limited`   | Over 300 requests a minute                  |

## Example

```sh
curl https://app.example.com/api/v1/subscribers \
  -H "Authorization: Bearer $SENDCOOP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"robin@example.com","first_name":"Robin","lists":["<list id>"]}'
```
