#!/usr/bin/env bash
# Carga en el stack local un volcado traído con db-pull.sh. DESTRUYE los datos
# locales del catálogo.
#
# El esquema NO se toca: sigue siendo el que aplicaron las migraciones. Lo que
# se sustituye son las filas. Por eso `public._migraciones`, que es el registro
# local de migraciones aplicadas, queda fuera de la limpieza: vaciarlo haría que
# el aplicador las repitiera todas al siguiente arranque.
#
#   make db-load                 # el volcado más reciente
#   make db-load VOLCADO=ruta    # uno concreto
#   SI=1 make db-load            # sin preguntar
set -euo pipefail

cd "$(dirname "$0")/.."

volcado=${1:-}
if [ -z "$volcado" ]; then
  volcado=$(ls -1d volcados/*/ 2>/dev/null | sort | tail -1 || true)
  volcado=${volcado%/}
fi

if [ -z "$volcado" ] || [ ! -f "$volcado/publico.sql" ]; then
  echo "No hay ningún volcado que cargar. Trae uno con: make db-pull" >&2
  exit 1
fi

if ! docker compose ps db 2>/dev/null | grep -q .; then
  echo "El stack local no está levantado. Arráncalo con: make up" >&2
  exit 1
fi

PSQL="docker compose exec -T -e PGPASSWORD=postgres db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1"

echo "Volcado:  $volcado"
[ -f "$volcado/metadatos.txt" ] && sed 's/^/  /' "$volcado/metadatos.txt"
echo
echo "Esto BORRA las obras, imágenes, vocabularios, perfiles y cuentas locales,"
echo "y los sustituye por los de producción."
if [ "${SI:-}" != "1" ]; then
  read -r -p "¿Seguir? [s/N] " respuesta
  case "$respuesta" in
    s|S|si|Si|SI|sí|Sí) ;;
    *) echo "Cancelado."; exit 1 ;;
  esac
fi

# Todo en una sesión con las réplicas activadas: eso apaga los triggers y las
# comprobaciones de clave ajena mientras se carga. Sin ello, el trigger de
# trazabilidad reescribiría `updated_at` y `updated_by` de cada fila importada
# —perdiendo justo el dato que se quiere copiar— y el orden de inserción
# importaría.
echo
echo "Vaciando el catálogo local…"
$PSQL <<'SQL' > /dev/null
begin;
set session_replication_role = replica;
truncate table public.images, public.artworks, public.series,
               public.artwork_types, public.profiles;
delete from auth.users;
commit;
SQL

echo "Cargando las cuentas…"
docker compose exec -T -e PGPASSWORD=postgres db \
  psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 \
  -c "\\copy auth.users (id, email, created_at, raw_user_meta_data) from stdin with (format csv, header)" \
  < "$volcado/usuarios.csv" > /dev/null

echo "Cargando el catálogo…"
{ echo "set session_replication_role = replica;"; cat "$volcado/publico.sql"; } \
  | docker compose exec -T -e PGPASSWORD=postgres db \
      psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 > /dev/null

# GoTrue necesita algo más que la fila para dejar entrar: el público, el rol y
# el correo confirmado. Y una contraseña, que aquí es la misma de siempre — el
# hash real no se ha traído, y trabajar en local con las contraseñas de personas
# reales sería una mala idea aunque se pudiera.
echo "Preparando las cuentas para entrar en local…"
$PSQL <<'SQL' > /dev/null
set search_path = public, extensions;
update auth.users set
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated',
  role = 'authenticated',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  encrypted_password = crypt('password123', gen_salt('bf'));
SQL

# Las cuentas de prueba locales se recrean: se han borrado con las demás, y sin
# ellas solo se podría entrar con un correo de producción.
echo "Recreando las cuentas de prueba locales…"
bash docker/seed-users.sh > /dev/null

echo
$PSQL -tA <<'SQL'
select 'Obras:      ' || count(*) from public.artworks
union all select 'Imágenes:   ' || count(*) from public.images
union all select 'Series:     ' || count(*) from public.series
union all select 'Tipos:      ' || count(*) from public.artwork_types
union all select 'Cuentas:    ' || count(*) from auth.users;
SQL

cat <<'AVISO'

Listo. Todas las cuentas —las de producción y las de prueba— entran con la
contraseña password123.

Las FOTOGRAFÍAS no vienen en el volcado: las filas de imágenes están, pero los
ficheros viven en el almacenamiento de producción. En local las fichas se verán
sin fotografía hasta que se suba alguna.
AVISO
