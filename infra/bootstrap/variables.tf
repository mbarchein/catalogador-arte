variable "proyecto" {
  description = "Nombre corto del proyecto, usado como prefijo del bucket de estado"
  type        = string
  default     = "catalogador-arte"
}

variable "cloudflare_api_token" {
  description = "Token de API de Cloudflare con permiso de edición sobre R2"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Identificador de la cuenta de Cloudflare"
  type        = string
}

variable "r2_location" {
  description = "Pista de ubicación del bucket. EEUR mantiene los datos en la Unión Europea"
  type        = string
  default     = "EEUR"
}
