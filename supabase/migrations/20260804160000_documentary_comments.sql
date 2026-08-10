-- ============================================================
-- The reasons that were missing: `comment on` for the columns of the documentary
-- catalogue raisonné that carry a decision inside.
--
-- The six migrations of 4 August (parties, provenance, bibliography,
-- exhibitions, archive_documents, artwork_relationships) left the whole
-- table commented and the most debatable columns, but not all of them. Missing are exactly
-- those an enumerated type or a null make seem obvious and are not: why
-- `party_type` does not admit «Sin revisar» when almost everything else does, why the
-- quality of tenure and the form of acquisition are TWO columns and not one,
-- why an exhibition date is all or nothing.
--
-- This migration does NOT change the schema. It only writes comments: not one column,
-- not one constraint, not one privilege, not one row of data. It is reversible with no
-- consequences and it cannot break anything in service.
--
-- It is written as a new migration and not by editing the six previous ones because those
-- are already applied, and applied migrations are not rewritten (CLAUDE.md).
--
-- The criterion of what is commented and what is not is the usual one: the WHY
-- of what was decided is commented, not the WHAT that is read in the name. `note`,
-- `created_at` or a bridge table's second foreign key carry no comment
-- because there is nothing to explain; the three old master tables (`artwork_types`,
-- `series`, `physical_places`) have no column comments either and this does not
-- touch them.
-- ============================================================


-- ── Personas e instituciones ────────────────────────────────

comment on column public.parties.party_type is
  'Persona o institución. Es el único enumerado de este grupo SIN «Sin revisar», '
  'y es una excepción consciente a RF-205 con el argumento con el que RF-203 se '
  'lo niega a `artist`: al abrir la ficha ya se sabe si se escribe una persona o '
  'un museo, y de ese valor depende cómo se compone la línea de procedencia. Dos '
  'valores que no crecen: por eso es enumerado y no tabla maestra.';

comment on column public.parties.name is
  'Se guarda tal como se escribe, con sus mayúsculas y sus tildes. Lo que se '
  'normaliza es solo la clave de comparación (`place_key`), que es la que impide '
  'que un mismo museo acabe en dos fichas y parta la procedencia de sus obras '
  'entre las dos. Dos homónimos se desambiguan aquí dentro, que es lo que hacen '
  'los catálogos.';

comment on column public.parties.contact_status is
  'Hasta dónde ha llegado la conversación con esta parte. Es dato de trabajo de '
  'la investigación y no un hecho sobre la obra: sirve para que nadie escriba dos '
  'veces la misma carta.';

comment on column public.parties.note is
  'Todo lo que no cabe en las columnas: parentescos, cómo se localizó a esta '
  'parte, qué queda por preguntarle. NO se pone aquí un tipo de institución '
  '(galería, museo, fundación): cuando haga falta filtrarlo será una tabla '
  'maestra, no un texto ni un valor más del enumerado.';


-- ── The provenance chain ────────────────────────────────────

comment on column public.provenance_events.capacity is
  'En qué calidad tuvo la obra esta parte. Es la MITAD del `estatus_legal` que '
  'v11 tenía como campo único: aquella lista mezclaba dos preguntas distintas, y '
  'esta contesta «en qué condiciones», no «cómo llegó». Una obra puede estar en '
  'depósito habiendo llegado por donación, y con un solo campo eso no se puede '
  'escribir. Enumerado y no maestra porque el código SÍ mira el valor: de él '
  'depende quién es el poseedor actual y cómo se redacta la línea.';

comment on column public.provenance_events.acquisition is
  'Cómo llegó la obra a manos de esta parte. La otra mitad del `estatus_legal` de '
  'v11. «Sin revisar» es el valor de partida a propósito: de un eslabón se suele '
  'saber quién antes que cómo.';

comment on column public.provenance_events.party_note is
  'Describe el eslabón cuando no hay ficha detrás («Colección privada, España», '
  '«colección desconocida»), o precisa la que hay («propiedad de una tía de la '
  'familia»). Obligar a crear una parte fantasma para cada eslabón sin nombre '
  'ensuciaría la maestra, así que la base solo exige que el eslabón diga de quién '
  'habla: ficha o descripción, nunca ninguna de las dos.';

comment on column public.provenance_events.date_note is
  'Cuando tiene texto, MANDA sobre la fecha compuesta: es la misma regla con la '
  'que ADR-004 dejó que la prosa gane a los años estructurados, y sirve para lo '
  'mismo, que «entre la guerra y la muerte del artista» no se puede escribir con '
  'dos números.';

comment on column public.provenance_events.start_year is
  'Año inicial de la tenencia. El rango admite empezar y acabar el mismo año, al '
  'contrario que el de la obra: comprada y vendida en 1985 es un eslabón normal.';


-- ── The artwork: rights holder and research states ──────────

comment on column public.artworks.rights_holder_note is
  'Lo que no encaja en la relación: derechos compartidos, un titular del que solo '
  'consta el nombre, una cesión con condiciones. Existe para que la clave ajena '
  'pueda quedarse vacía sin perder el dato.';


-- ── Bibliografía ────────────────────────────────────────────

comment on column public.bibliography.title is
  'Sin unicidad, a propósito: dos referencias distintas se titulan igual, y los '
  'duplicados se resuelven por revisión (RF-909) y no rechazando el segundo. '
  'Tampoco lleva check de recortado, al contrario que los nombres de las '
  'maestras: aquí no hay clave de comparación que un espacio pueda romper y un '
  'título se pega de un PDF.';

