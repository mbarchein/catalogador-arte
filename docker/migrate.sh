#!/usr/bin/env bash
# Aplicador de migraciones local: ejecuta supabase/migrations/*.sql en orden,
# cada una una sola vez (registradas en la tabla _migraciones), y después seed.sql.
set -euo pipefail

echo "Esperando a que GoTrue cree auth.users…"
for i in $(seq 1 60); do
  if psql -tAc "select 1 from information_schema.tables where table_schema='auth' and table_name='users'" | grep -q 1; then
    break
  fi
  sleep 1
done

# RLS activado y ninguna política: la tabla de control no se expone por la API.
# Se hace aquí y no en una migración porque esta tabla solo existe en local.
psql -v ON_ERROR_STOP=1 -c "create table if not exists public._migraciones (nombre text primary key, aplicada_en timestamptz default now())"
psql -v ON_ERROR_STOP=1 -c "alter table public._migraciones enable row level security"

for f in $(ls /migrations/*.sql | sort); do
  nombre=$(basename "$f")
  if psql -tAc "select 1 from public._migraciones where nombre = '$nombre'" | grep -q 1; then
    echo "↷ $nombre (ya aplicada)"
    continue
  fi
  echo "→ $nombre"
  psql -v ON_ERROR_STOP=1 -f "$f"
  psql -v ON_ERROR_STOP=1 -c "insert into public._migraciones (nombre) values ('$nombre')"
done

if [ -f /seed.sql ]; then
  echo "→ seed.sql"
  psql -v ON_ERROR_STOP=1 -f /seed.sql
fi

echo "Migraciones OK"
