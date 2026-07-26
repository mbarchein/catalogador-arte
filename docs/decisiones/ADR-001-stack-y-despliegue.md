# ADR-001 · Stack y despliegue

**Fecha:** 26 de julio de 2026
**Estado:** Aceptada
**Sustituye a:** las decisiones de stack de la sección 1 y de la sección 15 del documento
[`../originales/diseno_interfaz_y_arquitectura_v4.md`](../originales/diseno_interfaz_y_arquitectura_v4.md)

---

## Contexto

El diseño original fijaba **Django + PostgreSQL** sobre la máquina Ubuntu del equipo, detrás del Apache
que ya sirve Moodle. Las fases 1 y 2 de esa hoja de ruta se completaron: entorno instalado, base de
datos creada, esqueleto de Django conectado y primer commit.

Tres requisitos nuevos, no contemplados entonces, obligan a revisarlo:

1. **Despliegue en tramos gratuitos de proveedores cloud**, sin coste recurrente.
2. **La aplicación debe ser una PWA**, instalable en el móvil.
3. **La captura de datos con el móvil es el caso de uso principal**, no accesorio: el catalogador
   trabaja de pie, en el almacén, con la obra delante y el teléfono en la mano.

El tercero es el que más pesa. El panel de administración de Django era, en la hoja de ruta original,
el atajo de la fase 4: un prototipo funcional gratis con el que validar el esquema contra obra real
antes de escribir vistas. Pero el admin de Django es un formulario denso pensado para escritorio y
teclado; como interfaz de captura rápida en un móvil es malo. El atajo que justificaba a Django dejaba
de servir para el caso de uso que ahora es prioritario.

Se decidió además que la PWA **no necesita funcionar sin conexión**: solo ser instalable. Eso evita el
único escenario que habría forzado una arquitectura local-first, y evita también el conflicto de fondo
entre la edición sin conexión y el bloqueo de edición (RF-700), que no se puede garantizar contra un
cliente desconectado.

## Decisión

Se abandona Django. La aplicación pasa a ser una **PWA estática que habla directamente con Supabase**.

| Pieza | Elección |
|---|---|
| Base de datos | PostgreSQL gestionado por Supabase |
| API | PostgREST, generada automáticamente por Supabase desde el esquema |
| Autenticación | Supabase Auth |
| Autorización | Row Level Security en PostgreSQL, con el rol en el perfil del usuario |
| Almacenamiento de ficheros | Supabase Storage, con políticas de acceso |
| Frontend | Vite + Svelte + TypeScript, compilado a estático |
| PWA | `vite-plugin-pwa`: manifest, iconos e instalación. Cachea el armazón de la aplicación, no los datos |
| Alojamiento del frontend | Cloudflare Pages |
| Integración y despliegue | GitHub Actions |
| Migraciones | SQL versionado en el repositorio, aplicado con la CLI de Supabase |
| Catálogo impreso (futuro) | Script Python/Jinja2 en local, conectado por `psycopg2` directamente a Postgres |

**TypeScript no es opcional en esta decisión.** La CLI de Supabase genera los tipos de las nueve tablas
a partir del esquema, de modo que el modelo de datos queda comprobado en tiempo de compilación sin
escribirlo dos veces. Es lo que compensa la pérdida de las validaciones que daba el ORM de Django.

## Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| **Django en la máquina propia + Cloudflare Tunnel** | Técnicamente la más sólida y sin límite de disco, pero mantiene el admin de escritorio como interfaz y la disponibilidad atada a una máquina doméstica. Se descarta por prioridad de iteración rápida y de captura móvil |
| **Django en Oracle Cloud Always Free** | En junio de 2026 Oracle redujo el tramo ARM gratuito de 4 OCPU/24 GB a 2 OCPU/12 GB, y reclama instancias inactivas. Sigue exigiendo administrar un servidor |
| **Django en Render** | Descartada de plano: el PostgreSQL del tramo gratuito **caduca a los 30 días** y se borra tras 14 de gracia. No es una base de datos, es una demo |
| **Contenedor gestionado + Neon** | Arranques en frío de 30 a 60 segundos en los tramos gratuitos, justo en el gesto que más importa: escanear el QR de la etiqueta con la obra delante |

