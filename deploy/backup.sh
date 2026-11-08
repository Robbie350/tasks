#!/usr/bin/env bash
# Nightly Supabase database backup, kept for 14 days.
# Reads SUPABASE_DB_URL from the .env file next to docker-compose.yml.
set -euo pipefail

cd "$(dirname "$0")/.."
SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' .env | cut -d= -f2-)"
if [ -z "$SUPABASE_DB_URL" ]; then
  echo "SUPABASE_DB_URL is not set in .env" >&2
  exit 1
fi

BACKUP_DIR="$(pwd)/deploy/backups"
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
