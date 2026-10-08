#!/bin/sh
# Backs up at BACKUP_HOUR (UTC, default 3) every day, and on Sundays proves
# the new dump restores. Failures exit, so the container restarts and the
# failure shows in its logs and status.
set -eu
hour="${BACKUP_HOUR:-3}"
while true; do
  now=$(date -u +%s)
  next=$(( (now / 86400) * 86400 + hour * 3600 ))
  [ "$next" -le "$now" ] && next=$(( next + 86400 ))
  sleep $(( next - now ))
  backup.sh
  if [ "$(date -u +%u)" = "7" ]; then restore-test.sh; fi
done