## Consecuencias

### Lo que se gana

- Sin backend que escribir ni servidor que administrar: la iteración es editar el frontend y desplegar.
- La interfaz de captura se diseña desde cero para móvil, sin heredar un formulario de escritorio.
- Auth, API y almacenamiento vienen resueltos.
- Los tipos del esquema se generan, no se mantienen a mano.

### Lo que se pierde

- **El admin de Django como prototipo de la fase 4.** Ya no hay forma de validar el esquema con obra
  real sin haber escrito antes formularios propios. La validación del esquema con 15-20 obras a mano,
  que estaba en curso como acción de equipo, gana importancia: ahora es la única red antes de escribir
  código.
- **La aplicación deja de correr en la máquina del equipo**, y con ella desaparece la convivencia con
  Moodle vía Apache y `mod_proxy`. Esa máquina pasa a ser el almacén de los másters en alta resolución
  y el sitio desde el que se lanza el pipeline del catálogo impreso.
- **El ecosistema deja de ser solo Python.** El frontend es TypeScript y hace falta Node para compilar.
  El pipeline del catálogo impreso sigue siendo Python y sigue funcionando: Supabase es PostgreSQL, y un
  script local se conecta por `psycopg2` igual que se habría conectado a la base de datos local.

### Riesgos, y qué se hace con ellos

**RLS es el único perímetro de seguridad.** La clave anónima de Supabase viaja en el cliente, así que
no hay servidor que filtre nada: una política mal escrita expone los datos directamente. El riesgo es
concreto, no teórico — `contacto` de la tabla Propietarios/Instituciones son datos personales de
coleccionistas particulares.

Mitigación: los tests de políticas RLS pasan a ser la primera prioridad del plan de pruebas, por
delante de cualquier otra cosa. Cada tabla y cada operación se verifican autenticándose como cada rol.
Una tabla sin test de RLS se considera una tabla sin protección. Este es además el punto natural para
la revisión del asesor técnico externo que los documentos originales ya preveían.

**El bloqueo de edición deja de tener servidor que lo imponga.** Comprobarlo en el cliente lo
convierte en advertencia, no en bloqueo. Debe imponerse con un *trigger* en la base de datos que
rechace la escritura si otro usuario mantiene un bloqueo sin caducar.

**El almacenamiento gratuito de ficheros es de 1 GB**, y las derivadas de consulta del fondo completo
se estiman en torno a 1,5 GB. Mitigación en dos pasos: las imágenes se redimensionan **en el navegador
antes de subirlas** (una foto de móvil son 4-12 MB; la derivada de consulta debe rondar los 200 KB), y
si aun así se agota la cuota, las imágenes se migran a Cloudflare R2, que ofrece 10 GB con egreso cero.
El acceso a las imágenes se encapsula en una única función del frontend para que esa migración sea un
cambio en un solo sitio.

**Los másters en alta resolución no caben en ningún tramo gratuito.** Entre 3000 y 5000 tomas en alta
resolución son decenas de gigabytes. Quedan fuera de la aplicación, en el disco de la máquina del
equipo más una copia en disco externo. La aplicación guarda solo derivadas de consulta. Esto modifica
la decisión original de que todo fichero viviera dentro de la aplicación.

**El proyecto se pausa tras una semana sin actividad** en el tramo gratuito de Supabase, y hay que
reactivarlo a mano desde el panel. Es una molestia asumible en un proyecto que se trabaja a ráfagas,
pero conviene saberlo antes de volver de vacaciones.

**Sin copias de seguridad automáticas en el tramo gratuito.** Un volcado periódico de la base de datos
es responsabilidad del equipo.

## Requisitos afectados

Revisados en [`../requisitos.md`](../requisitos.md): RF-109, RF-110, RF-409, RF-701, RF-1105, el nuevo
grupo RF-1200, y los no funcionales RNF-101, RNF-103, RNF-104, RNF-107, RNF-109, RNF-113. El orden de
construcción de la sección 7 se reescribe por completo: las fases 1 y 2 de la hoja de ruta original
quedan obsoletas.
