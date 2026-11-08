#!/usr/bin/env bash
# Nightly Supabase database backup, kept for 14 days. Runs on the VPS host via cron.
#
# Needs a file ~/.tasks-backup.env (chmod 600) containing one line:
#   SUPABASE_DB_URL=postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
# Backups are written to ~/tasks-backups (override with BACKUP_DIR).
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.tasks-backup.env}"
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$ENV_FILE" | cut -d= -f2-)"
fi
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL not set (expected in $ENV_FILE)" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$HOME/tasks-backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/db-$(date +%Y-%m-%d_%H%M).sql.gz"

# pg_dump runs in a container so its version matches Supabase's Postgres 17.
docker run --rm postgres:17-alpine \
  pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema=public --schema=auth \
  | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +14 -delete
echo "Backup written: $FILE"
