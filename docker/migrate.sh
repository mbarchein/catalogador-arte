#!/usr/bin/env bash
# Local migration applier: it runs supabase/migrations/*.sql in order,
# each one only once (recorded in the _migraciones table), and afterwards seed.sql.
set -euo pipefail

echo "Esperando a que GoTrue cree auth.users…"
for i in $(seq 1 60); do
  if psql -tAc "select 1 from information_schema.tables where table_schema='auth' and table_name='users'" | grep -q 1; then
    break
  fi
  sleep 1
done

# RLS enabled and no policy: the control table is not exposed through the API.
# It is done here and not in a migration because this table exists only locally.
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

# Privileges of the `storage` schema that the platform grants in the cloud and the
# self-host image does not. Without them, storage-api cannot even read the bucket's row
# in order to check the maximum size, and answers any upload with «new row
# violates row-level security policy»: a message that sends one to look at the policies
# when what is missing is a GRANT. The result was that uploading a photograph
# worked in the cloud and failed locally, which is exactly the reverse of what a
# local stack exists for.
#
# It goes here and not in a migration on purpose: in the cloud they are already granted, and
# a migration repeating them would touch production privileges unnecessarily.
echo "→ privilegios de storage (solo local)"
psql -v ON_ERROR_STOP=1 <<'SQL'
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

-- storage.buckets tiene RLS y ninguna política, así que el GRANT solo no basta.
-- Esto abre la LISTA de buckets, no su contenido: la puerta de los ficheros
-- siguen siendo las políticas de storage.objects que instalan las migraciones.
drop policy if exists buckets_legibles_en_local on storage.buckets;
create policy buckets_legibles_en_local on storage.buckets for select using (true);
SQL

if [ -f /seed.sql ]; then
  echo "→ seed.sql"
  psql -v ON_ERROR_STOP=1 -f /seed.sql
fi

echo "Migraciones OK"
