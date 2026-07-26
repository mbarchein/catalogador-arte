# Infraestructura

Toda la plataforma del proyecto como código: proyecto de Supabase, alojamiento del frontend en
Vercel, dominio `catalogo.ruizcampins.com` (zona DNS en Cloudflare, registro **solo-DNS** — el
tráfico no pasa por su proxy, ver `dominio.tf`), bucket de másters en Backblaze B2 y configuración
del repositorio de GitHub. El bucket R2 del estado de Terraform vive en `bootstrap/`.

Decisiones que justifican esto: [ADR-001](../docs/decisiones/ADR-001-stack-y-despliegue.md) (stack),
[ADR-002](../docs/decisiones/ADR-002-almacenamiento-de-imagenes.md) (almacenamiento) y
[ADR-005](../docs/decisiones/ADR-005-vercel-repo-publico-y-vivo.md) (Vercel, repo público y vivo).

## Qué gestiona Terraform y qué no

Esta es la frontera más importante de entender, y no es una limitación del provider sino una decisión
deliberada:

| Terraform (`infra/`) | SQL versionado (`supabase/migrations/`) |
|---|---|
| Proyecto de Supabase y sus ajustes de plataforma | Tablas, columnas, restricciones e índices |
| Ajustes de autenticación y de la API | **Políticas RLS** |
| Proyecto de Vercel | *Triggers* (entre ellos el que impone el bloqueo de edición) |
| Repositorio (público), protección de ramas | Funciones y vistas |
| Secretos y variables de Actions | Datos de referencia y publicación de Realtime |

El esquema necesita migraciones ordenadas y reversibles sobre datos ya cargados, que es exactamente lo
que Terraform no sabe hacer: su modelo es converger a un estado deseado, no recorrer una secuencia de
transformaciones. Gestionar tablas desde aquí con el provider de PostgreSQL entraría además en
conflicto con las migraciones de la CLI de Supabase.

**Las políticas RLS son el único perímetro de seguridad de la aplicación** (ADR-001): no hay backend, y
la clave anónima viaja en el cliente. Viven en SQL, se revisan como código y se verifican con tests
antes de cada despliegue.

## Estructura

```
infra/
├── versions.tf              Versiones de Terraform y de los proveedores; backend remoto
├── providers.tf             Configuración de los tres proveedores
├── variables.tf             Entradas, con validación
├── supabase.tf              Proyecto y ajustes de plataforma
├── vercel.tf                Proyecto del frontend
├── github.tf                Repositorio, protección de ramas, secretos y variables
├── terraform.tfvars.example Plantilla de valores; copiar a terraform.tfvars
├── backend.hcl.example      Plantilla del backend; copiar a backend.hcl
└── bootstrap/               Crea el bucket del estado. Se ejecuta una sola vez
```

## Arranque

El estado de Terraform vive en un bucket de R2 que la propia configuración no puede crear, porque lo
necesita para arrancar. De ahí el módulo `bootstrap/`, que se ejecuta una vez con estado local.

### 1. Credenciales

Necesitas tres tokens. Ninguno se guarda en el repositorio.

| Token | Dónde se obtiene | Permisos |
|---|---|---|
| Supabase | Panel → Account → Access Tokens | Completo sobre la organización |
| Vercel | vercel.com → Account → Tokens | Completo (el provider crea el proyecto) |
| GitHub | Settings → Developer settings → Tokens | `repo` y `admin:repo_hook` |
| Cloudflare | Panel → My Profile → API Tokens | `Zone:DNS:Edit` sobre la zona del dominio; y `Workers R2 Storage:Edit` para `bootstrap/` |
| Backblaze B2 | B2 → Application Keys (clave maestra) | Solo la usa Terraform para crear bucket y clave acotada |

Además, un par de claves de acceso de R2 (Panel → R2 → Manage API tokens) para que Terraform pueda
escribir su propio estado.

### 2. Crear el bucket del estado

```bash
cd infra/bootstrap
export TF_VAR_cloudflare_api_token='...'
export TF_VAR_cloudflare_account_id='...'
terraform init
terraform apply
terraform output -raw backend_hcl > ../backend.hcl
```

La salida `backend_hcl` genera el fichero de configuración del backend ya rellenado, así que no hay que
copiar el identificador de cuenta a mano.

### 3. Aplicar la configuración principal

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # rellenar
export AWS_ACCESS_KEY_ID='...'                 # clave de acceso de R2
export AWS_SECRET_ACCESS_KEY='...'
terraform init -backend-config=backend.hcl
terraform plan      # leer el plan antes de aplicar, siempre
terraform apply
```

### 4. Comprobar

```bash
terraform output
```

Deben aparecer la referencia del proyecto de Supabase y la URL de Vercel. Los secretos
y variables del repositorio quedan puestos, de modo que el flujo de integración continua ya tiene lo que
necesita sin tocar el panel de GitHub.

## Trabajo habitual

```bash
terraform fmt -recursive      # formatear
terraform validate            # comprobar sintaxis y referencias
terraform plan                # ver qué cambiaría
```

Los dos primeros se ejecutan también en cada *pull request* (`.github/workflows/verificar.yml`), y la
rama `main` está protegida exigiendo que pasen antes de fusionar.

`terraform apply` **no se ejecuta desde CI**: es una operación con consecuencias sobre infraestructura
real y sobre datos, y se lanza a mano después de leer el plan. Automatizarla ahorraría un minuto al mes
a cambio de la posibilidad de destruir el proyecto por un *merge* descuidado.

**La aplicación sí se despliega sola** (`.github/workflows/desplegar.yml`): al fusionar en `main`,
verifica de nuevo —tests de RLS incluidos—, aplica las migraciones con la CLI de Supabase y publica el
frontend en Vercel, en ese orden, porque el frontend nuevo puede depender del esquema nuevo y lo
contrario nunca. La frontera es la misma de siempre: la *plataforma* se aplica a mano, la *aplicación*
se despliega en cada merge. Todos los secretos y variables que consume el pipeline los pone este
Terraform, así que el pipeline queda inerte hasta el primer `apply`.

## Cosas que hay que saber

**El bloqueo del estado usa escrituras condicionales de R2** (`use_lockfile = true`). Si diera error en
la primera ejecución, ponlo a `false`: con un solo operador, trabajar sin bloqueo es asumible.

**La contraseña de la base de datos la genera Terraform** si no se indica una (32 caracteres
alfanuméricos: acaba dentro de URIs de conexión y un carácter especial obligaría a codificarla en cada
uso). Se recupera con `terraform output -raw db_password`, y llega sola al secreto de Actions que usa
el despliegue. La API de Supabase no permite leerla de vuelta, así que `supabase_project` la ignora
tras la creación (`ignore_changes`); si se pierde el estado, se rota desde el panel.

**El repositorio ya existe en local.** Si lo creas primero a mano en GitHub, pon
`gestionar_repositorio = false` o impórtalo:

```bash
terraform import 'github_repository.app[0]' catalogador-arte
```

**La clave anónima de Supabase es pública por diseño.** Identifica el proyecto, no autoriza nada. Que
aparezca en el JavaScript compilado no es una fuga: lo que protege los datos son las políticas RLS. Lo
que nunca debe salir del gestor de secretos es la clave `service_role`, que las ignora todas.
