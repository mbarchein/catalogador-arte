# ── Vercel: frontend hosting (ADR-005) ─────────────────────
# The build arrives from CI (`vercel build` + `vercel deploy --prebuilt`,
# see .github/workflows/desplegar.yml): the Vercel project stores no
# environment variable — CI is the only source of the VITE_*.
#
# With no file buckets here: the images live in Supabase Storage (ADR-002's
# amendment in ADR-005), and Terraform's state stays in R2 via
# bootstrap/ because it is operator traffic, not user traffic.

resource "vercel_project" "app" {
  name           = var.proyecto
  framework      = "vite"
  root_directory = "app" # la aplicación Vite vive en app/, no en la raíz

  # No access wall in any deployment. Production is already public with the
  # standard protection, but it is set explicitly: an interstitial in front
  # of the PWA would break the service worker and the manifest's loading.
  vercel_authentication = {
    deployment_type = "none"
  }
}

output "vercel_url" {
  description = "URL de producción del frontend"
  value       = "https://${vercel_project.app.name}.vercel.app"
}
