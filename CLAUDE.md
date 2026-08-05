# Convenciones del proyecto

## Idioma

- **Código fuente: inglés.** Identificadores (variables, funciones, tipos, componentes), nombres de
  ficheros fuente, comentarios, rutas de la aplicación (`/artwork/:id`, `/capture`), valores de enum
  (`CATALOGER`, `UNREVIEWED`, `SIGNATURE_DETAIL`...) y el esquema SQL completo — tablas, columnas,
  funciones, *triggers*, vistas, políticas RLS, índices y *constraints* (`catalog_id`,
  `attributed_title`, `artworks`, `can_edit()`...). Los tipos de TypeScript se alinean con ese
  esquema, que es de donde se generarán.
- **Los datos no se traducen, y lo que ya está en el mundo se conserva como legado.** No se tocan:
  los valores de `artist_fund` (`ROTILI` y `RUIZ_CAMPINS` son apellidos; `TEST` ya es inglés), los
  identificadores de catalogación (`AR-0001`) y sus prefijos, el id del bucket de storage (`obras`,
  fila en `storage.buckets` con objetos dentro) y las rutas de ficheros ya subidos. La ruta
  `/obra/:id` está impresa en QR físicos y se mantiene para siempre como redirección de legado en
  `App.tsx`. Renombrar algo persistido exige decidir la compatibilidad de forma explícita: los
  valores de enum se renombraron con `ALTER TYPE ... RENAME VALUE` (la base actualiza las filas
  sola), la clave de `localStorage` con una migración *one-shot* en `batch.ts`, y la base IndexedDB
  (`cataloger`/`photo-queue`) sin migrar contenido — se aceptó perder la cola de fotos pendiente una
  vez, y la base antigua se borra al abrir la nueva (`photoQueue.ts`). Cuando el código nombra un
  valor de legado, se comenta que lo es.
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

## Registro de cambios

- **Todo cambio que la usuaria pueda notar se anota en [`CHANGELOG.md`](CHANGELOG.md)**, en la sección
  que le corresponda: «Interfaz», «La base de datos del catálogo», «Diseño lógico de la aplicación y
  esquema de datos» o «Correcciones». Lo que no se nota desde la aplicación —refactorizaciones,
  arreglos del stack local, actualizaciones de dependencias— o se deja fuera o se agrupa en una línea.
- **El destinatario es la usuaria que cataloga, no un programador.** Se cuenta la consecuencia
  práctica, no el mecanismo: no «nueva tabla `physical_places` con *trigger* anticiclos», sino «mover
  una estantería entera se hace una vez y lo ven todas sus obras». Sin nombres de tabla, sin nombres
  de fichero y sin jerga.
- **Una entrada por grupo significativo de cambios, no por commit**, con la fecha del grupo (el mes, o
  el día si es de un solo día) y lo más reciente primero dentro de cada sección.
- La sección final **«En marcha»** recoge lo que está a medias. Al terminar algo que estuviera ahí, se
  retira de «En marcha» y pasa a su sección: dejarlo en las dos es peor que no tenerlo.
- Se actualiza **junto al trabajo que describe**, no en una pasada al final. Puede ir en el mismo
  commit o en un `docs:` inmediatamente posterior.

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
- **La batería está siempre verde. Nunca hay un test que falle, ni uno escrito para fallar.**
  - Ningún commit se hace, y menos se empuja, con la batería roja: `make verificar` en verde es la
    condición para empujar, no una comprobación posterior. Si algo se queda a medias, lo que se deja
    fuera es el código, no el test.
  - **No se escriben asertos «al revés»** que afirmen que una carencia sigue ahí para ponerse rojos el
    día que se arregle. Un rojo tiene que significar siempre lo mismo: algo se ha roto. Si un rojo
    puede significar «alguien ha arreglado algo», el color deja de informar y la batería deja de
    doler, que es lo único que hace que se ejecute. Lo que está pendiente se anota en el plan de
    pruebas y en el código que lo padece, no en un aserto.
  - Nada de `it.skip`, `it.todo`, `it.fails` ni tests comentados. Un test que no corre no protege
    nada y aparenta cobertura, que es peor que el hueco declarado.
  - Se puede —y a veces hay que— **comprobar que un test nuevo falla con el código anterior**: es lo
    que demuestra que reproduce la incidencia. Eso se hace en local y sobre un código que no se
    empuja; lo que se empuja es el par test + arreglo, en verde.

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
