# ADR-007 · Toda tabla maestra lleva una clave sustituta

**Fecha:** 1 de agosto de 2026
**Estado:** Aceptada
**Revisa:** las claves primarias de `artwork_types` y `series`, y la naturaleza de `artist_fund`
**Continúa:** [ADR-006](ADR-006-ubicacion-como-arbol-de-lugares.md), que fijó el criterio para las
tablas nuevas y dejó la deuda de las existentes escrita pero sin retirar

---

## Contexto

ADR-006 dejó el criterio enunciado: «toda tabla maestra lleva una clave sustituta —un `uuid`— y el
nombre es un atributo más. Es lo que hace que renombrar sea gratis, y la razón por la que hoy no lo es
en las otras dos». El árbol de lugares nació así y funciona; las demás no.

Hoy hay tres listas maestras y ninguna de las tres cumple el criterio:

- **`artwork_types`** tiene el nombre por clave primaria, y `artworks.artwork_type` guarda ese texto.
- **`series`** tiene la pareja `(artist, name)` por clave, y `artworks.series` guarda el nombre
  suelto, sin el fondo. El filtro del listado ya documenta la consecuencia: filtra por nombre y mezcla
  fondos, porque el nombre es lo único que la obra guarda.
- **`artist_fund`** no es ni una tabla: es un tipo enumerado con tres valores, `ROTILI`,
  `RUIZ_CAMPINS` y `TEST`, y esos valores sostienen el prefijo de `catalog_id` (ADR-003).

Lo que se paga por eso es lo mismo que se pagaba con la ubicación en texto, y ya se ha pagado una vez.
Renombrar «Técnica mixta» exige tocar todas las obras que la usan. Y hay un coste añadido que la
ubicación no tenía: **un valor de enum no se puede retirar**. `ALTER TYPE` sabe añadir y renombrar,
pero no quitar; el día que `TEST` estorbe —es un fondo de ensayo que no debería aparecer en un catálogo
publicado— no habrá forma limpia de darlo de baja, porque un enumerado no tiene columna `active`.

La conversión del fondo, además, no es como las otras dos: el prefijo de `catalog_id` está escrito a
mano tres veces en el esquema —en `next_catalog_id`, en `tg_assign_catalog_id` y en la restricción
`artworks_prefix_matches_artist`— como un `case` sobre los valores del enumerado. Y `catalog_id` es la
etiqueta física pegada a la obra real.

## Decisión

**Las tres pasan a tener clave sustituta `uuid`, y el nombre pasa a ser un atributo.** El fondo pasa
además de tipo enumerado a tabla.

La obra apunta por identificador: `artwork_type_id`, `series_id` y `artist_fund_id`. Las columnas de
texto actuales —`artwork_type`, `series`, `artist`— se retiran en un despliegue posterior, como
`physical_location`, porque el frontend viejo corre unos segundos contra el esquema nuevo.

**El prefijo deja de estar escrito en el código y pasa a ser una columna** de la tabla de fondos.
`next_catalog_id` y el *trigger* que asigna el identificador lo leen de ahí en vez de decidirlo con un
`case`. Los prefijos existentes —`AR`, `RC`, `TS`— son legado y se conservan tal cual: están impresos
en etiquetas.

**Los valores del enumerado se conservan como código de la fila.** La tabla lleva `code` con
`ROTILI`, `RUIZ_CAMPINS` y `TEST`, con índice único, por dos motivos: el volcado de producción los
tiene escritos en cada obra y la conversión los necesita para emparejar, y el frontend ya los usa como
clave de sus etiquetas (`ARTIST_LABEL`). Es la misma regla que ADR-006 aplicó a los nombres de lugar:
lo que está en el mundo se conserva y se comenta que es legado.

### Se hace en dos entregas, y el fondo va en la segunda

**Primera: `artwork_types` y `series`.** Son listas normales, sin nada colgando de ellas más que la
obra. Se pueden convertir con el patrón de ADR-006 sin decisiones nuevas.

