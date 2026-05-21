#!/usr/bin/env bash
# sync-migrations.sh
# Copy SQL files from backend/db/v3-migrations/ into supabase/migrations/
# with the timestamp-prefixed names the Supabase CLI expects.
#
# Usage:
#   ./supabase/sync-migrations.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/backend/db/v3-migrations"
DST="$REPO_ROOT/supabase/migrations"

mkdir -p "$DST"

# Wipe existing CLI-format migrations
find "$DST" -maxdepth 1 -type f -name '*.sql' -delete

idx=0
base_year=2026
base_month=01
base_day=01

for src_file in "$(ls "$SRC"/*.sql | sort)"; do
  # Add `idx` minutes to the base time. Use printf for portability.
  hour=$(( (idx / 60) % 24 ))
  minute=$(( idx % 60 ))
  ts=$(printf "%04d%s%s%02d%02d00" "$base_year" "$base_month" "$base_day" "$hour" "$minute")
  base_name=$(basename "$src_file" | sed -E 's/^[0-9]+_//')
  cp -f "$src_file" "$DST/${ts}_${base_name}"
  echo "  $(basename "$src_file") -> ${ts}_${base_name}"
  idx=$((idx + 1))
done

echo ""
echo "Synced $idx migration files to $DST"
