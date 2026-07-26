.DEFAULT_GOAL := help
.PHONY: help up down reset logs ps psql seed-users db-test test typecheck permisos \
        build preview clean verificar infra-check infra-plan infra-apply movil

help: ## Lista de comandos
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

up: ## Levanta el stack local completo y siembra los usuarios
	docker compose up -d
	@echo "Esperando a que se apliquen las migraciones…"
	@docker compose wait migrate >/dev/null 2>&1 || true
	@bash docker/seed-users.sh
	@echo
	@echo "App:      http://localhost:5173"
	@echo "API:      http://localhost:54321"
	@echo "Correo:   http://localhost:54324"
	@echo "Postgres: localhost:54322 (supabase_admin/postgres)"

down: ## Detiene el stack
	docker compose down

reset: ## Destruye la base y reaplica migraciones y semilla
	docker compose down -v
	$(MAKE) up

logs: ## Registros de todos los servicios
	docker compose logs -f --tail=50

ps: ## Estado de los servicios
	docker compose ps

psql: ## Consola SQL sobre la base local
	docker compose exec db psql -U supabase_admin -d postgres

seed-users: ## Crea los usuarios de prueba, uno por rol (password123)
	bash docker/seed-users.sh

movil: ## Explica cómo abrir la app desde el móvil en la red local
	@ip=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	 echo "El móvil es el dispositivo del caso de uso principal, así que conviene"; \
	 echo "probar ahí desde el primer día."; \
	 echo; \
	 echo "  1. echo 'DEV_HOST=$$ip' >> .env"; \
	 echo "  2. make down && make up"; \
	 echo "  3. abre http://$$ip:5173 en el móvil, en la misma wifi"; \
	 echo; \
	 echo "Instalar como aplicación: menú del navegador → «Añadir a pantalla de inicio»."

db-test: ## Tests de SQL: políticas RLS y reglas del esquema
	@echo "Los tests de RLS son la primera prioridad del plan de pruebas:"
	@echo "sin backend, las políticas son el único perímetro de seguridad."
	@echo
	@for f in supabase/tests/*.test.sql; do \
	  echo "→ $$f"; \
	  docker compose exec -T -e PGPASSWORD=postgres db \
	    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f - < "$$f" || exit 1; \
	  echo; \
	done
	@echo "Tests de SQL OK"

test: ## Tests del frontend
	docker compose exec app npm test

typecheck: ## Comprobación de tipos del frontend
	docker compose exec app npm run typecheck

build: ## Compilación de producción del frontend
	docker compose exec app npm run build

preview: ## Sirve la compilación de producción en :8080 (para probar la PWA)
	docker compose --profile preview up --build -d app-preview
	@echo "Vista previa: http://localhost:8080"

verificar: ## Todo lo que verifica CI: infra, tipos, tests de SQL y de frontend
	$(MAKE) infra-check
	$(MAKE) typecheck
	$(MAKE) db-test
	$(MAKE) test

permisos: ## Recupera la propiedad de los ficheros que el contenedor creó como root
	@# El contenedor de node corre como root, así que package-lock.json y otros
	@# ficheros que genera dentro del montaje quedan sin permiso de escritura para
	@# tu usuario. Esto lo devuelve, sin necesitar sudo en el anfitrión.
	docker run --rm -v "$(PWD):/trabajo" -w /trabajo alpine \
	  chown -R $(shell id -u):$(shell id -g) app
	@echo "Propiedad restaurada."

clean: ## Detiene todo y borra los volúmenes, base de datos incluida
	docker compose --profile preview down -v

infra-check: ## Formato y validez del Terraform
	terraform -chdir=infra fmt -check -recursive -diff
	cd infra && terraform init -backend=false -input=false >/dev/null && terraform validate
	cd infra/bootstrap && terraform init -backend=false -input=false >/dev/null && terraform validate

infra-plan: ## terraform plan
	cd infra && terraform plan

infra-apply: ## terraform apply
	cd infra && terraform apply
