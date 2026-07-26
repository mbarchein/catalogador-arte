# Infraestructura

Toda la plataforma del proyecto como código. Nada se configura en paneles: los paneles se usan para
crear cuentas y tokens, y a partir de ahí Terraform crea y conecta todo — incluidos los secretos y
variables que consume el pipeline de despliegue.

Decisiones que justifican cada pieza: [ADR-001](../docs/decisiones/ADR-001-stack-y-despliegue.md)
(stack), [ADR-002](../docs/decisiones/ADR-002-almacenamiento-de-imagenes.md) (almacenamiento),
[ADR-004](../docs/decisiones/ADR-004-fecha-estructurada.md) (fecha) y
[ADR-005](../docs/decisiones/ADR-005-vercel-repo-publico-y-vivo.md) (Vercel, repo público, vivo y
dominio).

## Mapa

```
                      catalogo.ruizcampins.com
                                │
              Cloudflare DNS (CNAME solo-DNS, nube gris)
              el tráfico NO pasa por su proxy → dominio.tf
                                │
                                ▼
   navegador ────────────► VERCEL  (frontend estático, PWA)
      │
      ├─ /auth /rest /realtime /storage ──► SUPABASE  (Postgres+RLS, Auth,
      │                                     derivadas y miniaturas, WebSockets)
      ├─ /functions/firmar-fichero ───────► función Edge (firma S3; único lugar,
      │                                     junto al estado de TF, con las
      │                                     credenciales del almacén)
      └─ PUT/GET con URL firmada ─────────► BACKBLAZE B2  (másters 2-8 MB+,
                                            clave SIN capacidad de borrado)

   GitHub (repo público, protección de rama, Actions) ─► despliega app y función
   Cloudflare R2 (solo bootstrap/) ─► estado de Terraform: tráfico de operador
```

## Qué gestiona Terraform y qué no

Esta es la frontera más importante de entender, y no es una limitación del provider sino una decisión
deliberada:

| Terraform (`infra/`) | SQL versionado (`supabase/migrations/`) |
|---|---|
| Proyecto de Supabase y sus ajustes de plataforma | Tablas, columnas, restricciones e índices |
| Ajustes de autenticación y de la API | **Políticas RLS** |
| Proyecto de Vercel y dominio (zona en Cloudflare) | *Triggers* y funciones SQL |
| Bucket de B2 y su clave acotada | Publicación de Realtime |
| Repositorio (público), protección de ramas | Datos de referencia |
| Secretos y variables de Actions | |

El esquema necesita migraciones ordenadas sobre datos ya cargados, que es exactamente lo que Terraform
no sabe hacer: su modelo es converger a un estado, no recorrer una secuencia de transformaciones.
El código de la función Edge tampoco es Terraform: vive en `supabase/functions/` y lo despliega CI.

**Las políticas RLS son el único perímetro de seguridad de la aplicación** (ADR-001): no hay backend, y
la clave anónima viaja en el cliente. Viven en SQL, se revisan como código y se verifican con tests
antes de cada despliegue.

## Estructura

```
infra/
├── versions.tf              Proveedores (supabase, vercel, cloudflare, github, random, b2) y backend
├── providers.tf             Autenticación de cada proveedor
├── variables.tf             Todas las entradas (ver tabla más abajo)
├── supabase.tf              Proyecto, ajustes de auth/API, contraseña generada, claves de API
├── vercel.tf                Proyecto del frontend (root app/, sin muro de acceso)
├── dominio.tf               catalogo.ruizcampins.com: CNAME solo-DNS hacia Vercel
├── b2.tf                    Bucket de másters + clave sin borrado + CORS para el PUT del navegador
├── github.tf                Repo, protección de rama, secretos y variables de Actions
├── terraform.tfvars.example Plantilla de valores; copiar a terraform.tfvars (ignorado por git)
├── backend.hcl.example      Plantilla del backend; copiar a backend.hcl (ignorado por git)
└── bootstrap/               Crea el bucket R2 del estado. Se ejecuta UNA vez, con estado local
```

## Requisitos previos (cuentas)

1. **Supabase** — con una **organización propia para este proyecto** (gratuita): las cuotas del plan
   gratuito se comparten por organización, y así no compiten con otros proyectos. Ojo: el gratuito
   admite **2 proyectos activos en total** entre todas tus organizaciones.
2. **Vercel** — cuenta Hobby (no comercial; este proyecto encaja).
3. **GitHub** — donde vivirá el repo (público).
4. **Cloudflare** — con la zona `ruizcampins.com` ya delegada.
5. **Backblaze B2** — cuenta gratuita (10 GB).

## Credenciales

Ninguna se guarda en el repositorio. Consíguelas y ten a mano también los dos identificadores no
secretos (organización de Supabase y cuenta de Cloudflare).

