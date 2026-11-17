#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/escom-backup-${TIMESTAMP}.sql"

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "${DB_URL}" --clean --if-exists --no-owner --no-privileges > "${OUT}"
else
  npx supabase db dump --local --data-only -f "${OUT}"
fi

echo "Respaldo creado en ${OUT}"
