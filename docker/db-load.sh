#!/usr/bin/env bash
# Carga en el stack local un volcado traído con db-pull.sh. DESTRUYE los datos
# locales del catálogo.
#
# El esquema NO se toca: sigue siendo el que aplicaron las migraciones. Lo que
# se sustituye son las filas. Por eso `public._migraciones`, que es el registro
# local de migraciones aplicadas, queda fuera de la limpieza: vaciarlo haría que
# el aplicador las repitiera todas al siguiente arranque.
#
#   make db-load                     # el volcado más reciente
#   make db-load VOLCADO=ruta        # uno concreto
#   make db-load CONFIRM=yes         # sin preguntar
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
# CONFIRM=yes se salta la pregunta. El valor es una palabra y no un 1 a
# propósito: quien lo escribe en un guion tiene que decir que sí con todas las
# letras, porque lo que hay al otro lado es un borrado.
if [ "$(printf '%s' "${CONFIRM:-}" | tr '[:upper:]' '[:lower:]')" != "yes" ]; then
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
               public.artwork_types, public.physical_places, public.profiles;
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

# ── Transitorio: el árbol de lugares de un volcado antiguo ──
# Un volcado traído ANTES de que 20260801150000 llegara a producción no lleva
# `physical_places` ni `physical_place_id`: solo el texto de la convención vieja.
# Cargado tal cual, el catálogo local se quedaría sin ninguna ubicación, que
# parece un fallo de la aplicación y no lo es.
#
# Esto repite el reparto por comas de esa migración a propósito y con su fecha de
# caducidad puesta: se borra cuando se retire la columna `physical_location`, que
# es cuando dejarán de existir volcados sin árbol. No se ha convertido en una
# función del esquema para no dejar en producción, para siempre, una herramienta
# de un solo uso.
echo "Reconstruyendo el árbol de lugares (volcado sin ubicaciones)…"
$PSQL <<'SQL' > /dev/null
-- Con los triggers apagados, igual que la carga del volcado y por el mismo
-- motivo: esto no es que alguien haya editado 17 obras ni que las haya tenido
-- delante (RF-801, RF-802), y con `auth.uid()` nulo la auditoría les borraría el
-- «actualizado por» que acaba de llegar de producción.
set session_replication_role = replica;

do $$
declare
  v_artwork record;
  v_level text;
  v_parent uuid;
  v_node uuid;
begin
  -- Solo si el volcado no traía árbol. Si lo traía, no se toca nada.
  if exists (select 1 from public.physical_places) then
    return;
  end if;

  for v_artwork in
    select catalog_id, physical_location
      from public.artworks
     where btrim(coalesce(physical_location, '')) <> ''
       and public.place_key(physical_location) <> 'zzzz'
     order by catalog_id
  loop
    v_parent := null;
    v_node := null;

    foreach v_level in array string_to_array(v_artwork.physical_location, ',')
    loop
      v_level := btrim(v_level);
      continue when v_level = '';

      select id into v_node
        from public.physical_places
       where parent_id is not distinct from v_parent
         and public.place_key(name) = public.place_key(v_level);

      if v_node is null then
        insert into public.physical_places (parent_id, name)
        values (v_parent, v_level)
        returning id into v_node;
      end if;

      v_parent := v_node;
    end loop;

    if v_node is not null then
      update public.artworks set physical_place_id = v_node
       where catalog_id = v_artwork.catalog_id;
    end if;
  end loop;
end $$;
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
