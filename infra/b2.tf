# ── Backblaze B2: archive masters (ADR-002, update 27/07) ──────────────────
#
# The masters (2-8 MB minimum per shot) do not fit in Supabase's free tier, and
# Cloudflare was ruled out for user traffic (ADR-005). The browser
# uploads and downloads with signed URLs issued by the `sign-file` Edge function:
# the credentials live only there and here, never in the client.

resource "random_id" "sufijo_b2" {
  # B2 bucket names are global, as in S3.
  byte_length = 3
}

resource "b2_bucket" "masters" {
  bucket_name = "${var.proyecto}-masters-${random_id.sufijo_b2.hex}"
  bucket_type = "allPrivate"

  # B2 keeps ALL the versions by default, and that is what is wanted: the
  # masters are the document (ADR-002) and an accidental overwrite or deletion
  # must be recoverable. It cannot be left as an explicit rule
  # because the API rejects a «keep everything» rule (an empty prefix and days at
  # zero): keeping everything is, precisely, the absence of rules.

  # The browser does a direct PUT with the signed URL: with no CORS, the upload from
  # the application would fail at the preflight. The wildcard is deliberate — the
  # real authorisation is the URL's signature, which expires and is issued by the function
  # after checking the role; restricting the origin here would only break use from
  # the local network without adding any security.
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

# A key scoped to the bucket and WITH NO delete capability: even if the Edge function were
# completely compromised, with these credentials a master cannot be destroyed.
# It is the credentials version of «nothing is really deleted» (RF-901).
resource "b2_application_key" "masters" {
  key_name   = "${var.proyecto}-funcion-firmas"
  bucket_ids = [b2_bucket.masters.bucket_id]
  capabilities = [
    "readFiles",
    "writeFiles",
    "listFiles",
  ]
}

# A READ-ONLY key for fetching the masters to a laptop (FOTOS=todo in
# `make db-clone`). It is a second key and not the Edge function's on purpose:
# that one can write because it has to upload masters, and a local copy has
# no reason at all to be able to touch the archive. Separating them also allows
# revoking this one without leaving the application unable to sign.
resource "b2_application_key" "masters_lectura" {
  key_name   = "${var.proyecto}-lectura-local"
  bucket_ids = [b2_bucket.masters.bucket_id]
  capabilities = [
    "listBuckets",
    "listFiles",
    "readFiles",
  ]
}

locals {
  s3_endpoint_b2 = "https://s3.${var.b2_region}.backblazeb2.com"
}

output "b2_bucket_masters" {
  description = "Bucket de másters en B2"
  value       = b2_bucket.masters.bucket_name
}

# The two halves of the read key, for .env. Like the base's password:
# sensitive, they are read with `terraform output -raw` (or `make -C infra b2-keys`).
output "b2_lectura_key_id" {
  description = "Identificador de la clave de solo lectura de B2 (B2_KEY_ID)"
  value       = b2_application_key.masters_lectura.application_key_id
  sensitive   = true
}

output "b2_lectura_key_secret" {
  description = "Secreto de la clave de solo lectura de B2 (B2_KEY_SECRET)"
  value       = b2_application_key.masters_lectura.application_key
  sensitive   = true
}
