# Repositorio, protección de ramas y credenciales del flujo de integración.
#
# Las credenciales que necesita CI se derivan de los recursos creados más arriba,
# de modo que no hay que copiarlas a mano al panel de GitHub: el identificador
# del proyecto de Supabase o el nombre de un bucket llegan solos a las variables
# de Actions. Eso es la mitad del valor de tener esto en Terraform.

resource "github_repository" "app" {
  count = var.gestionar_repositorio ? 1 : 0

  name        = var.github_repository
  description = "Inventario y catálogo razonado — Alberto Rotili / María Ruiz Campins"
  # Público por decisión del equipo (ADR-005). Nada del repositorio es secreto:
  # la clave anónima lo es por diseño, las claves JWT del stack local son las de
  # demostración bien conocidas de Supabase, y el perímetro real son las
  # políticas RLS. Los secretos de verdad viven en Actions y en el estado de
  # Terraform, nunca en el árbol.
  visibility = "public"

  has_issues   = true
  has_projects = false
  has_wiki     = false

  # El historial del catálogo importa: cada commit documenta una decisión.
  allow_merge_commit     = false
  allow_squash_merge     = true
  allow_rebase_merge     = true
  delete_branch_on_merge = true

  lifecycle {
    # No destruir un repositorio con historial por un cambio de configuración.
    prevent_destroy = true
  }
}

locals {
  repo = var.gestionar_repositorio ? github_repository.app[0].name : var.github_repository
}

resource "github_repository_vulnerability_alerts" "app" {
  repository = local.repo
  enabled    = true
}

resource "github_branch_protection" "main" {
  repository_id = local.repo
  pattern       = "main"

  required_status_checks {
    strict = true
    contexts = [
      "verificar",
    ]
  }

  # Un solo operador: exigir revisión de otra persona bloquearía el trabajo.
  # Lo que sí se exige es que la verificación automática pase antes de fusionar.
  enforce_admins      = false
  allows_deletions    = false
  allows_force_pushes = false
}

# --- Secretos ---------------------------------------------------------------
# Valores que no deben aparecer nunca en un registro de ejecución.

resource "github_actions_secret" "supabase_access_token" {
  repository  = local.repo
  secret_name = "SUPABASE_ACCESS_TOKEN"
  value       = var.supabase_access_token
}

resource "github_actions_secret" "supabase_db_password" {
  repository  = local.repo
  secret_name = "SUPABASE_DB_PASSWORD"
  value       = local.db_password
}

resource "github_actions_secret" "vercel_token" {
  repository  = local.repo
  secret_name = "VERCEL_TOKEN"
  value       = var.vercel_token
}

resource "github_actions_secret" "vercel_org_id" {
  repository  = local.repo
  secret_name = "VERCEL_ORG_ID"
  value       = var.vercel_org_id
}

resource "github_actions_secret" "vercel_project_id" {
  repository  = local.repo
  secret_name = "VERCEL_PROJECT_ID"
  value       = vercel_project.app.id
}

# Credenciales de B2 para la función Edge. Nombres S3_* a propósito: la función
# firma S3 genérico, y cambiar de proveedor de almacenamiento debe ser cambiar
# estos valores, no el código (la promesa de ADR-002).
resource "github_actions_secret" "s3_key_id" {
  repository  = local.repo
  secret_name = "S3_KEY_ID"
  value       = b2_application_key.masters.application_key_id
}

resource "github_actions_secret" "s3_key_secret" {
  repository  = local.repo
  secret_name = "S3_KEY_SECRET"
  value       = b2_application_key.masters.application_key
}

# --- Variables --------------------------------------------------------------
# Valores no sensibles que el flujo necesita conocer. Se derivan de los recursos
# reales, así que no pueden quedar desactualizados respecto a la infraestructura.

resource "github_actions_variable" "supabase_project_ref" {
  repository    = local.repo
  variable_name = "SUPABASE_PROJECT_REF"
  value         = supabase_project.principal.id
}

resource "github_actions_variable" "supabase_url" {
  repository    = local.repo
  variable_name = "SUPABASE_URL"
  value         = "https://${supabase_project.principal.id}.supabase.co"
}

# La clave anónima es una variable y no un secreto a propósito: es pública por
# diseño y viaja en el JavaScript compilado. Tratarla como secreto solo haría
# ilegibles los registros de CI sin proteger nada.
resource "github_actions_variable" "supabase_anon_key" {
  repository    = local.repo
  variable_name = "SUPABASE_ANON_KEY"
  value         = data.supabase_apikeys.principal.anon_key
}

resource "github_actions_variable" "s3_endpoint" {
  repository    = local.repo
  variable_name = "S3_ENDPOINT"
  value         = local.s3_endpoint_b2
}

resource "github_actions_variable" "s3_region" {
  repository    = local.repo
  variable_name = "S3_REGION"
  value         = var.b2_region
}

resource "github_actions_variable" "s3_bucket_masters" {
  repository    = local.repo
  variable_name = "S3_BUCKET_MASTERS"
  value         = b2_bucket.masters.bucket_name
}

resource "github_actions_variable" "app_url" {
  repository    = local.repo
  variable_name = "APP_URL"
  value         = local.url_app
}