**Segunda: `artist_fund`.** Reescribe la generación de `catalog_id`, que es lo que se pega a un cuadro
con una etiqueta, y toca el candado por fondo que impide que dos catalogadores obtengan el mismo
número. Va aparte para que se pueda revisar con esa parte delante y no de refilón, y porque su test
—que la numeración siga siendo independiente por fondo y que ningún identificador se recicle— es el
que más importa de todo el esquema.

Separarlas es deliberado y no un aplazamiento: el criterio queda decidido aquí para las tres.

## Alternativas descartadas

**Dejarlo como está y aplicar el criterio solo a las tablas nuevas.** Es lo que ADR-006 hizo, y por eso
existe este ADR: la deuda no se paga sola y cada mes que pasa hay más obras apuntando por texto. Con
veintiuna obras la conversión es barata; con doscientas es un fin de semana.

**Clave natural con `on update cascade`.** PostgreSQL propagaría el renombrado a las obras sin que
nadie escriba una migración, así que el argumento de «renombrar es gratis» quedaría cubierto. Se
descarta porque no cubre el resto: no da baja lógica —una clave natural que se retira sigue siendo la
clave de las filas que la usan—, no admite dos nombres iguales en distinto contexto, y hace que cada
renombrado reescriba tantas filas de obras como usos tenga, con su *trigger* de auditoría disparándose
en todas. Es gratis de escribir y caro de ejecutar, justo al revés de lo que interesa.

**Convertir el fondo en tabla y dejar el prefijo en el código.** Menos que tocar, y el prefijo casi
nunca cambia. Se descarta porque entonces crear un fondo nuevo desde la interfaz produciría una fila
sin prefijo y un `case` que no la contempla: el identificador saldría nulo o la obra no se podría
crear, y el fallo aparecería al dar de alta la primera obra del fondo nuevo. Si el fondo es un dato,
su prefijo también.

**Conservar el enumerado y añadir una tabla al lado para los atributos.** Evita tocar `catalog_id`.
Deja dos fuentes para la misma lista y ningún sitio donde retirar un valor, que son los dos problemas
que se querían resolver.

## Consecuencias

- El filtro de series del listado deja de mezclar fondos si se quiere: la obra apuntará a la serie de
  su fondo, no a un nombre. Cambiar la semántica del filtro es una decisión de interfaz aparte —hoy
  está documentada y tiene su razón—, pero pasa a ser posible, y hoy no lo es.
- Renombrar un tipo de obra o una serie pasa a ser una fila, y **deja de mover `basic_updated_at`**
  (RF-802) por la misma construcción que en ADR-006: si la obra no se toca, su fecha no se mueve.
- Aparece la baja lógica donde no había: un tipo de obra o un fondo se pueden retirar sin borrarlos
  (RF-901), y con la misma regla que los lugares —no se retira lo que todavía tiene obras dentro.
- Las tres entran en la sección «Tablas» (RF-1106), que hoy solo tiene las ubicaciones. Renombrar y
  retirar necesitan pantalla; añadir seguirá pudiéndose desde el formulario de la ficha, que es donde
  hace falta.
- `artist_fund` seguirá existiendo como tipo mientras exista la columna `artworks.artist`, y se
  eliminará con ella. Un enumerado sin columnas que lo usen se borra con `drop type`.
- La restricción que comprueba que el prefijo de `catalog_id` concuerda con el fondo pasa a ser una
  comprobación contra la tabla, y por tanto un *trigger*: una restricción `check` no puede consultar
  otra tabla.
- Los tres tipos de TypeScript dejan de ser uniones de cadenas y pasan a ser filas cargadas, como
  `PhysicalPlace`. `ARTIST_LABEL`, que hoy traduce el código del enumerado a un nombre para la
  interfaz, se queda hasta que la tabla tenga su propio nombre legible: es el mismo mapa, y borrarlo
  antes dejaría la interfaz mostrando `RUIZ_CAMPINS`.
