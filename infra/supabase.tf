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

resource "random_password" "db" {
  count  = var.supabase_db_password == null ? 1 : 0
  length = 32
  # Solo alfanumérica a propósito: la contraseña acaba incrustada en URIs de
  # conexión (CLI de Supabase en CI, pooler, psql), y un carácter especial
  # obligaría a codificarla en cada uso — el clásico fallo que solo aparece en
  # producción y con una contraseña concreta.
  special = false
}

locals {
  db_password = coalesce(var.supabase_db_password, try(random_password.db[0].result, null))
}

resource "supabase_project" "principal" {
  organization_id   = var.supabase_organization_id
  name              = var.proyecto
  database_password = local.db_password
  region            = var.supabase_region

  lifecycle {
    # La contraseña no se puede leer de vuelta desde la API, así que Terraform
    # la vería siempre como un cambio pendiente. Se fija al crear el proyecto y
    # se rota desde el panel si hace falta.
    ignore_changes = [database_password]
  }
}

# Claves de API del proyecto. La anónima es pública por diseño —identifica el
# proyecto, no autoriza nada; el perímetro son las políticas RLS (RF-111)— y de
# aquí se propaga a la compilación del frontend y a las variables de Actions.
#
# La service_role, que este mismo data source también expone, NO se propaga a
# ningún sitio: ignora todas las políticas, y RF-111 exige que no aparezca ni en
# el cliente ni en el repositorio. Si alguna vez hace falta (p. ej. para un
# volcado), se consume aquí dentro y no sale de Terraform.
data "supabase_apikeys" "principal" {
  project_ref = supabase_project.principal.id
}

resource "supabase_settings" "principal" {
  project_ref = supabase_project.principal.id

  auth = jsonencode(merge(
    {
      # Los enlaces de los correos de invitación y recuperación apuntan al
      # dominio propio, no a la URL de vercel.app.
      site_url = local.url_app

      # El correo de recuperación redirige a la página de contraseña nueva.
      # Fuera de esta lista, GoTrue degrada el redirect a site_url y el enlace
      # aterrizaría en el listado en vez de en el formulario.
      uri_allow_list = "${local.url_app}/reset-password"

      # Solo cuentas creadas por el superusuario: el catálogo no tiene registro
      # abierto ni zona pública (RF-101).
      disable_signup = true

      # Sesión de 12 horas: cubre una jornada de catalogación en el almacén sin
      # obligar a volver a entrar, y caduca al día siguiente.
      jwt_exp = 43200

      mailer_autoconfirm                                = false
      enable_confirmations                              = true
      security_update_password_require_reauthentication = true
    },
    # SMTP propio vía Resend, como en la otra aplicación del equipo. Sin la
    # clave, Supabase usa su SMTP integrado: entrega solo a los miembros del
    # proyecto y con cuentagotas — vale para arrancar, no para el equipo.
    var.resend_api_key == "" ? {} : {
      external_email_enabled = true
      smtp_admin_email       = "noreply@${var.dominio_zona}"
      smtp_host              = "smtp.resend.com"
      smtp_port              = "465"
      smtp_user              = "resend"
      smtp_pass              = var.resend_api_key
      smtp_sender_name       = "Catalogador"
    }
  ))

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

output "db_password" {
  description = "Contraseña de la base de datos (generada si no se indicó). Leer con: terraform output -raw db_password"
  value       = local.db_password
  sensitive   = true
}
