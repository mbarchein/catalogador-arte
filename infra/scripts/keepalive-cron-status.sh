#!/usr/bin/env bash
# Drift check for the keep-alive pg_cron job, run by the data.external source in
# keepalive.tf on every terraform plan/refresh (RNF-116). Copied from ensayadero's
# notifications-cron-status.sh with the job's name changed.
#
#   stdin:  {"db_url": "...", "db_password": "...", "expected_sha": "..."}
#   stdout: {"in_sync": "true"} | {"in_sync": "false"}
#
# It reads the live cron.job row through a dockerized psql and compares
# sha256(schedule + "\n" + command) against expected_sha. Any database error — project
# paused, extensions not created yet, network down — reports out of sync instead of failing
# the plan: the provisioner that follows is what surfaces a real connection problem, loudly.
set -euo pipefail

input=$(cat)
field() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1" <<<"$input"; }

DB_URL=$(field db_url)
PGPASSWORD=$(field db_password)
EXPECTED=$(field expected_sha)
export DB_URL PGPASSWORD

# -tAX: tuples only, unaligned, no psqlrc → the raw value, newlines included.
current=$(docker run --rm -e DB_URL -e PGPASSWORD postgres:16-alpine \
  sh -c "psql \"\$DB_URL\" -tAX -c \"select schedule || E'\\n' || command from cron.job where jobname = 'keep-alive'\"" \
  2>/dev/null) || current=""

if [ -z "$current" ]; then
  echo '{"in_sync":"false"}'
  exit 0
fi

sha=$(printf '%s' "$current" | sha256sum | cut -d' ' -f1)
if [ "$sha" = "$EXPECTED" ]; then
  echo '{"in_sync":"true"}'
else
  echo '{"in_sync":"false"}'
fi
