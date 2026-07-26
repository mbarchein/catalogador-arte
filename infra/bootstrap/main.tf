# Arranque: crea el bucket donde vivirá el estado de Terraform.
#
# Existe por un problema de huevo y gallina: la configuración principal guarda su
# estado en un bucket de R2, y ese bucket no puede crearlo la misma configuración
# que lo necesita para arrancar. Este módulo se ejecuta una sola vez, con estado
# local, y después no se vuelve a tocar.

terraform {
  required_version = "~> 1.15"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_r2_bucket" "tfstate" {
  account_id = var.cloudflare_account_id
  name       = "${var.proyecto}-tfstate"
  location   = var.r2_location

  lifecycle {
    prevent_destroy = true
  }
}

output "backend_hcl" {
  description = "Contenido para backend.hcl de la configuración principal"
  value       = <<-EOT
    bucket = "${cloudflare_r2_bucket.tfstate.name}"
    key    = "infra/terraform.tfstate"
    region = "auto"

    endpoints = {
      s3 = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    use_lockfile                = true
  EOT
}
