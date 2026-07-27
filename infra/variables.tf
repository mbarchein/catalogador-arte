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

# --- Dominio (zona DNS en Cloudflare) ----------------------------------------

variable "cloudflare_api_token" {
  description = "Token de Cloudflare con permiso Zone:DNS:Edit sobre la zona del dominio"
  type        = string
  sensitive   = true
}

variable "dominio_zona" {
  description = "Zona DNS que ya vive en Cloudflare"
  type        = string
  default     = "ruizcampins.com"
}

variable "subdominio_app" {
  description = "Subdominio de la aplicación dentro de la zona"
  type        = string
  default     = "catalogo"
}

variable "vercel_cname_target" {
  description = "Destino CNAME del edge de Vercel"
  type        = string
  default     = "cname.vercel-dns.com"
}

# --- Backblaze B2 (masters de archivo, ADR-002 actualizado) -----------------

variable "b2_application_key_id" {
  description = "Clave maestra de B2 (solo para que Terraform cree el bucket y su clave acotada)"
  type        = string
  sensitive   = true
}

variable "b2_application_key" {
  description = "Secreto de la clave maestra de B2"
  type        = string
  sensitive   = true
}

variable "b2_region" {
  description = "Región de la cuenta B2. eu-central-003 (Ámsterdam) mantiene los datos en la UE"
  type        = string
  default     = "eu-central-003"
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

# ── Resend: correo transaccional de producción ───────────────
# La clave se crea a mano en el panel de Resend. Vacía, el proyecto se queda
# con el SMTP integrado de Supabase, que solo entrega a los miembros del
# proyecto y con cuentagotas: suficiente para arrancar, no para el equipo.
variable "resend_api_key" {
  description = "Clave de API de Resend. Vacía = SMTP integrado de Supabase"
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_dkim_records" {
  description = <<-EOT
    Registros DNS (SPF/DKIM/MX) que Resend pide al verificar el dominio.
    Se copian del panel de Resend tras añadir el dominio allí.
  EOT
  type = list(object({
    name     = string
    type     = string # TXT | MX | CNAME
    content  = string
    priority = optional(number)
  }))
  default = []
}
