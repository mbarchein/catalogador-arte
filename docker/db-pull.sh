#!/usr/bin/env bash
# Fetches a copy of production's DATA to volcados/.
#
# It does not fetch the schema, on purpose: the local schema comes from
# supabase/migrations, which is the only source of truth and what CI applies to the
# cloud. Mixing both things would turn every import into a question about
# which version of the schema rules; by separating them, the answer is always «the
# repository's».
#
# Nor does it fetch the bucket's files: the photographs live in the
# storage, not in the base. The records are imported with their image
# rows, but with no pixels behind them (see the warning at the end).
#
#   SUPABASE_DB_URL=... make db-pull     # or with the variable in .env
set -euo pipefail

cd "$(dirname "$0")/.."

# .env is where the URL lives: it is in .gitignore and it is already used for the
# rest of the local configuration.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  cat >&2 <<'AYUDA'
Falta SUPABASE_DB_URL.

La contraseña la genera Terraform y está en el estado remoto, junto con la
referencia del proyecto. Con `make -C infra init` hecho, la línea sale entera:

  echo "SUPABASE_DB_URL=postgresql://postgres:$(terraform -chdir=infra output -raw db_password)@db.$(terraform -chdir=infra output -raw supabase_project_ref).supabase.co:5432/postgres" >> .env

Solo la contraseña:  make -C infra password

Es la misma que CI usa como secreto SUPABASE_DB_PASSWORD. Usa el puerto 5432,
nunca el 6543: el modo transacción del pooler no admite pg_dump. Si la conexión
directa no llega —solo escucha en IPv6—, este script prueba el pooler solo.
AYUDA
  exit 1
fi

case "$SUPABASE_DB_URL" in
  *localhost*|*127.0.0.1*|*@db:*)
    echo "SUPABASE_DB_URL apunta al stack local. Esto descarga PRODUCCIÓN." >&2
    exit 1
    ;;
esac

# The client tools come from the same image as the local stack, which
# is already downloaded and serves to connect and query. For dumping another one may be
# needed: see further below.
IMAGEN_PG=${IMAGEN_PG:-supabase/postgres:17.6.1.158}

# --entrypoint sh and not `bash -c`: the dump's image may be an alpine,
# which does not carry bash. What is run inside is plain sh.
en_imagen() {
  docker run --rm -i --entrypoint sh -e PGURL="$URL" -e PGCONNECT_TIMEOUT=15 "$1" -c "$2"
}

