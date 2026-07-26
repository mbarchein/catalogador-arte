# Proyecto de Supabase: base de datos, autenticación, API y almacenamiento.
#
# IMPORTANTE — reparto de responsabilidades:
# Terraform gestiona el proyecto y sus ajustes de plataforma. NO gestiona el
# esquema de la base de datos ni las políticas RLS. Tablas, restricciones,
# triggers y políticas viven en SQL versionado en supabase/migrations/ y los
# aplica la CLI de Supabase desde el flujo de integración continua.
#
# El motivo no es una limitación del provider: es que el esquema necesita
# migraciones ordenadas y reversibles sobre datos ya cargados, y eso es
# exactamente lo que Terraform no sabe hacer. Gestionar tablas con el provider
# de PostgreSQL desde aquí entraría en conflicto con las migraciones.

resource "supabase_project" "principal" {
  organization_id   = var.supabase_organization_id
  name              = var.proyecto
  database_password = var.supabase_db_password
  region            = var.supabase_region

  lifecycle {
    # La contraseña no se puede leer de vuelta desde la API, así que Terraform
    # la vería siempre como un cambio pendiente. Se fija al crear el proyecto y
    # se rota desde el panel si hace falta.
    ignore_changes = [database_password]
  }
}

resource "supabase_settings" "principal" {
  project_ref = supabase_project.principal.id

  auth = jsonencode({
    site_url = var.supabase_site_url

    # Solo cuentas creadas por el superusuario: el catálogo no tiene registro
    # abierto ni zona pública (RF-101).
    disable_signup = true

    # Sesión de 12 horas: cubre una jornada de catalogación en el almacén sin
    # obligar a volver a entrar, y caduca al día siguiente.
    jwt_exp = 43200

    mailer_autoconfirm                                = false
    enable_confirmations                              = true
    security_update_password_require_reauthentication = true
  })

  api = jsonencode({
    # Solo se expone el esquema público a PostgREST. El esquema interno de
    # Supabase y cualquier esquema auxiliar quedan fuera del alcance de la API.
    db_schema            = "public"
    db_extra_search_path = "public"

    # Tope de filas por petición: evita que un error de filtrado en el cliente
    # se traiga el catálogo completo.
    max_rows = 500
  })
}

output "supabase_project_ref" {
  description = "Referencia del proyecto, necesaria para la CLI y para el flujo de migraciones"
  value       = supabase_project.principal.id
}

output "supabase_url" {
  description = "URL base de la API del proyecto"
  value       = "https://${supabase_project.principal.id}.supabase.co"
}
