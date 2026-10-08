# Operations

Running Sendcoop in production: backups, error reporting, uptime checks and
logs (D81), and how far one server goes (D80).

## Backups

`ops/backup/backup.sh` makes a compressed `pg_dump` of the database,
checks it can be read back, copies it to S3-compatible storage when
`BACKUP_S3_URI` is set, and deletes local dumps older than
`BACKUP_KEEP_DAYS` (14). Run it daily where `pg_dump` is installed, for
example from cron in the production compose file's `backup` service:

```sh
DATABASE_URL=postgres://... BACKUP_DIR=/backups BACKUP_S3_URI=s3://sendcoop-backups/db \
  ops/backup/backup.sh
```

Keep the bucket in another provider or region from the server, with
versioning or object lock on, so one mistake (or one compromised server)
can't delete the backups too.

What isn't in the dump: uploaded media and import files live in object
storage (`S3_*`), which needs its own versioning or replication; Redis only
holds queues and rate-limit counters, which rebuild themselves.

### Restore test

A backup nobody has restored isn't a backup. `ops/backup/restore-test.sh`
restores the newest dump (or the one given) into a scratch database on the
same server, checks every migration is there and the main tables came back,
then drops the scratch database:

```sh
DATABASE_URL=postgres://... BACKUP_DIR=/backups ops/backup/restore-test.sh
```

Run it weekly, after a backup (the production `backup` service does, on
Sundays). Last run (D81, development database): the dump restored in 2
seconds, all 52 migrations present, and users, workspaces, subscribers,
campaigns, messages, clicks, conversions and plans came back with the same
row counts as the live database.

### Restoring for real

1. Stop the web app, worker and edge (so nothing writes).
2. `pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" <dump>`
3. Start them again. Queued jobs in Redis that point at rows the backup
   doesn't have are skipped by the worker.

## Error reporting

Set `SENTRY_DSN` (one Sentry project for all three apps, or one each) and
errors are reported: page, route handler and server action errors from the
web app (`instrumentation.ts`), failed jobs from the worker, and unexpected
errors at the edge. `SENTRY_ENVIRONMENT` and `SENDCOOP_RELEASE` label them.
Without `SENTRY_DSN` nothing is sent anywhere. Request paths are reported
without query strings, which can hold tokens.

## Uptime

Each app has a health check that answers 200 when it can reach Postgres and
Redis, and 503 when it can't:

| App             | URL                                                                             |
| --------------- | ------------------------------------------------------------------------------- |
| Web             | `https://<app>/api/health`                                                      |
| Edge (tracking) | `https://<tracking domain>/health`                                              |
| Worker          | `http://<worker>:3002/health` (internal: point the container healthcheck at it) |

Point an uptime monitor (Better Stack, UptimeRobot or similar) at the web
and edge URLs every minute, alerting by email and phone. The edge matters
most: if it's down, clicks in sent emails go nowhere.

## Logs

The apps log to stdout, one line per event, prefixed with the service
(`[worker]`, `[edge]`, `[api]`). Docker keeps them; set the log driver's
`max-size` and `max-file` so they don't fill the disk, or ship them to a log
service. Secrets, tokens and API keys are never logged.

## Capacity (D80 load test)

`pnpm --filter @sendcoop/worker load-test` sends a campaign to a million
people (to an SMTP sink that keeps nothing) while clicks and postbacks come
in, and checks nothing failed and the queue drained.

Result on the development machine (one Windows PC; Postgres, Redis, the edge
and 3 worker processes all on it):

|           | Target          | Result                                                                                            |
| --------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Emails    | 1,000,000       | 1,000,000 sent, 0 failed, none sent twice; about 1,000 a second while sending (22 minutes in all) |
| Clicks    | 100,000 an hour | 99,645 at 100 a second (3.6× the target): 0 errors, p50 7 ms, p99 14 ms                           |
| Postbacks | 10,000 an hour  | 9,904 at 10 a second (3.6×): 0 errors, p50 13 ms, p99 32 ms                                       |
| Queue     | drains          | 0 waiting and 0 failed afterwards                                                                 |

What the test found, now fixed:

- **Big campaigns slowed down as they went:** every batch recounted all of
  the campaign's messages. Batches now add their own counts; the full count
  runs once, at the end (250 → about 1,000 emails a second at a million).
- **Queueing a million emails could lose a third of them:** the worker read
  every queued message at once and queued 10,000 jobs in one call, lost its
  job lock half-way, and nothing noticed. It now reads and queues in pages,
  and a sweep (every 2 minutes) re-queues any sending campaign that hasn't
  moved for 10 minutes.
- **An email could be sent twice** if its batch was queued twice (a retry, a
  re-queue). Each batch now claims its messages first; only one claim wins.
- **Deleting a big workspace never finished:** 16 foreign keys had no index,
  so each deleted message scanned whole tables. They're all indexed now (a
  test fails if one isn't), and a million-message workspace deletes in about
  a minute.

Sending is CPU-bound in the worker (building and DKIM-signing each email):
one worker process sends about 300 a second whatever `SEND_CONCURRENCY` is.
Add worker processes (the compose file's `replicas`) to go faster. Clicks and
postbacks are one database round trip each at the edge.
