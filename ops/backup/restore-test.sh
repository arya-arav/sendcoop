#!/bin/sh
# Proves a backup restores (D81): restores the newest dump (or $1) into a
# scratch database next to the real one, checks the schema is complete and
# the main tables came back, then drops the scratch database. Run it after
# backups, weekly at least; a backup nobody has restored isn't a backup.
#
#   DATABASE_URL   the live database (compared with, and used to reach the server)
#   BACKUP_DIR     where dumps are (default /backups)
set -eu

: "${DATABASE_URL:?DATABASE_URL is not set}"
dir="${BACKUP_DIR:-/backups}"
dump="${1:-$(ls -1t "$dir"/sendcoop-*.dump 2>/dev/null | head -n 1)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "restore-test: no dump found in $dir" >&2; exit 1; }

scratch="sendcoop_restore_check"
# The same server and credentials, another database.
base="${DATABASE_URL%/*}"
query="${DATABASE_URL#*\?}"; [ "$query" = "$DATABASE_URL" ] && query="" || query="?$query"
scratch_url="$base/$scratch$query"
admin_url="$base/postgres$query"

psql --quiet --dbname="$admin_url" -c "drop database if exists $scratch" -c "create database $scratch"
trap 'psql --quiet --dbname="$admin_url" -c "drop database if exists $scratch" > /dev/null' EXIT

started=$(date +%s)
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$scratch_url" "$dump"
echo "restore-test: restored $dump in $(( $(date +%s) - started ))s"

count() { psql --tuples-only --no-align --dbname="$1" -c "$2"; }
status=0
live_migrations=$(count "$DATABASE_URL" "select count(*) from drizzle.__drizzle_migrations")
restored_migrations=$(count "$scratch_url" "select count(*) from drizzle.__drizzle_migrations")
echo "restore-test: migrations live $live_migrations, restored $restored_migrations"
[ "$restored_migrations" -gt 0 ] || status=1

for table in users workspaces subscribers campaigns messages clicks conversions plans; do
  live=$(count "$DATABASE_URL" "select count(*) from $table")
  restored=$(count "$scratch_url" "select count(*) from $table")
  echo "restore-test: $table live $live, restored $restored"
  # Rows written since the dump are fine; a table that came back empty isn't.
  if [ "$live" -gt 0 ] && [ "$restored" -eq 0 ]; then status=1; fi
done

[ "$status" -eq 0 ] && echo "restore-test: OK" || echo "restore-test: FAILED" >&2
exit "$status"
