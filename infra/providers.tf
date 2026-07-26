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
