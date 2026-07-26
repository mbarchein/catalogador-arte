# ── Vercel: alojamiento del frontend (ADR-005) ──────────────
# La compilación llega desde CI (`vercel build` + `vercel deploy --prebuilt`,
# ver .github/workflows/desplegar.yml): el proyecto de Vercel no guarda ninguna
# variable de entorno — CI es la única fuente de las VITE_*.
#
# Sin buckets de ficheros aquí: las imágenes viven en Supabase Storage (la
# enmienda de ADR-002 en ADR-005), y el estado de Terraform sigue en R2 vía
# bootstrap/ porque es tráfico de operador, no de usuarios.

resource "vercel_project" "app" {
  name           = var.proyecto
  framework      = "vite"
  root_directory = "app" # la aplicación Vite vive en app/, no en la raíz

  # Sin muro de acceso en ningún despliegue. Producción ya es pública con la
  # protección estándar, pero se fija explícitamente: un interstitial delante
  # de la PWA rompería el service worker y la carga del manifiesto.
  vercel_authentication = {
    deployment_type = "none"
  }
}

output "vercel_url" {
  description = "URL de producción del frontend"
  value       = "https://${vercel_project.app.name}.vercel.app"
}
