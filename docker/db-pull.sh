#!/usr/bin/env bash
# Trae una copia de los DATOS de producción a volcados/.
#
# No trae el esquema, a propósito: el esquema local sale de
# supabase/migrations, que es la única fuente de verdad y lo que CI aplica a la
# nube. Mezclar ambas cosas convertiría cada importación en una pregunta sobre
# qué versión del esquema manda; separándolas, la respuesta es siempre «la del
# repositorio».
#
# Tampoco trae los ficheros del bucket: las fotografías viven en el
# almacenamiento, no en la base. Las fichas se importan con sus filas de
# imágenes, pero sin los píxeles detrás (ver el aviso del final).
#
#   SUPABASE_DB_URL=... make db-pull     # o con la variable en .env
set -euo pipefail

cd "$(dirname "$0")/.."

# .env es el sitio donde vive la URL: está en .gitignore y ya se usa para el
# resto de la configuración local.
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

# Las herramientas de cliente salen de la misma imagen que el stack local, que
# ya está descargada y sirve para conectar y preguntar. Para volcar puede hacer
# falta otra: ver más abajo.
IMAGEN_PG=${IMAGEN_PG:-supabase/postgres:17.6.1.158}

# --entrypoint sh y no `bash -c`: la imagen del volcado puede ser una alpine,
# que no lleva bash. Lo que se ejecuta dentro es sh corriente.
en_imagen() {
  docker run --rm -i --entrypoint sh -e PGURL="$URL" -e PGCONNECT_TIMEOUT=15 "$1" -c "$2"
}

# La conexión directa de Supabase (db.<ref>.supabase.co) solo escucha en IPv6, y
# muchas redes domésticas y de oficina no lo enrutan: el error es un «Network is
# unreachable» contra una dirección 2a05:…. El camino IPv4 es el pooler en modo
# sesión, que además cambia el usuario a postgres.<ref>. En vez de obligar a
# saberlo, se prueban las dos y se usa la que conteste.
#
# Partir la URL a mano es seguro aquí porque la contraseña que genera Terraform
# es alfanumérica a propósito (ver random_password.db en infra/supabase.tf): no
# hay nada que escapar.
candidatas=("$SUPABASE_DB_URL")
ref=$(sed -nE 's#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p' <<<"$SUPABASE_DB_URL")
if [ -n "$ref" ]; then
  clave=$(sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p' <<<"$SUPABASE_DB_URL")
  region=${SUPABASE_REGION:-eu-west-3}
  # El prefijo del pooler es aws-0 o aws-1 según cuándo se creó el proyecto.
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

# La referencia del proyecto, para el endpoint S3 del almacenamiento. Vale
# cualquiera de las dos formas de la URL: la directa lleva db.<ref>.supabase.co
# y la del pooler, el usuario postgres.<ref>.
REF=$(sed -nE 's#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p; s#.*://postgres\.([a-z0-9]+):.*#\1#p' <<<"$URL" | head -1)

echo "Consultando la versión del servidor…"
servidor=$(en_pg 'psql "$PGURL" -tAc "show server_version"' | tr -d '[:space:]')
cliente=$(en_pg 'pg_dump --version' | grep -oE '[0-9]+' | head -1)
mayor_servidor=${servidor%%.*}

# pg_dump se niega a leer un servidor más nuevo que él, y la nube va por delante
# de la imagen del stack local. Como la versión del servidor ya se conoce, no hay
# nada que preguntar: se coge la imagen oficial de esa versión. psql sí conecta
# hacia arriba, así que para lo demás vale la de siempre.
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

# Los usuarios hacen falta por integridad: perfiles referencia auth.users, y las
# columnas de autoría de obras e imágenes referencian perfiles. Se traen solo
# cuatro columnas, y NO el hash de la contraseña: es un secreto de una persona
# real que no pinta nada en un portátil, y la carga local pone una conocida.
echo "Volcando las cuentas (sin contraseñas)…"
en_volcado 'psql "$PGURL" --csv -c "select id, email, created_at, coalesce(raw_user_meta_data::text, '"'"'{}'"'"') as meta from auth.users order by created_at"' \
  > "$destino/usuarios.csv"

# ── Las fotografías ─────────────────────────────────────────
#
# Están en dos sitios y pesan órdenes de magnitud distintos, así que el
# parámetro tiene dos niveles:
#
#   FOTOS=1     lo que la aplicación ENSEÑA: miniatura y derivada de cada toma,
#               en el bucket «obras» de Supabase. Unos cientos de KB por toma.
#   FOTOS=todo  además, los MÁSTERS de archivo, que están en B2 y rondan entre 8
#               y 35 MB cada uno. Puede ser un gigabyte largo.
#
# Se copia el bucket entero y no solo lo que citan las filas importadas: un
# fichero huérfano en el bucket es justo la clase de cosa que se viene a
# investigar con una copia local delante.
# La región va en la configuración y no en la URL porque mc no la acepta de
# ninguna otra forma —no hay opción ni variable de entorno— y estos dos destinos
# la exigen para firmar. El fichero se crea con permisos cerrados y se borra al
# salir: lleva las credenciales dentro.
espejo() { # $1 url  $2 clave  $3 secreto  $4 región  $5 bucket  $6 carpeta
  local configuracion estado=0
  configuracion=$(mktemp -d)
  chmod 700 "$configuracion"
  cat > "$configuracion/config.json" <<JSON
{
  "version": "10",
  "aliases": {
    "origen": {
      "url": "$1",
      "accessKey": "$2",
      "secretKey": "$3",
      "api": "S3v4",
      "path": "auto",
      "region": "$4"
    }
  }
}
JSON
  mkdir -p "$destino/$6"
  docker run --rm -v "$configuracion:/root/.mc" -v "$PWD/$destino:/salida" \
    --entrypoint mc minio/mc mirror --overwrite "origen/$5" "/salida/$6" || estado=$?
  rm -rf "$configuracion"
  return $estado
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
  # El anfitrión que documenta Supabase para S3 es <ref>.storage.supabase.co, no
  # el del proyecto. La región es la misma que se lee junto a la clave en el
  # panel y por omisión la del proyecto en Terraform.
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
