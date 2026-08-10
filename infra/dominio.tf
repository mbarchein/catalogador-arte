# ── Domain: catalogo.ruizcampins.com ────────────────────────
# The zone lives in Cloudflare; the hosting, in Vercel (ADR-005). The record
# is a **DNS-only (grey cloud)** CNAME towards Vercel's edge, and that detail is
# not optional for three reasons:
#
#  1. LaLiga's blocks hit the IPs of Cloudflare's *proxy*, not its
#     DNS. DNS-only = the traffic goes straight to Vercel and does not touch the blocked network.
#     Proxied, we would go right back to the problem we came out of.
#  2. Proxying would stack two CDNs (Cloudflare in front of Vercel), which is latency and
#     two places to debug caching in.
#  3. With a proxy, Vercel cannot issue or renew the domain's TLS
#     certificate: the validation does not reach it.
#
# The pattern is copied from the team's other application, where it has been in
# production for a while.

data "cloudflare_zone" "principal" {
  filter = {
    name = var.dominio_zona
  }
}

locals {
  app_fqdn = "${var.subdominio_app}.${var.dominio_zona}"
  url_app  = "https://${var.subdominio_app}.${var.dominio_zona}"
}

# Vercel verifies the ownership and issues the certificate through the CNAME
# below. The project also answers on its *.vercel.app URL, which is left as a
# fallback if the domain had problems.
resource "vercel_project_domain" "app" {
  project_id = vercel_project.app.id
  domain     = local.app_fqdn
}

resource "cloudflare_dns_record" "app" {
  zone_id = data.cloudflare_zone.principal.zone_id
  name    = var.subdominio_app
  type    = "CNAME"
  content = var.vercel_cname_target
  proxied = false # nube gris: ver la nota de cabecera
  ttl     = 1     # automático

  depends_on = [vercel_project_domain.app]
}

output "url_aplicacion" {
  description = "URL pública de la aplicación"
  value       = local.url_app
}

# ── Resend verification DNS (SPF/DKIM/MX) ───────────────────
# Resend's panel asks for them on adding the domain; without them, the
# transactional email does not go out or goes out marked as suspicious. The list arrives by
# variable because Resend generates the values for each account.
resource "cloudflare_dns_record" "resend" {
  for_each = { for r in var.resend_dkim_records : "${r.type}-${r.name}" => r }

  zone_id = data.cloudflare_zone.principal.zone_id
  name    = each.value.name
  type    = each.value.type
  # Cloudflare's v5 provider requires the TXT content in quotes
  # (otherwise it warns and quotes it itself); MX and CNAME go without quotes.
  content  = each.value.type == "TXT" ? "\"${each.value.content}\"" : each.value.content
  priority = try(each.value.priority, null)
  proxied  = false
  ttl      = 1
}
