#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Uso: bash scripts/restore.sh backups/escom-backup-YYYYMMDD-HHMMSS.sql"
  exit 1
fi

FILE="$1"
if [ ! -f "${FILE}" ]; then
  echo "Archivo no encontrado: ${FILE}"
  exit 1
fi

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql "${DB_URL}" -f "${FILE}"
echo "Restauración completada desde ${FILE}"
