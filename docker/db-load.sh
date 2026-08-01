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

# El vaciado va CON los triggers puestos, al contrario que la carga: borrar
# cuentas tiene que arrastrar en cascada lo que GoTrue cuelga de ellas
# —identidades, sesiones, testigos—, y con las réplicas activadas esa cascada no
# se dispara. Una identidad huérfana no se ve en ninguna tabla del catálogo, pero
# deja el alta de usuarios rota con un «Database error checking email» que no
# dice nada de lo que pasa.
#
# El truncate nombra las cinco tablas juntas porque se referencian entre sí; así
# no hace falta CASCADE, que borraría también lo que no se ha nombrado.
echo
echo "Vaciando el catálogo local…"
$PSQL <<'SQL' > /dev/null
begin;
truncate table public.images, public.artworks, public.series,
               public.artwork_types, public.profiles;
delete from auth.users;
-- Red de seguridad: si una carga anterior dejó identidades sin cuenta, se van
-- ahora. Sin esto el arreglo no alcanza a una base ya rota.
delete from auth.identities where user_id not in (select id from auth.users);
commit;
SQL

# Los dos -c van en la MISMA sesión, y ese orden importa: sin apagar antes los
# triggers, el de alta de usuario crea un perfil por cada cuenta que entra, y
# luego el volcado choca con sus propios perfiles («duplicate key … profiles_pkey»).
# Los perfiles buenos, con su rol, vienen en el volcado.
echo "Cargando las cuentas…"
docker compose exec -T -e PGPASSWORD=postgres db \
  psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica" \
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
-- Las columnas de testigo van a cadena vacía y no a nulo: GoTrue las lee en
-- variables de Go que no admiten nulo, y una cuenta importada con nulos existe
-- en la tabla pero rompe el inicio de sesión con «Database error querying
-- schema». Cuando las escribe él mismo pone cadena vacía; aquí se replica.
update auth.users set
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated',
  role = 'authenticated',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  encrypted_password = crypt('password123', gen_salt('bf')),
  -- Tampoco admite nulo aquí, y el volcado solo trae el alta.
  updated_at = coalesce(updated_at, created_at, now()),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '');

-- La identidad de correo, que no viaja en el volcado. GoTrue busca por ella
-- tanto al entrar como al comprobar duplicados: una cuenta sin identidad existe
-- en la tabla pero no puede iniciar sesión.
insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
select u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where not exists (
  select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
);
SQL

# Las cuentas de prueba locales se recrean: se han borrado con las demás, y sin
# ellas solo se podría entrar con un correo de producción.
echo "Recreando las cuentas de prueba locales…"
bash docker/seed-users.sh > /dev/null

# ── Las fotografías, si el volcado las trae ─────────────────
# Se suben por la API del almacenamiento y no copiando ficheros al volumen: es
# storage-api quien lleva su propio registro en el esquema `storage`, y un
# fichero que aparece en el disco sin su fila no existe para nadie.
if [ -d "$volcado/obras" ]; then
  API="http://localhost:${PUERTO_API:-8321}"
  # El JWT de service_role del entorno local. No es un secreto: está en
  # docker-compose.yml, firmado con la clave por omisión de Supabase self-host.
  CLAVE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MjA4Mjc1ODQwMH0.hKugUZ3psc796Vm1pvDwNp_KGtbvF22bnuyE6pjGQFk"

  echo "Subiendo las fotografías al almacenamiento local…"
  subidas=0
  fallos=0
  while IFS= read -r -d '' fichero; do
    ruta=${fichero#"$volcado/obras/"}
    case "$fichero" in
      *.webp) tipo=image/webp ;;
      *.jpg|*.jpeg) tipo=image/jpeg ;;
      *.png) tipo=image/png ;;
      *) tipo=application/octet-stream ;;
    esac
    if curl -sf -X POST "$API/storage/v1/object/obras/$ruta" \
         -H "Authorization: Bearer $CLAVE" -H "apikey: $CLAVE" \
         -H "x-upsert: true" -H "Content-Type: $tipo" \
         --data-binary "@$fichero" > /dev/null; then
      subidas=$((subidas + 1))
    else
      fallos=$((fallos + 1))
    fi
  done < <(find "$volcado/obras" -type f -print0)
  echo "  $subidas ficheros subidos${fallos:+, $fallos con error}"
fi

if [ -d "$volcado/masters" ]; then
  # Misma herramienta que en la bajada, y por las mismas razones (ver db-pull).
  # minio hace aquí de B2: la función de firmas local apunta a él.
  echo "Subiendo los másters a minio…"
  docker run --rm --network host \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -e AWS_ACCESS_KEY_ID=minio-local \
    -e AWS_SECRET_ACCESS_KEY=minio-local-secreto \
    -e AWS_DEFAULT_REGION=local \
    -v "$PWD/$volcado/masters:/entrada:ro" \
    amazon/aws-cli s3 sync /entrada s3://masters-local \
      --endpoint-url "http://localhost:${PUERTO_S3:-9100}" --no-progress
fi

echo
$PSQL -tA <<'SQL'
select 'Obras:      ' || count(*) from public.artworks
union all select 'Imágenes:   ' || count(*) from public.images
union all select 'Series:     ' || count(*) from public.series
union all select 'Tipos:      ' || count(*) from public.artwork_types
union all select 'Cuentas:    ' || count(*) from auth.users;
SQL

echo
echo "Listo. Todas las cuentas —las de producción y las de prueba— entran con la"
echo "contraseña password123."
if [ ! -d "$volcado/obras" ]; then
  echo
  echo "Este volcado NO trae fotografías, así que las fichas se verán sin ellas."
  echo "Para traerlas:  FOTOS=1 make db-clone   (FOTOS=todo incluye los másters)"
fi
