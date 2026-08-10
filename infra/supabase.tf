# Supabase project: database, authentication, API and storage.
#
# IMPORTANT — division of responsibilities:
# Terraform manages the project and its platform settings. It does NOT manage the
# database schema nor the RLS policies. Tables, constraints,
# triggers and policies live in versioned SQL in supabase/migrations/ and
# Supabase's CLI applies them from the continuous integration flow.
#
# The reason is not a limitation of the provider: it is that the schema needs
# ordered and reversible migrations over data already loaded, and that is
# exactly what Terraform does not know how to do. Managing tables with PostgreSQL's
# provider from here would conflict with the migrations.

resource "random_password" "db" {
  count  = var.supabase_db_password == null ? 1 : 0
  length = 32
  # Alphanumeric only on purpose: the password ends up embedded in connection
  # URIs (Supabase's CLI in CI, the pooler, psql), and a special character
  # would force encoding it on every use — the classic failure that only appears in
  # production and with a particular password.
  special = false
}

locals {
  db_password = coalesce(var.supabase_db_password, try(random_password.db[0].result, null))
}

resource "supabase_project" "principal" {
  organization_id   = var.supabase_organization_id
  name              = var.proyecto
  database_password = local.db_password
  region            = var.supabase_region

  lifecycle {
    # The password cannot be read back from the API, so Terraform
    # would always see it as a pending change. It is set on creating the project and
    # it is rotated from the panel if need be.
    ignore_changes = [database_password]
  }
}

# The project's API keys. The anonymous one is public by design —it identifies the
# project, it authorises nothing; the perimeter is the RLS policies (RF-111)— and from
# here it propagates to the frontend's build and to the Actions variables.
#
# The service_role, which this same data source also exposes, is NOT propagated to
# anywhere: it ignores all the policies, and RF-111 requires that it appear neither in
# the client nor in the repository. If it is ever needed (e.g. for a
# dump), it is consumed in here and does not leave Terraform.
data "supabase_apikeys" "principal" {
  project_ref = supabase_project.principal.id
}

resource "supabase_settings" "principal" {
  project_ref = supabase_project.principal.id

  auth = jsonencode(merge(
    {
      # The links of the invitation and recovery emails point at the
      # own domain, not at the vercel.app URL.
      site_url = local.url_app

      # The recovery email redirects to the new-password page.
      # Outside this list, GoTrue degrades the redirect to site_url and the link
      # would land on the listing instead of on the form.
      uri_allow_list = "${local.url_app}/reset-password"

      # Only accounts created by the superuser: the catalogue has no open
      # registration and no public area (RF-101).
      disable_signup = true

      # A 12-hour session: it covers a day's cataloguing in the store without
      # forcing a new login, and it expires the next day.
      jwt_exp = 43200

      mailer_autoconfirm                                = false
      enable_confirmations                              = true
      security_update_password_require_reauthentication = true
    },
    # Leaked passwords, checked against HaveIBeenPwned. It is a Pro-plan feature: on
    # the free tier the API answers 402 and the apply fails, so the key is not
    # sent while the switch is off. Supabase's linter
    # will go on warning until then, and the warning is correct.
    var.proteccion_contrasenas_filtradas ? { password_hibp_enabled = true } : {},
    # Own SMTP via Resend, as in the team's other application. Without the
    # key, Supabase uses its built-in SMTP: it delivers only to the project's
    # members and in dribbles — good enough to start with, not for the team.
    var.resend_api_key == "" ? {} : {
      external_email_enabled = true
      smtp_admin_email       = "noreply@${var.dominio_zona}"
      smtp_host              = "smtp.resend.com"
      smtp_port              = "465"
      smtp_user              = "resend"
      smtp_pass              = var.resend_api_key
      smtp_sender_name       = "Catalogador"
    }
  ))

  api = jsonencode({
    # Only the public schema is exposed to PostgREST. Supabase's internal
    # schema and any auxiliary schema stay out of the API's reach.
    db_schema            = "public"
    db_extra_search_path = "public"

    # A cap on rows per request: it prevents a filtering error in the client
    # from fetching the whole catalogue.
    max_rows = 500
  })
}

output "supabase_project_ref" {
  description = "Referencia del proyecto, necesaria para la CLI y para el flujo de migraciones"
  value       = supabase_project.principal.id
}

output "supabase_url" {
  description = "URL base de la API del proyecto"
  value       = "https://${supabase_project.principal.id}.supabase.co"
}

output "db_password" {
  description = "Contraseña de la base de datos (generada si no se indicó). Leer con: terraform output -raw db_password"
  value       = local.db_password
  sensitive   = true
}
