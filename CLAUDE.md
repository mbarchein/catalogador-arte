# Convenciones del proyecto

## Idioma

- **Código fuente: inglés.** Identificadores (variables, funciones, tipos, componentes), nombres de
  ficheros fuente, comentarios y el esquema SQL completo — tablas, columnas, funciones, *triggers*,
  vistas, políticas RLS, índices y *constraints* (`catalog_id`, `attributed_title`, `artworks`,
  `can_edit()`...). Los tipos de TypeScript se alinean con ese esquema, que es de donde se generarán.
- **Los datos no se traducen.** Los valores ya persistidos son datos, no código: los valores de enum
  (`ROTILI`, `CATALOGADOR`, `SIN_REVISAR`...), los identificadores de catalogación (`AR-0001`), el
  id del bucket de storage (`obras`), las rutas de ficheros ya subidos, la base IndexedDB
  `catalogador` y su almacén `cola-fotos`, y las rutas de URL ya impresas en QR (`/obra/:id`).
  Cuando el código los nombra, se comenta que son legado.
- **Textos de interfaz: español de España** (`es-ES`, `Europe/Madrid`). Incluye los mensajes de
  error que ve la usuaria, también los `raise exception` de la base y los de las funciones Edge que
  la aplicación muestra tal cual.
- **Documentación (`docs/`) y mensajes de commit: español.**

## Commits

- **Un commit por unidad funcional independiente.** Si un cambio se puede revertir por separado sin
  romper nada, va en su propio commit. No agrupar «modelos + vistas + tests de tres entidades» en uno.
- Formato [Conventional Commits](https://www.conventionalcommits.org/) con asunto en español,
  en imperativo y sin punto final:
  `feat: modelo de Obra con clave de catalogación`, `docs: especificación de requisitos`,
  `test: cobertura del bloqueo de edición`, `fix: cascada de baja lógica en imágenes`.
- Tipos en uso: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- **Los mensajes de commit no mencionan Claude, Anthropic ni ninguna herramienta de IA.** Sin trailer
  `Co-Authored-By`, sin «Generated with». El historial se lee como trabajo propio.
- **Identidad de autor:** `mariobarchein@gmail.com`. Configurada en local en este repositorio
  (`git config --local user.email`), lo que prevalece sobre la identidad global de la máquina.
  Nunca firmar con la cuenta corporativa.

## Tests

- **Todo código lleva tests.** Ninguna política, *trigger*, componente o utilidad se da por terminado
  sin cobertura. Un commit `feat:` va acompañado de sus tests, en el mismo commit o en un `test:`
  inmediatamente posterior.
- Los tests **citan el requisito que verifican** por su identificador (`RF-402`, `RNF-111`), en el
  nombre o en la descripción. Esos identificadores no se traducen. El plan de pruebas
  ([`docs/plan-de-pruebas.md`](docs/plan-de-pruebas.md)) mantiene la correspondencia entre requisitos
  y tests, y sirve para detectar requisitos sin verificar.
- **Las políticas RLS son la primera prioridad, por delante de todo lo demás.** No hay backend: son el
  único perímetro de seguridad y la clave anónima viaja en el cliente. Su fallo no corrompe datos, los
  expone. Detrás van las reglas con consecuencia sobre los datos, la captura en móvil, la validación y
  el renderizado.
- Los tests de RLS se escriben **autenticándose de verdad** como un usuario de cada rol y consultando
  la base. Comprobar que el fichero de política existe no verifica nada.
- Toda incidencia corregida deja antes un test que la reproduce.

## Estructura del repositorio

```
docs/               Documentación del proyecto (ver docs/README.md)
  originales/       Documentos fuente, copiados sin modificar
  decisiones/       Decisiones de arquitectura (ADR)
  disenos/          Maquetas de interfaz
  revision/         Incidencias detectadas sobre los documentos fuente
app/                La PWA (React + TypeScript + Vite)
supabase/           Esquema, triggers y políticas RLS en SQL versionado
  migrations/       Migraciones (las aplicadas NO se reescriben: cambio nuevo, migración nueva)
  functions/        Funciones Edge (Deno)
  tests/            Tests de SQL: RLS y reglas del esquema (make db-test)
docker/             Stack local completo sin la CLI de Supabase
infra/              Plataforma como código con Terraform (ver infra/README.md)
  bootstrap/        Crea el bucket del estado. Se ejecuta una sola vez
.github/workflows/  Verificación automática y despliegue
```

**Frontera que no se cruza:** Terraform gestiona la plataforma; el esquema y las políticas RLS van en
SQL versionado que aplica la CLI de Supabase. El motivo está en [`infra/README.md`](infra/README.md).

**Las migraciones aplicadas no se reescriben.** Renombrar o borrar una columna en uso exige
despliegue en dos fases: el frontend viejo corre unos segundos contra el esquema nuevo (ver el
comentario de `.github/workflows/desplegar.yml`).

## Criterios de diseño heredados de los documentos fuente

Reglas que ya están decididas y no conviene reabrir sin motivo:

- **Nunca una página en blanco.** Una búsqueda sin resultados devuelve la misma página con el mensaje
  «No se han encontrado obras con estos criterios», nunca un listado vacío sin explicación. Lo mismo
  con los bloques de una ficha: «Sin referencias registradas» antes que un hueco.
- **Nunca un borrado real.** Toda eliminación es baja lógica con traza de quién y cuándo.
- **Una tabla sin política RLS está abierta, no cerrada.** Crear una tabla sin sus políticas y sus
  tests es publicar sus datos. No hay servidor que niegue por omisión.
- **Al crear una tabla: activar RLS, revocar privilegios y luego concederlos uno a uno.** La plataforma
  concede por omisión *todos* los privilegios de cada tabla nueva a los roles anónimo y autenticado —
  incluido `delete`. La migración inicial ya revoca los privilegios por omisión para el futuro, pero
  conviene comprobarlo: el test de cierre por omisión avisa de la parte de RLS, no de los `grant`.
- **El móvil es el dispositivo principal**, no un caso adaptado: la interfaz se diseña partiendo de una
  mano y una pantalla pequeña, con la obra delante y en un almacén.
- **Las claves primarias no se editan** una vez creada la ficha: son el eje de las tablas relacionadas
  y, en el caso de `catalog_id`, la etiqueta física pegada en la obra real.
- **«Sin revisar» no es «no».** Distinguir siempre el dato pendiente de investigar del dato investigado
  sin resultado (`N/D`) y del dato dudoso (`[?]`).