| Credencial | Dónde se obtiene | Alcance mínimo |
|---|---|---|
| Token de Supabase | supabase.com → Account → Access Tokens | La organización del proyecto |
| Token de Vercel | vercel.com → Account → Tokens | Completo (crea el proyecto) |
| Token de GitHub | Settings → Developer settings → Tokens (classic) | `repo`, `admin:repo_hook` |
| Token de Cloudflare (DNS) | My Profile → API Tokens | `Zone:DNS:Edit` sobre `ruizcampins.com` |
| Token de Cloudflare (estado) | Igual; puede ser el mismo token con ambos permisos | `Workers R2 Storage:Edit` |
| Par de claves R2 | Panel → R2 → Manage API tokens | Lectura/escritura del bucket del estado |
| Clave maestra de B2 | B2 → Application Keys | Solo la usa Terraform; crea el bucket y una clave acotada |

## Variables: referencia completa

### `infra/terraform.tfvars` (plano principal)

| Variable | Obligatoria | Valor por defecto | Qué es / de dónde sale |
|---|---|---|---|
| `proyecto` | no | `catalogador-arte` | Prefijo de nombres de recursos |
| `supabase_access_token` | **sí** | — | Token personal de Supabase |
| `supabase_organization_id` | **sí** | — | En la URL del panel de la organización |
| `supabase_region` | no | `eu-west-3` (París) | Datos en la UE |
| `supabase_db_password` | no | `null` → **se genera** | Solo fijarla al importar un proyecto existente. Recuperable: `terraform output -raw db_password` |
| `vercel_token` | **sí** | — | Token de API de Vercel |
| `vercel_org_id` | **sí** | — | `vercel whoami` o el panel; lo usa la CLI en CI |
| `cloudflare_api_token` | **sí** | — | El de `Zone:DNS:Edit` |
| `dominio_zona` | no | `ruizcampins.com` | Zona ya delegada en Cloudflare |
| `subdominio_app` | no | `catalogo` | La app queda en `catalogo.ruizcampins.com` |
| `vercel_cname_target` | no | `cname.vercel-dns.com` | Destino del CNAME; no tocar salvo que Vercel lo cambie |
| `b2_application_key_id` | **sí** | — | Clave maestra de B2 (solo para Terraform) |
| `b2_application_key` | **sí** | — | Su secreto |
| `b2_region` | no | `eu-central-003` (Ámsterdam) | Datos en la UE |
| `github_owner` | **sí** | — | Usuario u organización de GitHub |
| `github_token` | **sí** | — | Token con `repo` |
| `github_repository` | no | `catalogador-arte` | Nombre del repo |
| `gestionar_repositorio` | no | `true` | `false` si el repo ya existe y no quieres importarlo |

### `infra/bootstrap` (solo la primera vez)

| Variable | Obligatoria | Por defecto | Qué es |
|---|---|---|---|
| `proyecto` | no | `catalogador-arte` | Prefijo del bucket del estado |
| `cloudflare_api_token` | **sí** | — | El de `Workers R2 Storage:Edit` |
| `cloudflare_account_id` | **sí** | — | En la URL del panel de Cloudflare |
| `r2_location` | no | `EEUR` | Bucket del estado en la UE |

### Variables de entorno

Dos juegos, y conviene no confundirlos:

**Para ejecutar Terraform** (shell del operador; nunca en git):

```bash
# Credenciales del backend del estado (par de claves R2, protocolo S3):
export AWS_ACCESS_KEY_ID='...'
export AWS_SECRET_ACCESS_KEY='...'

# Alternativa a terraform.tfvars — cualquier variable puede venir del entorno
# con el prefijo TF_VAR_. Útil en el bootstrap y si no quieres tokens en disco:
export TF_VAR_supabase_access_token='...'
export TF_VAR_cloudflare_api_token='...'
```

**Para el stack local** (`.env` en la raíz, opcional; ver `.env.example`): `DEV_HOST` para probar
desde el móvil y `PUERTO_*` si algún puerto choca. No tiene relación con Terraform.

## Pasos, en orden

### 0. Comprobar en seco (sin credenciales)

```bash
make infra-check      # fmt + validate de los dos módulos
```

### 1. Bootstrap: el bucket del estado

El estado vive en un bucket R2 que esta configuración no puede crear, porque lo necesita para
arrancar. `bootstrap/` se ejecuta **una sola vez**, con estado local:

```bash
cd infra/bootstrap
export TF_VAR_cloudflare_api_token='...'    # el de R2
export TF_VAR_cloudflare_account_id='...'
terraform init
terraform apply
terraform output -raw backend_hcl > ../backend.hcl   # backend ya rellenado
```

