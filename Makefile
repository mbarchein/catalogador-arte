.DEFAULT_GOAL := help

# Puertos publicados. Están por debajo de 32768 a propósito: ahí empieza el rango
# de puertos efímeros de Linux, y publicar dentro de él (54321, 54322…) hace que
# cualquier conexión saliente pueda quedarse con el puerto y que el stack falle al
# arrancar de forma intermitente. Sobrescribibles desde .env.
PUERTO_APP    ?= 5173
PUERTO_API    ?= 8321
PUERTO_CORREO ?= 8325
PUERTO_DB     ?= 5433
PUERTO_S3     ?= 9100
export PUERTO_APP PUERTO_API PUERTO_CORREO PUERTO_DB PUERTO_S3

# Host con el que la aplicacion esta REALMENTE configurada. Anunciar «localhost»
# cuando DEV_HOST apunta a la red local hace perder el tiempo: la pagina carga en
# el movil pero el login falla, porque el JavaScript le dice al telefono que llame
# a su propio localhost.
DEV_HOST_ENV := $(shell grep -E '^DEV_HOST=' .env 2>/dev/null | cut -d= -f2)
HOST := $(if $(DEV_HOST_ENV),$(DEV_HOST_ENV),localhost)
AVISO_HOST := $(if $(DEV_HOST_ENV),Configurado para la red local: abre http://$(DEV_HOST_ENV):$(PUERTO_APP) en el movil.,Para probar desde el movil: make movil)
.PHONY: help up down reset logs ps psql seed-users db-test test typecheck permisos \
        build preview clean verificar infra-check infra-plan infra-apply movil \
        db-pull db-load db-clone casos-color

help: ## Lista de comandos
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

up: ## Levanta el stack local completo y siembra los usuarios
	docker compose up -d
	@echo "Esperando a que se apliquen las migraciones…"
	@docker compose wait migrate >/dev/null 2>&1 || true
	@bash docker/seed-users.sh
	@echo
	@# Se anuncia el host con el que la aplicacion esta REALMENTE configurada. Sin
	@# esto, decir «localhost» cuando DEV_HOST apunta a la red local hace perder el
	@# tiempo: la pagina carga en el movil pero el login falla, porque el JavaScript
	@# le dice al telefono que llame a su propio localhost.
	@echo "App:      http://$(HOST):$(PUERTO_APP)"
	@echo "API:      http://$(HOST):$(PUERTO_API)"
	@echo "Correo:   http://localhost:$(PUERTO_CORREO)"
	@echo "Postgres: localhost:$(PUERTO_DB) (supabase_admin/postgres)"
	@echo
	@echo "$(AVISO_HOST)"

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

# Copia de producción para trabajar en local. El esquema NO viaja: sale de las
# migraciones, que son la fuente única. Lo que viaja son las filas, y con
# FOTOS=1 también las fotografías (FOTOS=todo añade los másters de B2).
db-pull: ## Descarga los datos de produccion a volcados/ (FOTOS=1 o FOTOS=todo)
	FOTOS=$(FOTOS) bash docker/db-pull.sh

db-load: ## Carga el ultimo volcado (VOLCADO=ruta, CONFIRM=yes). BORRA los datos locales
	CONFIRM=$(CONFIRM) bash docker/db-load.sh $(VOLCADO)

db-clone: ## db-pull y db-load seguidos (FOTOS=1 o FOTOS=todo, CONFIRM=yes)
	$(MAKE) db-pull FOTOS=$(FOTOS)
	$(MAKE) db-load CONFIRM=$(CONFIRM)

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

# No necesita el stack levantado: solo lee los ficheros del pipeline.
pipeline-test: ## Tests de los invariantes del pipeline de despliegue
	./.github/pipeline.test.sh

# Ata las dos implementaciones de la cadena de color: la del navegador y la de la
# herramienta local que genera las copias corregidas pendientes (RF-421). Regenera
# el fichero de casos versionado —parámetros contra las tablas de 256 entradas que
# producen— desde los tests del frontend, y con él verifica las tablas de Python.
#
# `make test` ya avisa cuando el fichero deja de coincidir con el código; esto es
# lo que hay que ejecutar cuando avisa, y después mirar el diff: si el fichero
# cambia, el color de la aplicación ha cambiado. Los tests de Python no necesitan
# red ni base de datos.
casos-color: ## Regenera los casos de color y verifica la herramienta por lotes
	docker compose exec -T -e UPDATE_COLOR_CASES=1 app \
	  npx vitest run src/lib/imageColor.fixture.test.ts
	python3 scripts/copias-corregidas/test_corrected_copies.py

typecheck: ## Comprobación de tipos del frontend
	docker compose exec app npm run typecheck

build: ## Compilación de producción del frontend
	docker compose exec app npm run build

preview: ## Sirve la compilación de producción en :8080 (para probar la PWA)
	docker compose --profile preview up --build -d app-preview
	@echo "Vista previa: http://localhost:8080"

verificar: ## Todo lo que verifica CI: pipeline, infra, tipos, tests de SQL y de frontend
	$(MAKE) pipeline-test
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

# Los flujos de infraestructura viven en infra/Makefile (make -C infra help):
# aquí solo se delega para no tener la lógica dos veces.
infra-check: ## Formato y validez del Terraform
	$(MAKE) -C infra check

infra-plan: ## terraform plan
	$(MAKE) -C infra plan

infra-apply: ## terraform apply (a mano, tras leer el plan)
	$(MAKE) -C infra apply
