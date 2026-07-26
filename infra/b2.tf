# ── Backblaze B2: másters de archivo (ADR-002, actualización 27/07) ─────────
#
# Los másters (2-8 MB mínimo por toma) no caben en el gratuito de Supabase, y
# Cloudflare quedó descartado para tráfico de usuarios (ADR-005). El navegador
# sube y descarga con URL firmadas que emite la función Edge `firmar-fichero`:
# las credenciales solo viven allí y aquí, nunca en el cliente.

resource "random_id" "sufijo_b2" {
  # Los nombres de bucket de B2 son globales, como en S3.
  byte_length = 3
}

resource "b2_bucket" "masters" {
  bucket_name = "${var.proyecto}-masters-${random_id.sufijo_b2.hex}"
  bucket_type = "allPrivate"

  # B2 conserva TODAS las versiones por defecto, y eso es lo que se quiere: los
  # másters son el documento (ADR-002) y una sobrescritura o un borrado
  # accidental deben ser recuperables. No puede dejarse como regla explícita
  # porque la API rechaza una regla «conservar todo» (prefijo vacío y días a
  # cero): conservar todo es, precisamente, la ausencia de reglas.

  # El navegador hace PUT directo con la URL firmada: sin CORS, la subida desde
  # la aplicación fallaría en el preflight. El comodín es deliberado — la
  # autorización real es la firma de la URL, que caduca y la emite la función
  # tras comprobar el rol; restringir el origen aquí solo rompería el uso desde
  # la red local sin añadir seguridad.
  cors_rules {
    cors_rule_name  = "aplicacion"
    allowed_origins = ["*"]
    allowed_operations = [
      "s3_put",
      "s3_get",
      "s3_head",
    ]
    allowed_headers = ["*"]
    expose_headers  = ["etag"]
    max_age_seconds = 3600
  }
}

# Clave acotada al bucket y SIN capacidad de borrado: aunque la función Edge se
# comprometiera por completo, con estas credenciales no se puede destruir un
# máster. Es la versión en credenciales del «nada se borra de verdad» (RF-901).
resource "b2_application_key" "masters" {
  key_name  = "${var.proyecto}-funcion-firmas"
  bucket_id = b2_bucket.masters.bucket_id
  capabilities = [
    "readFiles",
    "writeFiles",
    "listFiles",
  ]
}

locals {
  s3_endpoint_b2 = "https://s3.${var.b2_region}.backblazeb2.com"
}

output "b2_bucket_masters" {
  description = "Bucket de másters en B2"
  value       = b2_bucket.masters.bucket_name
}
