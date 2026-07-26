# ── Dominio: catalogo.ruizcampins.com ───────────────────────
# La zona vive en Cloudflare; el alojamiento, en Vercel (ADR-005). El registro
# es un CNAME **solo-DNS (nube gris)** hacia el edge de Vercel, y ese detalle no
# es opcional por tres motivos:
#
#  1. Los bloqueos de LaLiga golpean las IPs del *proxy* de Cloudflare, no su
#     DNS. Solo-DNS = el tráfico va directo a Vercel y no toca la red bloqueada.
#     Proxiado, volveríamos exactamente al problema del que salimos.
#  2. Proxiar apilaría dos CDN (Cloudflare delante de Vercel), que es latencia y
#     dos sitios donde depurar caché.
#  3. Con proxy, Vercel no puede emitir ni renovar el certificado TLS del
#     dominio: la validación no le llega.
#
# Patrón copiado de la otra aplicación del equipo, donde lleva tiempo en
# producción.

data "cloudflare_zone" "principal" {
  filter = {
    name = var.dominio_zona
  }
}

locals {
  app_fqdn = "${var.subdominio_app}.${var.dominio_zona}"
  url_app  = "https://${var.subdominio_app}.${var.dominio_zona}"
}

# Vercel verifica la propiedad y emite el certificado a través del CNAME de
# abajo. El proyecto responde también en su URL *.vercel.app, que queda como
# respaldo si el dominio tuviera problemas.
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
