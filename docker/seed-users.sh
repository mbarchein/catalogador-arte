#!/usr/bin/env bash
# Crea los usuarios de prueba locales por la API de administración de GoTrue,
# uno por cada rol, y les asigna el rol correspondiente.
set -euo pipefail

API=${API:-http://localhost:${PUERTO_API:-8321}}

# NO es un secreto: es el JWT de service_role del entorno local, firmado con el
# secreto por omisión bien conocido de Supabase ("your-super-secret-jwt-token-
# with-at-least-32-characters-long"). Solo sirve contra una instancia local que
# use ese secreto; no concede nada en el proyecto de la nube, que tiene el suyo
# privado. Se puede versionar sin riesgo.
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MjA4Mjc1ODQwMH0.hKugUZ3psc796Vm1pvDwNp_KGtbvF22bnuyE6pjGQFk"
PSQL="docker compose exec -T -e PGPASSWORD=postgres db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1"

crear_usuario() {
  local email=$1 nombre=$2
  curl -sf "$API/auth/v1/admin/users" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "apikey: $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"password123\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"$nombre\"}}" \
    > /dev/null && echo "✓ $email" || echo "↷ $email (ya existe o error)"
}

crear_usuario "admin@local.test"       "Admin Local"
crear_usuario "catalogador@local.test" "Pedro Catalogador"
crear_usuario "lector@local.test"      "Luisa Lectora"

# El rol se asigna aquí y no en el alta: el valor por omisión de la tabla es
# READER, el de menor privilegio, y promover es un acto explícito.
$PSQL <<'SQL' > /dev/null
update public.profiles set role = 'SUPERUSER' where email = 'admin@local.test';
update public.profiles set role = 'CATALOGER'  where email = 'catalogador@local.test';
update public.profiles set role = 'READER'       where email = 'lector@local.test';
SQL

echo
echo "Usuarios listos (contraseña: password123):"
echo "  admin@local.test        superusuario"
echo "  catalogador@local.test  catalogador — puede crear y editar"
echo "  lector@local.test       lector — solo consulta"
echo
echo "Entra en http://localhost:${PUERTO_APP:-5173}"

# Realtime (solo local): el tenant se siembra con un secreto aleatorio, y sin
# alinearlo con JWT_SECRET los canales rechazan los tokens de los usuarios y la
# suscripción falla en silencio. Idempotente; el cifrado es el que espera la
# imagen (aes-128-ecb con DB_ENC_KEY).
ENC=$(node -e 'const c=require("crypto").createCipheriv("aes-128-ecb",Buffer.from("supabaserealtime"),null);let e=c.update("your-super-secret-jwt-token-with-at-least-32-characters-long","utf8","base64");e+=c.final("base64");process.stdout.write(e)' 2>/dev/null)
if [ -n "$ENC" ]; then
  $PSQL -c "update _realtime.tenants set jwt_secret='$ENC' where external_id='realtime-dev';" >/dev/null 2>&1 \
    && echo "✓ secreto del tenant de realtime alineado" || echo "↷ realtime aún no está listo (repite make seed-users)"
fi
