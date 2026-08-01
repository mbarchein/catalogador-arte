# ADR-006 · La ubicación física es un árbol de lugares

**Fecha:** 1 de agosto de 2026
**Estado:** Aceptada
**Revisa:** la convención de notación de `ubicacion_fisica` del esquema de campos v11 (cambio v2.5)
**Establece:** la clave primaria de las tablas maestras no es su nombre

---

## Contexto

El esquema de campos fijó `ubicacion_fisica` como texto libre con una convención: siempre en
minúsculas y sin tildes, y los niveles de la jerarquía separados por comas, de mayor a menor
(`edificio a, habitacion amarilla, bloque 3`). La convención no era cosmética: esos textos se agrupan
y se comparan para generar listas de trabajo, y sin normalizar, «Habitación amarilla» y
«habitacion amarilla» serían dos sitios distintos que no lo son.

Con veintiuna obras catalogadas, la convención muestra tres grietas.

**Se pierde el dato.** La normalización ocurre al teclear, así que lo que se guarda es lo que se
muestra: en la ficha y en el PDF impreso se lee «museo de bellas artes de badajoz muba». Los nombres
propios —ciudades, instituciones— necesitan sus mayúsculas y sus tildes.

**El separador aparece dentro de los valores.** De los nueve sitios registrados, el único de dos
niveles que existía de verdad era `villafranca de los barros, c/colon 11-1c`: pueblo más dirección
postal. Esa coma no separa contenedores, y la barra de `c/colon` habría roto igualmente cualquier
separador alternativo obvio.

**Renombrar es una migración.** El texto está copiado en cada obra. Cambiar «casa de mario y viqui»
por su nombre correcto exige tocar todas sus filas, y el estudio está en reordenación: mover una
estantería entera es una operación que se va a repetir.

La jerarquía real, además, resultó ser mucho más plana de lo que la convención anticipaba: siete de
nueve sitios son un solo nivel, no los cinco previstos.

## Decisión

La ubicación pasa de convención sobre un texto a **árbol de lugares**: la tabla
`physical_places (id, parent_id, name, active)`, y `artworks.physical_place_id` apuntando a un nodo.

**El nombre se guarda tal cual se escribe**, con sus mayúsculas y sus tildes. Lo que se normaliza es
la clave de comparación, y solo para comparar: `place_key(name)`, minúsculas y sin tildes salvo la ñ,
que es una letra y no un acento.

**La base garantiza lo que antes era una convención que había que recordar:**

- no hay dos hermanos con el mismo nombre, comparados por `place_key`, con índices únicos separados
  para las raíces y para el resto;
- no hay ciclos: un *trigger* sube por los padres al insertar o mover y rechaza el bucle;
- nada se borra de verdad (RF-901): los lugares se retiran, y no se puede retirar uno que tenga
  obras o hijos dentro.

**`parent_id` es mutable y mover un nodo es una operación de primera clase.** Un lugar que hoy es
raíz puede ser mañana hijo de otro: cuando el estudio se reorganice, la jerarquía entera se
reordenará sin tocar una sola fila de obras. Esa es la mitad del valor de la decisión.

**Una obra sin ubicación es legítima**, con `physical_place_id` nulo, como hoy lo es la cadena vacía:
la captura con la pieza delante no puede exigir decidir dónde está.

### La clave primaria de una tabla maestra no es su nombre

Generalizando lo anterior: **toda tabla maestra lleva una clave sustituta** —un `uuid`— y el nombre es
un atributo más. Es lo que hace que renombrar sea gratis, y la razón por la que hoy no lo es en las
otras dos: `artwork_types` tiene el nombre por clave primaria y `series` la pareja `(artist, name)`,
copiados como texto en cada obra. Retirar esa deuda es trabajo aparte de este ADR, pero el criterio
queda fijado aquí y las tablas nuevas nacen ya con él.

El fondo (`artist_fund`) es distinto en naturaleza: es un tipo enumerado, no una tabla, y sus valores
sostienen el prefijo de `catalog_id` (ADR-003). Convertirlo es una decisión propia, todavía sin tomar.

### Lo que la ficha responde, y lo que no

El árbol responde a **dónde está la obra**, y solo a eso. Seis de las veintiuna obras están en manos
de terceros —dos museos y una colección particular— y hoy eso se escribe dentro del nombre del lugar,
incluida la propiedad: «coleccion particular familia hormeño (propiedad de la tia de almudena
hormeño)». Esos tres sitios entran en el árbol como raíces, con su coletilla, **a sabiendas de que no
es su sitio definitivo**: cuando existan `estatus_legal`, `titular_derechos` y la tabla de
Propietarios/Instituciones que el esquema ya prevé, dejarán de ser lugares y pasarán a ser filas de
esa tabla. Son seis obras; el árbol es un peldaño hacia ese modelo, no un sustituto.

## Alternativas descartadas

**Conservar el texto y solo preservar mayúsculas y tildes.** Un fichero y ninguna migración, y resuelve
lo que más se ve. No da renombrados que propaguen, que es el requisito que ordena la decisión.

**Cambiar el separador.** Libera la coma para el contenido, pero sigue copiando el nombre en cada obra
y obliga a teclear un carácter que en el teclado del móvil está en la segunda capa, justo en el campo
que se rellena con la obra delante y una mano.

**Niveles como array (`text[]`).** Elimina el separador de raíz y admite comas dentro de un nivel, pero
renombrar sigue siendo un barrido por todas las filas.

## Consecuencias

- La coma deja de ser sintaxis y vuelve a ser una forma cómoda de teclear: en el selector, cada coma
  cierra un nivel, y un nivel que lleve una coma dentro se añade con su propio botón. La ficha y el
  PDF siguen leyéndose «Castelar 4, mesa de Mario».
- Renombrar y mover dejan de mover `basic_updated_at` (RF-802): no son haber tenido la pieza delante.
  Cambiar una obra de sitio sí.
- El filtro jerárquico del listado se simplifica: los ancestros dejan de deducirse partiendo textos,
  porque **son** el árbol.
- La migración de datos parte los textos actuales por comas y crea los nodos. Sale un árbol de ocho
  nodos en minúsculas, que se curan después desde la interfaz, una vez por lugar y no una vez por obra.
  `zzzz`, que era un valor de prueba, no se crea: la obra que lo llevaba queda sin ubicación.
- La columna `physical_location` se retira en un despliegue posterior, no en el mismo: el frontend
  viejo corre unos segundos contra el esquema nuevo.
