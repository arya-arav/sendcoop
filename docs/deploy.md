# Deploying Sendcoop

One server (a VPS with 4+ cores and 8 GB of memory is plenty to start)
runs everything with Docker Compose: the web app, the edge (tracking), the
worker, Postgres, Redis, daily backups and Caddy for HTTPS. Coolify or any
other Docker host works the same way: the compose file is the source.

## 1. Before you start

- **Two domains** (subdomains are fine), pointed at the server with A/AAAA
  records:
  - the app, e.g. `app.sendcoop.com` (`APP_DOMAIN`)
  - tracking, e.g. `t.sendcoop.com` (`TRACKING_DOMAIN`): every link in every
    email goes through it, so keep it short and never change it.
- **Amazon SES** in the region you'll send from (see section 4).
- **S3-compatible storage**: a public bucket for email images (`S3_*`), and
  a private one in another provider or region for backups (`BACKUP_S3_URI`).
- Optional: Stripe (billing, docs/billing.md), Sentry (`SENTRY_DSN`), an
  Anthropic API key (AI assist), UTMCAP.

## 2. Configure

On the server, clone the repository and create `.env.production` from
`.env.example`. In production:

| Setting                         | Value                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `APP_DOMAIN`, `TRACKING_DOMAIN` | the two domains                                                                                                 |
| `BETTER_AUTH_URL`               | `https://<APP_DOMAIN>`                                                                                          |
| `TRACKING_URL`                  | `https://<TRACKING_DOMAIN>`                                                                                     |
| `BETTER_AUTH_SECRET`            | `openssl rand -base64 32`                                                                                       |
| `ENCRYPTION_KEY`                | 32 random bytes, base64. **Back it up separately**: without it, stored credentials and DKIM keys can't be read. |
| `POSTGRES_PASSWORD`             | a long random password                                                                                          |
| `MAIL_FROM`                     | the address system emails (sign-up, invitations) come from, on a domain verified in SES                         |
| `SMTP_*`                        | SES SMTP credentials for those system emails                                                                    |
| `S3_*`                          | the media bucket; leave `S3_ENDPOINT` unset for AWS                                                             |
| `BACKUP_S3_URI`, `BACKUP_AWS_*` | the backup bucket and a key that can only write to it                                                           |

Never set these in production: `ALLOW_PRIVATE_SMTP_HOSTS`,
`SENDCOOP_ALLOW_PRIVATE_WEBHOOKS`, `SNS_TEST_CERT_URL`, `AUTH_RATE_LIMIT`,
`*_BASE_URL`/`*_API_BASE` overrides. They exist for tests.

## 3. Start

```sh
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Then open `https://<APP_DOMAIN>`, sign up, and make your account a
super-admin:

```sh
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U sendcoop -c "update users set role = 'admin' where email = 'you@example.com'"
```

To update: `git pull`, `build`, `run --rm migrate`, `up -d`.

## 4. Amazon SES

New SES accounts are in the sandbox: they can only send to verified
addresses, 200 a day.

1. In the SES console, verify the domain of `MAIL_FROM` (DKIM records).
2. Request production access (Account dashboard > Request production
   access). Describe the use honestly: a marketing email platform for
   affiliates and online stores, opt-in lists only, automatic suppression
   of bounces and complaints, unsubscribe in every email, and an account
   suspended automatically past 0.5% complaints. AWS usually answers within
   a day.
3. Create a configuration set with an SNS destination for bounces and
   complaints, and subscribe each sending server's webhook URL to the topic
   (Settings > Sending servers shows it).
4. In Sendcoop, add an SES sending server with an IAM key limited to
   `ses:SendRawEmail`, and send a test campaign to yourself.

That last step is the one that proves it: the live domain sends real mail.

## 5. After going live

- Point an uptime monitor at `https://<APP_DOMAIN>/api/health` and
  `https://<TRACKING_DOMAIN>/health` (docs/operations.md).
- Check the backup container's logs the day after, and run a restore test:
  `docker compose -f docker-compose.prod.yml exec backup restore-test.sh`.
- Add the Stripe webhook (docs/billing.md) and plans' price ids.
