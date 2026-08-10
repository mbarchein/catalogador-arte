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
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    b2 = {
      source  = "Backblaze/b2"
      version = "~> 0.10"
    }
  }

  # Remote state in Cloudflare R2, compatible with the s3 backend.
  # The configuration does not admit variables, so it is passed separately:
  #   terraform init -backend-config=backend.hcl
  # See backend.hcl.example and the README's «Arranque» section.
  backend "s3" {}
}