comment on column public.bibliography.editors is
  'Texto libre como los autores, y por lo mismo: quien edita un catálogo de 1985 '
  'no es un contacto de este catálogo y meterlo en la maestra de personas la '
  'llenaría de fichas sin procedencia ni derechos que estorbarían en el selector '
  'de propietarios.';

comment on column public.bibliography.publication_type_id is
  'Nulo es «sin clasificar todavía», no un error: se apunta la referencia cuando '
  'se encuentra y se decide después qué clase de publicación es.';

comment on column public.publication_types.name is
  'Vocabulario abierto: la usuaria añade «programa de radio» sin desplegar nada. '
  'Único por clave de comparación (`place_key`), de modo que «Catálogo de '
  'exposición» y «catalogo de exposicion» no acaben siendo dos filas.';


-- ── Exposiciones ────────────────────────────────────────────

comment on column public.exhibitions.exhibition_type is
  'Individual o colectiva. SÍ lleva «Sin revisar», al contrario que el tipo de '
  'una parte: de un recorte de prensa se saca el título de la muestra mucho antes '
  'que su carácter, y forzar a elegir sería inventar el dato.';

comment on column public.exhibitions.start_date is
  'Fecha exacta de apertura, opcional. Cuando existe, la base deduce de ella el '
  'año; nunca al revés, porque de un año suelto no se inventa un 1 de enero: eso '
  'sería publicar una apertura que nadie ha documentado.';

comment on column public.exhibitions.end_date is
  'Fecha de cierre, opcional, pero no sin apertura: media fecha no existe. Un '
  '`end_date >= start_date` a secas lo habría dejado pasar, porque una '
  'comparación con nulo no es falsa.';

comment on column public.exhibitions.date_note is
  'Manda sobre lo que se compone con el año y las fechas, como en la obra, en el '
  'eslabón de procedencia y en el documento de archivo (ADR-004): «verano de '
  '1985» y «fechas sin confirmar» son datos y no huecos.';

comment on column public.exhibitions.venue_id is
  'La sede como ficha. Nulo con `venue_note` al lado es el caso normal al '
  'empezar: consta dónde fue sin que se sepa exactamente cuál era el sitio.';

comment on column public.exhibitions.title is
  'Sin unicidad: una itinerante en dos ciudades son dos filas con el mismo '
  'nombre, y son dos exposiciones distintas con sus fechas y su sede.';

comment on column public.exhibition_venues.name is
  'La sede es única por nombre Y localidad, no por el nombre solo: hay una «Casa '
  'de Cultura» en cada pueblo, y con la unicidad por el nombre a secas la segunda '
  'sería un error incomprensible.';

comment on column public.exhibition_venues.country is
  'Suelto como la localidad, para poder imprimir la línea de RF-502 sin analizar '
  'una dirección.';


-- ── Archivo y documentación ─────────────────────────────────

comment on column public.archive_documents.title is
  'El `titulo_descripcion` de v11: casi nunca hay un título de verdad, así que '
  'esto suele ser una descripción («Carta de X a Y sobre la exposición de '
  'Villafamés»). Obligatorio, porque un documento sin nada escrito no se puede '
  'volver a encontrar; sin unicidad, porque tres cartas del mismo remitente se '
  'describen igual.';

comment on column public.archive_documents.document_type_id is
  'Vocabulario abierto de tipos de documento. Nulo es «sin clasificar todavía», '
  'que también es una respuesta y no un hueco.';

comment on column public.archive_documents.date_note is
  'Manda sobre la fecha compuesta, igual que en la obra y en el eslabón de '
  'procedencia (ADR-004). «Posterior a la muerte del artista» es una fecha de '
  'archivo perfectamente normal.';

comment on column public.archive_documents.uploaded_at is
  'Cuándo se subió el digitalizado. Va con las otras tres columnas del fichero: '
  'las cuatro puestas o las cuatro nulas, porque media descripción de un fichero '
  'no existe.';

comment on column public.document_types.name is
  'Vocabulario abierto, como el propio v11 lo declaraba. Renombrar «Recorte» a '
  '«Recorte de prensa» tiene que ser una fila, no una migración.';

comment on column public.archive_series.name is
  'Se guarda tal como se escribe. La unicidad va por clave de comparación y entre '
  'HERMANOS, no en todo el árbol: dos fondos distintos pueden tener cada uno su '
  'serie «Correspondencia».';


-- ── Obras relacionadas ──────────────────────────────────────

comment on column public.artwork_relationship_types.name is
  'La etiqueta directa, la que ve la obra del extremo de salida («Estudio previo '
  'de»). Vocabulario abierto: la investigación descubre relaciones que nadie '
  'previó.';

comment on column public.artwork_relationships.to_catalog_id is
  'Extremo de llegada. En un tipo simétrico es siempre el identificador mayor, '
  'porque el trigger de canonicalización coloca los dos extremos antes de guardar; '
  'la ficha se consulta desde los dos lados y por eso esta columna tiene índice '
  'propio.';

comment on column public.artwork_relationships.note is
  'Lo que matiza ESTA relación concreta. En una simétrica hay una sola fila y por '
  'tanto una sola nota, que es justamente lo que se buscaba: dos filas para el '
  'mismo hecho podrían acabar contándolo distinto.';
