#!/bin/sh
# Backs up the Sendcoop database (D81): a compressed pg_dump, checked to be
# readable, optionally copied to S3-compatible storage, and old ones pruned.
# Runs where pg_dump is installed (the postgres image, or the backup
# container in production; see docs/operations.md), daily from cron.
#
#   DATABASE_URL       what to back up
#   BACKUP_DIR         where dumps go (default /backups)
#   BACKUP_KEEP_DAYS   local dumps older than this are deleted (default 14)
#   BACKUP_S3_URI      e.g. s3://sendcoop-backups/db (needs the aws CLI)
set -eu

: "${DATABASE_URL:?DATABASE_URL is not set}"
dir="${BACKUP_DIR:-/backups}"
keep="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$dir"
file="$dir/sendcoop-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --dbname="$DATABASE_URL" --file="$file.partial"
# A dump that can't be listed can't be restored: fail now, not on the day it's needed.
pg_restore --list "$file.partial" > /dev/null
mv "$file.partial" "$file"
echo "backup: $file ($(du -h "$file" | cut -f1))"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp --only-show-errors "$file" "$BACKUP_S3_URI/"
  echo "backup: copied to $BACKUP_S3_URI"
fi

find "$dir" -name 'sendcoop-*.dump' -mtime +"$keep" -delete
