# Almacenamiento de imágenes (ADR-002) y alojamiento del frontend (ADR-001).

# --- Buckets de R2 ----------------------------------------------------------
#
# Dos buckets separados, no uno con prefijos, porque tienen ciclos de vida y
# destinos distintos: las derivadas se sirven a diario y caben en el tramo
# gratuito; los másters no se sirven nunca y son los que pueden migrar a otro
# proveedor si superan los 100 GB (ver el umbral de revisión en ADR-002).

resource "cloudflare_r2_bucket" "derivadas" {
  account_id = var.cloudflare_account_id
  name       = "${var.proyecto}-derivadas"
  location   = var.r2_location
}

resource "cloudflare_r2_bucket" "masters" {
  account_id = var.cloudflare_account_id
  name       = "${var.proyecto}-masters"
  location   = var.r2_location
}

# Volcados de la base de datos. El tramo gratuito de Supabase no incluye copias
# de seguridad: sin esto, perder la base deja miles de imágenes sin ninguna
# ficha que las explique.
resource "cloudflare_r2_bucket" "respaldos" {
  account_id = var.cloudflare_account_id
  name       = "${var.proyecto}-respaldos"
  location   = var.r2_location
}

# --- Frontend ---------------------------------------------------------------

resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = var.proyecto
  production_branch = "main"

  build_config = {
    build_command   = "npm run build"
    destination_dir = "dist"
    root_dir        = ""
  }

  deployment_configs = {
    production = {
      # La clave anónima de Supabase es pública por diseño: identifica al
      # proyecto, no autoriza nada. Lo que protege los datos son las políticas
      # RLS, no el secreto de esta clave.
      env_vars = {
        VITE_SUPABASE_URL = {
          type  = "plain_text"
          value = "https://${supabase_project.principal.id}.supabase.co"
        }
        VITE_R2_DERIVADAS_URL = {
          type  = "plain_text"
          value = "https://${cloudflare_r2_bucket.derivadas.name}.${var.cloudflare_account_id}.r2.cloudflarestorage.com"
        }
      }
    }
  }
}

output "r2_buckets" {
  description = "Buckets de R2 creados, por función"
  value = {
    derivadas = cloudflare_r2_bucket.derivadas.name
    masters   = cloudflare_r2_bucket.masters.name
    respaldos = cloudflare_r2_bucket.respaldos.name
  }
}

output "pages_url" {
  description = "URL del despliegue de producción en Cloudflare Pages"
  value       = "https://${cloudflare_pages_project.app.name}.pages.dev"
}
