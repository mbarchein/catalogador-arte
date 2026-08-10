#!/usr/bin/env bash
# Creates the local test users through GoTrue's administration API,
# one for each role, and assigns them the corresponding role.
set -euo pipefail

API=${API:-http://localhost:${PUERTO_API:-8321}}

# It is NOT a secret: it is the local environment's service_role JWT, signed with
# Supabase's well-known default secret ("your-super-secret-jwt-token-
# with-at-least-32-characters-long"). It only works against a local instance that
# uses that secret; it grants nothing in the cloud project, which has its own
# private one. It can be versioned with no risk.
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

# The role is assigned here and not on registration: the table's default value is
# READER, the least privileged one, and promoting is an explicit act.
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

# Realtime (local only): the tenant is seeded with a random secret, and without
# aligning it with JWT_SECRET the channels reject the users' tokens and the
# subscription fails in silence. Idempotent; the encryption is the one the
# image expects (aes-128-ecb with DB_ENC_KEY).
ENC=$(node -e 'const c=require("crypto").createCipheriv("aes-128-ecb",Buffer.from("supabaserealtime"),null);let e=c.update("your-super-secret-jwt-token-with-at-least-32-characters-long","utf8","base64");e+=c.final("base64");process.stdout.write(e)' 2>/dev/null)
if [ -n "$ENC" ]; then
  $PSQL -c "update _realtime.tenants set jwt_secret='$ENC' where external_id='realtime-dev';" >/dev/null 2>&1 \
    && echo "✓ secreto del tenant de realtime alineado" || echo "↷ realtime aún no está listo (repite make seed-users)"
fi
