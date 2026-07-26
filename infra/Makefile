# Flujos de la infraestructura. El detalle de cada paso —qué credencial hace
# falta y de dónde sale— está en README.md; esto son los atajos.
.DEFAULT_GOAL := help
.PHONY: help check fmt init plan apply output password bootstrap

help: ## Lista de comandos
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

check: ## Formato y validez de los dos módulos (sin credenciales)
	terraform fmt -check -recursive -diff
	terraform init -backend=false -input=false > /dev/null
	terraform validate
	cd bootstrap && terraform init -backend=false -input=false > /dev/null && terraform validate

fmt: ## Formatear todo
	terraform fmt -recursive

# ── Primera vez ──────────────────────────────────────────────

bootstrap: ## Crea el bucket del estado y genera backend.hcl (una sola vez)
	@test -f bootstrap/terraform.tfvars || \
	 test -n "$$TF_VAR_cloudflare_api_token" -a -n "$$TF_VAR_cloudflare_account_id" || { \
	  echo "Faltan credenciales. O bien en el entorno:"; \
	  echo "  export TF_VAR_cloudflare_api_token='...'   # Workers R2 Storage:Edit"; \
	  echo "  export TF_VAR_cloudflare_account_id='...'"; \
	  echo "o bien: cp bootstrap/terraform.tfvars.example bootstrap/terraform.tfvars (y rellenar)"; \
	  exit 1; }
	cd bootstrap && terraform init -input=false && terraform apply
	cd bootstrap && terraform output -raw backend_hcl > ../backend.hcl
	@echo "backend.hcl generado. Siguiente paso: make init"

init: ## Conecta con el estado remoto (requiere backend.hcl y las claves R2)
	@test -f backend.hcl || { \
	  echo "Falta backend.hcl: ejecuta antes 'make bootstrap' (o copia backend.hcl.example)."; \
	  exit 1; }
	@test -n "$$AWS_ACCESS_KEY_ID" -a -n "$$AWS_SECRET_ACCESS_KEY" || \
	 grep -q '^access_key' backend.hcl || { \
	  echo "Faltan las claves de acceso de R2. O bien en el entorno:"; \
	  echo "  export AWS_ACCESS_KEY_ID='...'"; \
	  echo "  export AWS_SECRET_ACCESS_KEY='...'"; \
	  echo "o bien access_key/secret_key en backend.hcl (ver backend.hcl.example)."; \
	  exit 1; }
	terraform init -backend-config=backend.hcl

# ── Trabajo habitual ─────────────────────────────────────────

plan: ## Qué cambiaría. Leerlo entero antes de aplicar, siempre
	@test -f terraform.tfvars || { \
	  echo "Falta terraform.tfvars: copia terraform.tfvars.example y rellénalo"; \
	  echo "(la tabla de variables está en README.md)."; \
	  exit 1; }
	terraform plan

apply: ## Aplica el plan. NUNCA desde CI: es la plataforma, no la aplicación
	@test -f terraform.tfvars || { \
	  echo "Falta terraform.tfvars: copia terraform.tfvars.example y rellénalo."; \
	  exit 1; }
	terraform apply

output: ## Salidas no sensibles (URLs, referencias, buckets)
	terraform output

password: ## La contraseña de la base de datos, desde el estado
	@terraform output -raw db_password && echo