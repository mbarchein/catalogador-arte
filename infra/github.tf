# Repository, branch protection and credentials of the integration flow.
#
# The credentials CI needs are derived from the resources created above,
# so that they do not have to be copied by hand into GitHub's panel: the identifier
# of the Supabase project or a bucket's name reach the Actions variables
# on their own. That is half the value of having this in Terraform.

resource "github_repository" "app" {
  count = var.gestionar_repositorio ? 1 : 0

  name        = var.github_repository
  description = "Inventario y catálogo razonado — Alberto Rotili / María Ruiz Campins"
  # Public by the team's decision (ADR-005). Nothing in the repository is secret:
  # the anonymous key is so by design, the local stack's JWT keys are Supabase's
  # well-known demonstration ones, and the real perimeter is the
  # RLS policies. The real secrets live in Actions and in Terraform's
  # state, never in the tree.
  visibility = "public"

  has_issues   = true
  has_projects = false
  has_wiki     = false

  # The catalogue's history matters: every commit documents a decision.
  allow_merge_commit     = false
  allow_squash_merge     = true
  allow_rebase_merge     = true
  delete_branch_on_merge = true

  lifecycle {
    # Do not destroy a repository with history over a configuration change.
    prevent_destroy = true
  }
}

locals {
  repo = var.gestionar_repositorio ? github_repository.app[0].name : var.github_repository
}

resource "github_repository_vulnerability_alerts" "app" {
  repository = local.repo
  enabled    = true
}

resource "github_branch_protection" "main" {
  repository_id = local.repo
  pattern       = "main"

  required_status_checks {
    strict = true
    contexts = [
      "verificar",
    ]
  }

  # A single operator: requiring another person's review would block the work.
  # What IS required is that the automatic verification pass before merging.
  enforce_admins      = false
  allows_deletions    = false
  allows_force_pushes = false
}

# --- Secrets ----------------------------------------------------------------
# Values that must never appear in an execution log.

resource "github_actions_secret" "supabase_access_token" {
  repository  = local.repo
  secret_name = "SUPABASE_ACCESS_TOKEN"
  value       = var.supabase_access_token
}

resource "github_actions_secret" "supabase_db_password" {
  repository  = local.repo
  secret_name = "SUPABASE_DB_PASSWORD"
  value       = local.db_password
}

resource "github_actions_secret" "vercel_token" {
  repository  = local.repo
  secret_name = "VERCEL_TOKEN"
  value       = var.vercel_token
}

resource "github_actions_secret" "vercel_org_id" {
  repository  = local.repo
  secret_name = "VERCEL_ORG_ID"
  value       = var.vercel_org_id
}

resource "github_actions_secret" "vercel_project_id" {
  repository  = local.repo
  secret_name = "VERCEL_PROJECT_ID"
  value       = vercel_project.app.id
}

# B2 credentials for the Edge function. S3_* names on purpose: the function
# signs generic S3, and changing storage provider must be changing
# these values, not the code (ADR-002's promise).
resource "github_actions_secret" "s3_key_id" {
  repository  = local.repo
  secret_name = "S3_KEY_ID"
  value       = b2_application_key.masters.application_key_id
}

resource "github_actions_secret" "s3_key_secret" {
  repository  = local.repo
  secret_name = "S3_KEY_SECRET"
  value       = b2_application_key.masters.application_key
}

# --- Variables --------------------------------------------------------------
# Non-sensitive values the flow needs to know. They are derived from the real
# resources, so they cannot get out of date with respect to the infrastructure.

resource "github_actions_variable" "supabase_project_ref" {
  repository    = local.repo
  variable_name = "SUPABASE_PROJECT_REF"
  value         = supabase_project.principal.id
}

resource "github_actions_variable" "supabase_url" {
  repository    = local.repo
  variable_name = "SUPABASE_URL"
  value         = "https://${supabase_project.principal.id}.supabase.co"
}

# The anonymous key is a variable and not a secret on purpose: it is public by
# design and it travels in the compiled JavaScript. Treating it as a secret would only make
# the CI logs illegible without protecting anything.
resource "github_actions_variable" "supabase_anon_key" {
  repository    = local.repo
  variable_name = "SUPABASE_ANON_KEY"
  value         = data.supabase_apikeys.principal.anon_key
}

resource "github_actions_variable" "s3_endpoint" {
  repository    = local.repo
  variable_name = "S3_ENDPOINT"
  value         = local.s3_endpoint_b2
}

resource "github_actions_variable" "s3_region" {
  repository    = local.repo
  variable_name = "S3_REGION"
  value         = var.b2_region
}

resource "github_actions_variable" "s3_bucket_masters" {
  repository    = local.repo
  variable_name = "S3_BUCKET_MASTERS"
  value         = b2_bucket.masters.bucket_name
}

resource "github_actions_variable" "app_url" {
  repository    = local.repo
  variable_name = "APP_URL"
  value         = local.url_app
}
