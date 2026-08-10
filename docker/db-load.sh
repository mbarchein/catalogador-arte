#!/usr/bin/env bash
# Loads into the local stack a dump fetched with db-pull.sh. It DESTROYS the
# catalogue's local data.
#
# The schema is NOT touched: it goes on being the one the migrations applied. What
# is replaced are the rows. That is why `public._migraciones`, which is the local
# record of applied migrations, is left out of the cleanup: emptying it would make
# the applier repeat them all on the next start-up.
#
#   make db-load                     # the most recent dump
#   make db-load VOLCADO=path        # a particular one
#   make db-load CONFIRM=yes         # without asking
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
# CONFIRM=yes skips the question. The value is a word and not a 1 on
# purpose: whoever writes it in a script has to say yes in full,
# because what there is on the other side is a deletion.
if [ "$(printf '%s' "${CONFIRM:-}" | tr '[:upper:]' '[:lower:]')" != "yes" ]; then
  read -r -p "¿Seguir? [s/N] " respuesta
  case "$respuesta" in
    s|S|si|Si|SI|sí|Sí) ;;
    *) echo "Cancelado."; exit 1 ;;
  esac
fi

# The emptying goes WITH the triggers in place, unlike the load: deleting
# accounts has to cascade over what GoTrue hangs from them
# —identities, sessions, tokens—, and with the replicas activated that cascade does not
# fire. An orphan identity is not visible in any table of the catalogue, but
# it leaves user registration broken with a «Database error checking email» that says
# nothing about what is happening.
#
# The truncate names the five tables together because they reference each other; this way
# CASCADE is not needed, which would also delete what has not been named.
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

# The two -c go in the SAME session, and that order matters: without switching off the
# triggers first, the user-registration one creates a profile for every account that comes in, and
# then the dump clashes with its own profiles («duplicate key … profiles_pkey»).
# The good profiles, with their role, come in the dump.
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

# GoTrue needs something more than the row in order to let one in: the audience, the role and
# the confirmed email. And a password, which here is the usual one — the real
# hash has not been fetched, and working locally with real people's passwords
# would be a bad idea even if it were possible.
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

# ── Transitional: the tree of places of an old dump ─────────
# A dump fetched BEFORE 20260801150000 reached production does not carry
# `physical_places` nor `physical_place_id`: only the text of the old convention.
# Loaded as it is, the local catalogue would be left with no location at all, which
# looks like a failure of the application and is not.
#
# This repeats that migration's splitting by commas on purpose and with its expiry
# date set: it is deleted when the `physical_location` column is withdrawn, which
# is when dumps with no tree will stop existing. It has not been turned into a
# schema function so as not to leave in production, for ever, a single-use
# tool.
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

# ── Transitional: types and series of an old dump ───────────
# The same case as the tree of places, and the same expiry date (ADR-007): a
# dump fetched before 20260801160000 brings each artwork's type and series
# as text and with no identifier, so the local catalogue would be left with no type
# and no series in the record. They are paired by the trimmed text, which is what the
# vocabulary trigger already required. It is deleted when those two columns are withdrawn.
echo "Reconectando tipos y series (volcado sin identificadores)…"
$PSQL <<'SQL' > /dev/null
set session_replication_role = replica;

update public.artworks a
   set artwork_type_id = t.id
  from public.artwork_types t
 where a.artwork_type_id is null
   and btrim(a.artwork_type) <> ''
   and t.name = btrim(a.artwork_type);

-- Por fondo Y nombre: el mismo nombre en otro fondo es otra serie.
update public.artworks a
   set series_id = s.id
  from public.series s
 where a.series_id is null
   and btrim(a.series) <> ''
   and s.artist = a.artist
   and s.name = btrim(a.series);
SQL

# The local test accounts are recreated: they have been deleted with the others, and without
# them one could only log in with a production email.
echo "Recreando las cuentas de prueba locales…"
bash docker/seed-users.sh > /dev/null

# ── The photographs, if the dump brings them ────────────────
# They are uploaded through the storage API and not by copying files into the volume: it is
# storage-api that keeps its own record in the `storage` schema, and a
# file that appears on the disk without its row exists for nobody.
if [ -d "$volcado/obras" ]; then
  API="http://localhost:${PUERTO_API:-8321}"
  # The local environment's service_role JWT. It is not a secret: it is in
  # docker-compose.yml, signed with Supabase self-host's default key.
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
  # The same tool as in the download, and for the same reasons (see db-pull).
  # minio acts as B2 here: the local signing function points at it.
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
