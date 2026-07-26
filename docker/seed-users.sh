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
    -d "{\"email\":\"$email\",\"password\":\"password123\",\"email_confirm\":true,\"user_metadata\":{\"nombre\":\"$nombre\"}}" \
    > /dev/null && echo "✓ $email" || echo "↷ $email (ya existe o error)"
}

crear_usuario "admin@local.test"       "Admin Local"
crear_usuario "catalogador@local.test" "Pedro Catalogador"
crear_usuario "lector@local.test"      "Luisa Lectora"

# El rol se asigna aquí y no en el alta: el valor por omisión de la tabla es
# LECTOR, el de menor privilegio, y promover es un acto explícito.
$PSQL <<'SQL' > /dev/null
update public.perfiles set rol = 'SUPERUSUARIO' where email = 'admin@local.test';
update public.perfiles set rol = 'CATALOGADOR'  where email = 'catalogador@local.test';
update public.perfiles set rol = 'LECTOR'       where email = 'lector@local.test';
SQL

echo
echo "Usuarios listos (contraseña: password123):"
echo "  admin@local.test        superusuario"
echo "  catalogador@local.test  catalogador — puede crear y editar"
echo "  lector@local.test       lector — solo consulta"
echo
echo "Entra en http://localhost:${PUERTO_APP:-5173}"