### 2. Rellenar y aplicar el plano principal

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars    # rellenar con la tabla de arriba
export AWS_ACCESS_KEY_ID='...'                  # par de claves R2
export AWS_SECRET_ACCESS_KEY='...'
terraform init -backend-config=backend.hcl
terraform plan                                  # leerlo entero antes de aplicar, siempre
terraform apply
```

### 3. Comprobar lo creado

```bash
terraform output
# url_aplicacion   = https://catalogo.ruizcampins.com
# supabase_url     = https://<ref>.supabase.co
# b2_bucket_masters, vercel_url, supabase_project_ref
terraform output -raw db_password   # guardarla en el gestor de contraseñas
```

### 4. Después del apply (una vez)

1. **Primer despliegue**: `git push` a `main` (o lanzar `desplegar` con *workflow_dispatch*). El
   pipeline aplica migraciones, despliega la función Edge con sus secretos S3_* y publica en Vercel.
   Hasta este punto la base está vacía y sin funciones: es normal.
2. **Dominio**: la verificación y el certificado tardan de segundos a minutos tras propagarse el
   CNAME. `https://catalogo.ruizcampins.com` debe servir la aplicación; `*.vercel.app` queda de
   respaldo.
3. **Primer superusuario**: crear el usuario (panel de Supabase → Auth → Invite user) y promoverlo
   una única vez desde el editor SQL:
   ```sql
   update perfiles set rol = 'SUPERUSUARIO' where email = 'tu@correo';
   ```
   Es la única operación manual del arranque, y es inevitable: alguien tiene que ser el primero.
4. **Resto del equipo**: invitar desde el panel; asignar rol con el mismo `update` (`CATALOGADOR` o
   dejar el `LECTOR` por defecto — una cuenta nueva no puede escribir hasta que se la promueve).

## Lo que Terraform deja puesto en GitHub Actions

Para que se entienda de dónde sale cada cosa que consume `desplegar.yml`. No se copian a mano; si
cambian los recursos, cambian solos en el siguiente `apply`.

**Secretos** — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, `S3_KEY_ID`, `S3_KEY_SECRET` (la clave acotada de B2, sin borrado).

**Variables** — `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (pública por diseño),
`APP_URL` (el dominio), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_MASTERS`.

Los nombres `S3_*` son genéricos a propósito: cambiar de proveedor de almacenamiento de másters es
cambiar estos valores, no el código de la función.

## Trabajo habitual

```bash
terraform fmt -recursive      # formatear
terraform validate            # sintaxis y referencias
terraform plan                # qué cambiaría
```

Los dos primeros corren también en cada *pull request* (`verificar.yml`), y `main` exige que pasen.

`terraform apply` **no se ejecuta desde CI**: se lanza a mano tras leer el plan. Automatizarlo
ahorraría un minuto al mes a cambio de poder destruir el proyecto con un *merge* descuidado.

**La aplicación sí se despliega sola** (`desplegar.yml`): al fusionar en `main`, verifica de nuevo
—tests de RLS incluidos—, aplica migraciones, despliega la función Edge y sus secretos, y publica el
frontend, en ese orden. La frontera: la *plataforma* a mano, la *aplicación* en cada merge.

## Cosas que hay que saber

**El bloqueo del estado usa escrituras condicionales de R2** (`use_lockfile = true`). Si fallara en la
primera ejecución, ponlo a `false`: con un solo operador es asumible.

**La contraseña de la base la genera Terraform** (32 alfanuméricos: acaba dentro de URIs de conexión).
La API de Supabase no la devuelve, así que el recurso la ignora tras crearla (`ignore_changes`); si se
pierde el estado, se rota desde el panel.

**La clave de B2 no puede borrar.** Se crea sin `deleteFiles`: aunque la función Edge se comprometiera
entera, no hay credencial capaz de destruir un máster. El bucket además conserva todas las versiones.

**El CNAME del dominio es solo-DNS y debe seguir siéndolo.** Activar el proxy de Cloudflare
(nube naranja) recompraría los bloqueos de LaLiga, apilaría dos CDN y rompería el certificado de
Vercel. Está comentado en `dominio.tf` para el futuro tú que quiera «arreglarlo».

**Si el proyecto de Supabase se transfiere a otra cuenta u organización** (el panel lo permite y el
proyecto conserva URL y claves): actualiza `supabase_organization_id` en `terraform.tfvars` **y**
añade `organization_id` al `ignore_changes` de `supabase_project.principal` antes del siguiente
`plan` — si no, Terraform propondrá recrear el proyecto para «moverlo».

**El repositorio ya existe en local.** Si lo creas a mano en GitHub antes del `apply`, pon
`gestionar_repositorio = false` o impórtalo:

```bash
terraform import 'github_repository.app[0]' catalogador-arte
```

**La clave anónima de Supabase es pública por diseño.** Identifica el proyecto, no autoriza nada: lo
que protege los datos son las políticas RLS. Lo que jamás sale del estado de Terraform ni de los
secretos es la `service_role`, que las ignora todas — ni siquiera la función Edge la usa.
