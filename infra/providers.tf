provider "supabase" {
  access_token = var.supabase_access_token
}

provider "vercel" {
  api_token = var.vercel_token
}

provider "github" {
  owner = var.github_owner
  token = var.github_token
}

provider "b2" {
  application_key_id = var.b2_application_key_id
  application_key    = var.b2_application_key
}

# Only for the domain's DNS zone (dominio.tf). The application's traffic does NOT
# go through Cloudflare: the record is DNS-only, see the note in dominio.tf.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
