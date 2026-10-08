# Security

How Sendcoop protects its customers' data, and where each protection lives.
Reviewed in D79; the tests named here run in CI.

## Workspace isolation

Every query that takes a record's id also takes the workspace, and pages
and actions get the workspace from the signed-in user's membership
(`requireMemberWorkspace`), never from the request alone. An id from another
workspace finds nothing and changes nothing.

- `packages/db/src/queries/isolation.int.test.ts`: workspace A asks for and
  tries to change workspace B's campaigns, templates, segments, automations,
  subscribers, lists, API keys and webhook endpoints.
- `apps/web/e2e/isolation.spec.ts`: signed in to A, B's workspace and B's
  records under A's address are 404s, and so are B's subscribers through A's
  API key.

## Sign-in and roles

Better Auth handles passwords (hashed), sessions and email verification, and
rate-limits sign-in and sign-up in production (3 per 10 seconds per IP).
Members are view-only; owners and admins change things; only the owner
manages billing. Super-admins are `users.role = 'admin'`, set in the
database only. Suspended accounts can't log in, and their sessions end.

## Cross-site requests (CSRF)

Server actions check the Origin header (Next.js). Route handlers that trust
the session cookie (`/api/w/...`) refuse requests whose `Origin` or
`Sec-Fetch-Site` says they came from another site (`lib/api-auth.ts`).
The public API (`/api/v1`) takes no cookies: only API keys.

## Webhooks and other outgoing requests (SSRF)

Webhooks point wherever a customer says, so the worker:

- calls only `https://` URLs, and refuses names that resolve to private,
  loopback, link-local (cloud metadata) or other internal addresses;
- checks the address each connection actually uses, so a name can't pass
  the check and then resolve somewhere internal (DNS rebinding;
  `apps/worker/src/webhook-ssrf.int.test.ts`);
- doesn't follow redirects, and gives up after 10 seconds.

The other server-side requests go to fixed hosts (SNS certificates and
subscription URLs are checked against Amazon's domains, Stripe, UTMCAP,
the ECB).

## Secrets

- Integration secrets (SMTP and SES credentials, webhook and postback keys)
  are encrypted at rest with `ENCRYPTION_KEY`.
- API keys are stored as SHA-256 hashes and shown once.
- Incoming webhooks are verified: Stripe and Shopify signatures, SNS
  signatures for SES, HMAC signatures on the Conversion and Events APIs.
- Nothing in the browser gets a secret: there are no `NEXT_PUBLIC_` variables.

## Rate limits

| What                             | Limit                         |
| -------------------------------- | ----------------------------- |
| Sign-in and sign-up (production) | 3 per 10 seconds per IP       |
| REST API                         | 300 requests a minute per key |
| Signup forms                     | per form and IP               |
| Test emails                      | 20 an hour per workspace      |
| AI assist                        | per workspace                 |
| Team invitations                 | 20 an hour per workspace      |
| New API keys                     | 10 an hour per workspace      |
| Webhook tests                    | 10 a minute per workspace     |

## Headers

Every page sends `X-Content-Type-Options: nosniff`, a strict referrer
policy and a permissions policy, plus HSTS in production. Pages can't be
framed (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) except signup
forms (`/f/...`), which customers embed. A full Content-Security-Policy is
not set yet: the email editors load inline styles and scripts, so it needs
nonces first.

## Sending abuse

New-account warm-up, list-quality checks and automatic suspension on
complaints and bounces: see docs/billing.md.
