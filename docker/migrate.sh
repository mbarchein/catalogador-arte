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

# Privilegios del esquema `storage` que la plataforma concede en la nube y la
# imagen self-host no. Sin ellos, storage-api no puede ni leer la fila del bucket
# para comprobar el tamaño máximo, y responde a cualquier subida con «new row
# violates row-level security policy»: un mensaje que manda a mirar las políticas
# cuando lo que falta es un GRANT. El resultado era que subir una fotografía
# funcionaba en la nube y fallaba en local, que es justo al revés de para lo que
# existe un stack local.
#
# Va aquí y no en una migración a propósito: en la nube ya están concedidos, y
# una migración que los repita tocaría privilegios de producción sin necesidad.
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
