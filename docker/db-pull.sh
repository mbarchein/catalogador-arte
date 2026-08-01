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
# ya está descargada. Si producción corriera una versión mayor de PostgreSQL,
# pg_dump se negaría a leerla: se cambia con IMAGEN_PG.
IMAGEN_PG=${IMAGEN_PG:-supabase/postgres:15.8.1.085}

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
  if docker run --rm -e PGURL="$candidata" -e PGCONNECT_TIMEOUT=10 "$IMAGEN_PG" \
       bash -c 'psql "$PGURL" -tAc "select 1"' >/dev/null 2>&1; then
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
  docker run --rm -i -e PGURL="$URL" "$IMAGEN_PG" bash -c "$1"
}

echo "Consultando la versión del servidor…"
servidor=$(en_pg 'psql "$PGURL" -tAc "show server_version"' | tr -d '[:space:]')
cliente=$(en_pg 'pg_dump --version' | grep -oE '[0-9]+' | head -1)
mayor_servidor=${servidor%%.*}

if [ "$mayor_servidor" -gt "$cliente" ]; then
  cat >&2 <<AYUDA
Producción corre PostgreSQL $servidor y las herramientas de $IMAGEN_PG son la $cliente.
pg_dump no lee un servidor más nuevo que él. Repite con una imagen que coincida:

  IMAGEN_PG=postgres:$mayor_servidor-alpine make db-pull
AYUDA
  exit 1
fi

destino="volcados/$(date +%Y%m%d-%H%M)"
mkdir -p "$destino"

echo "Volcando los datos del esquema público…"
en_pg 'pg_dump "$PGURL" --data-only --schema=public --no-owner --no-privileges' \
  > "$destino/publico.sql"

# Los usuarios hacen falta por integridad: perfiles referencia auth.users, y las
# columnas de autoría de obras e imágenes referencian perfiles. Se traen solo
# cuatro columnas, y NO el hash de la contraseña: es un secreto de una persona
# real que no pinta nada en un portátil, y la carga local pone una conocida.
echo "Volcando las cuentas (sin contraseñas)…"
en_pg 'psql "$PGURL" --csv -c "select id, email, created_at, coalesce(raw_user_meta_data::text, '"'"'{}'"'"') as meta from auth.users order by created_at"' \
  > "$destino/usuarios.csv"

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