# Supabase's direct connection (db.<ref>.supabase.co) listens only on IPv6, and
# many home and office networks do not route it: the error is a «Network is
# unreachable» against a 2a05:… address. The IPv4 route is the pooler in session
# mode, which also changes the user to postgres.<ref>. Instead of forcing one
# to know it, both are tried and the one that answers is used.
#
# Splitting the URL by hand is safe here because the password Terraform generates
# is alphanumeric on purpose (see random_password.db in infra/supabase.tf): there
# is nothing to escape.
candidatas=("$SUPABASE_DB_URL")
ref=$(sed -nE 's#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p' <<<"$SUPABASE_DB_URL")
if [ -n "$ref" ]; then
  clave=$(sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p' <<<"$SUPABASE_DB_URL")
  region=${SUPABASE_REGION:-eu-west-3}
  # The pooler's prefix is aws-0 or aws-1 depending on when the project was created.
  for n in 0 1; do
    candidatas+=("postgresql://postgres.$ref:$clave@aws-$n-$region.pooler.supabase.com:5432/postgres")
  done
fi

echo "Buscando una ruta a la base de producción…"
URL=""
for candidata in "${candidatas[@]}"; do
  anfitrion=$(sed -nE 's#.*@([^:/]+).*#\1#p' <<<"$candidata")
  printf '  %s … ' "$anfitrion"
  if docker run --rm --entrypoint sh -e PGURL="$candidata" -e PGCONNECT_TIMEOUT=10 \
       "$IMAGEN_PG" -c 'psql "$PGURL" -tAc "select 1"' >/dev/null 2>&1; then
    echo "conecta"
    URL="$candidata"
    break
  fi
  echo "no"
done

if [ -z "$URL" ]; then
  cat >&2 <<AYUDA

No se ha podido conectar por ninguna ruta.

Si la directa falla con «Network is unreachable», es IPv6 y hay que ir por el
pooler; si fallan también las del pooler, comprueba:

  · La contraseña. Sale del estado de Terraform:  make -C infra password
  · La región, si no es eu-west-3:                SUPABASE_REGION=… make db-pull
  · El anfitrión exacto del pooler, en el panel de Supabase:
    Project Settings → Database → Connection string → Session pooler
AYUDA
  exit 1
fi

if [ "$URL" != "$SUPABASE_DB_URL" ]; then
  echo
  echo "  La conexión directa no llega desde esta red. Se usa el pooler."
  echo "  Para no repetir la búsqueda cada vez, pon esto en .env:"
  echo
  echo "    SUPABASE_DB_URL=$(sed -E 's#://([^:]+):[^@]+@#://\1:CONTRASEÑA@#' <<<"$URL")"
  echo
fi

en_pg() {
  en_imagen "$IMAGEN_PG" "$1"
}

# The project's reference, for the storage's S3 endpoint. Either of the two
# forms of the URL will do: the direct one carries db.<ref>.supabase.co
# and the pooler's, the user postgres.<ref>.
REF=$(sed -nE 's#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p; s#.*://postgres\.([a-z0-9]+):.*#\1#p' <<<"$URL" | head -1)

echo "Consultando la versión del servidor…"
servidor=$(en_pg 'psql "$PGURL" -tAc "show server_version"' | tr -d '[:space:]')
cliente=$(en_pg 'pg_dump --version' | grep -oE '[0-9]+' | head -1)
mayor_servidor=${servidor%%.*}

# pg_dump refuses to read a server newer than itself, and the cloud is ahead
# of the local stack's image. As the server's version is already known, there is
# nothing to ask: the official image of that version is taken. psql does connect
# upwards, so for everything else the usual one will do.
IMAGEN_VOLCADO="$IMAGEN_PG"
if [ "$mayor_servidor" -gt "$cliente" ]; then
  IMAGEN_VOLCADO="postgres:$mayor_servidor-alpine"
  echo "Producción corre PostgreSQL $servidor y $IMAGEN_PG trae la $cliente."
  echo "Volcando con $IMAGEN_VOLCADO (se descarga la primera vez)…"
fi

en_volcado() {
  en_imagen "$IMAGEN_VOLCADO" "$1"
}

destino="volcados/$(date +%Y%m%d-%H%M)"
mkdir -p "$destino"

echo "Volcando los datos del esquema público…"
en_volcado 'pg_dump "$PGURL" --data-only --schema=public --no-owner --no-privileges' \
  > "$destino/publico.sql"

# The users are needed for integrity: profiles references auth.users, and the
# authorship columns of artworks and images reference profiles. Only
# four columns are fetched, and NOT the password hash: it is a real person's
# secret that has no business on a laptop, and the local load sets a known one.
echo "Volcando las cuentas (sin contraseñas)…"
en_volcado 'psql "$PGURL" --csv -c "select id, email, created_at, coalesce(raw_user_meta_data::text, '"'"'{}'"'"') as meta from auth.users order by created_at"' \
  > "$destino/usuarios.csv"

# ── The photographs ─────────────────────────────────────────
#
# They are in two places and weigh different orders of magnitude, so the
# parameter has two levels:
#
#   FOTOS=1     what the application SHOWS: the thumbnail and derivative of each shot,
#               in Supabase's «obras» bucket. A few hundred KB per shot.
#   FOTOS=todo  also, the archive MASTERS, which are in B2 and range between 8
#               and 35 MB each. It can be a good gigabyte.
#
# The whole bucket is copied and not only what the imported rows cite: an
# orphan file in the bucket is exactly the class of thing one comes to
# investigate with a local copy in front.
# With the AWS CLI and not with mc, for two reasons that are discovered on using it: Supabase's
# S3 endpoint carries a path (…/storage/v1/s3) and mc only accepts
# scheme://host[:port]; and this way the credentials go through environment variables, with no
# mounted configuration file that the container leaves written as root and
# that afterwards there is no way of deleting from the host.
#
# --user with the uid of whoever calls, for the same reason: what is downloaded has to end up
# owned by its owner and not by root, or `volcados/` becomes undeletable. HOME
# points at /tmp because the image wants somewhere to write even if there is
# nothing to store.
espejo() { # $1 endpoint  $2 clave  $3 secreto  $4 región  $5 bucket  $6 carpeta
  mkdir -p "$destino/$6"
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -e AWS_ACCESS_KEY_ID="$2" \
    -e AWS_SECRET_ACCESS_KEY="$3" \
    -e AWS_DEFAULT_REGION="$4" \
    -v "$PWD/$destino/$6:/salida" \
    amazon/aws-cli s3 sync "s3://$5" /salida --endpoint-url "$1" --no-progress
}

if [ -n "${FOTOS:-}" ]; then
  if [ -z "${SUPABASE_S3_KEY_ID:-}" ] || [ -z "${SUPABASE_S3_KEY_SECRET:-}" ]; then
    cat >&2 <<'AYUDA'
Para traer las fotografías hacen falta credenciales S3 del almacenamiento, en .env:

  SUPABASE_S3_KEY_ID / SUPABASE_S3_KEY_SECRET

Se crean en el panel del proyecto: Storage → S3 Access Keys → New access key.
Son credenciales SOLO de almacenamiento; no dan acceso a la base de datos.
AYUDA
    exit 1
  fi
  echo "Trayendo miniaturas y derivadas del bucket obras…"
  # The host Supabase documents for S3 is <ref>.storage.supabase.co, not
  # the project's. The region is the same one read next to the key in the
  # panel and by default the project's in Terraform.
  espejo "https://$REF.storage.supabase.co/storage/v1/s3" \
         "$SUPABASE_S3_KEY_ID" "$SUPABASE_S3_KEY_SECRET" \
         "${SUPABASE_S3_REGION:-${SUPABASE_REGION:-eu-west-3}}" obras obras
fi

if [ "${FOTOS:-}" = "todo" ]; then
  if [ -z "${B2_KEY_ID:-}" ] || [ -z "${B2_KEY_SECRET:-}" ] || [ -z "${B2_BUCKET_MASTERS:-}" ]; then
    cat >&2 <<'AYUDA'
Para traer los másters hacen falta credenciales de BATE2, en .env:

  B2_KEY_ID / B2_KEY_SECRET / B2_BUCKET_MASTERS

El nombre del bucket sale de la infraestructura:
  terraform -chdir=infra output -raw b2_bucket_masters
AYUDA
    exit 1
  fi
  echo "Trayendo los másters de B2. Esto tarda y ocupa…"
  espejo "https://s3.${B2_REGION:-eu-central-003}.backblazeb2.com" \
         "$B2_KEY_ID" "$B2_KEY_SECRET" "${B2_REGION:-eu-central-003}" \
         "$B2_BUCKET_MASTERS" masters
fi

obras=$(grep -c '^AR-\|^RC-\|^TEST-' "$destino/publico.sql" 2>/dev/null || true)
cat > "$destino/metadatos.txt" <<META
Volcado de producción
Fecha:    $(date -Iseconds)
Servidor: PostgreSQL $servidor
Origen:   $( echo "$URL" | sed -E 's#//[^@]*@#//…@#')
Contiene: datos del esquema público y las cuentas (id, correo, alta, metadatos)
No contiene: esquema, contraseñas, ni los ficheros del bucket de imágenes
META

echo
echo "Volcado en $destino"
ls -la "$destino" | tail -n +2
echo
echo "Filas de obras detectadas (orientativo): ${obras:-?}"
echo
echo "CONTIENE DATOS REALES, incluidos datos personales. volcados/ está en"
echo ".gitignore: no lo subas al repositorio, que además es público, y bórralo"
echo "cuando termines."
echo
echo "Para cargarlo:  make db-load"
