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
