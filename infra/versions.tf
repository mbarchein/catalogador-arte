terraform {
  required_version = "~> 1.15"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.5"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 3.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado remoto en Cloudflare R2, compatible con el backend s3.
  # La configuración no admite variables, así que se pasa aparte:
  #   terraform init -backend-config=backend.hcl
  # Ver backend.hcl.example y el apartado «Arranque» del README.
  backend "s3" {}
}
