variable "proyecto" {
  description = "Nombre corto del proyecto, usado como prefijo de los recursos"
  type        = string
  default     = "catalogador-arte"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.proyecto))
    error_message = "Solo minúsculas, dígitos y guiones: el nombre se usa en buckets y dominios."
  }
}

# --- Supabase ---------------------------------------------------------------

variable "supabase_access_token" {
  description = "Token de acceso personal de Supabase (https://supabase.com/dashboard/account/tokens)"
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Identificador de la organización de Supabase donde se crea el proyecto"
  type        = string
}

variable "supabase_region" {
  description = "Región del proyecto de Supabase. eu-west-3 (París) es la más cercana con datos en la UE"
  type        = string
  default     = "eu-west-3"
}

variable "supabase_db_password" {
  description = <<-EOT
    Contraseña de la base de datos PostgreSQL. Déjala en null (el valor por
    omisión) y Terraform genera una aleatoria de 32 caracteres: una menos que
    inventar, teclear y poder teclear débil. Queda en el estado remoto (cifrado
    en R2) y en el secreto de Actions; recuperable con
    `terraform output -raw db_password`.
  EOT
  type        = string
  sensitive   = true
  default     = null
}

variable "supabase_site_url" {
  description = "URL pública de la aplicación, usada por Supabase Auth para construir los enlaces de correo"
  type        = string
}

# --- Vercel --------------------------------------------------------------
# El frontend se aloja en Vercel (ADR-005): los bloqueos de LaLiga a IPs de
# Cloudflare hacían inviable Pages desde España, y Vercel está probado desde
# aquí con la otra aplicación del equipo.

variable "vercel_token" {
  description = "Token de API de Vercel (https://vercel.com/account/tokens)"
  type        = string
  sensitive   = true
}

variable "vercel_org_id" {
  description = "Identificador de la cuenta/equipo de Vercel, para la CLI en CI"
  type        = string
}

# --- GitHub -----------------------------------------------------------------

variable "github_owner" {
  description = "Usuario u organización de GitHub propietaria del repositorio"
  type        = string
}

variable "github_token" {
  description = "Token de GitHub con permisos de administración sobre el repositorio"
  type        = string
  sensitive   = true
}

variable "github_repository" {
  description = "Nombre del repositorio de la aplicación"
  type        = string
  default     = "catalogador-arte"
}

variable "gestionar_repositorio" {
  description = <<-EOT
    Si Terraform crea y gestiona el repositorio de GitHub. Ponlo a false si el
    repositorio ya existe y prefieres no importarlo: los ajustes de ramas,
    secretos y variables se siguen gestionando igual.
  EOT
  type        = bool
  default     = true
}
