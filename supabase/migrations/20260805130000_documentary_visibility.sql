-- ============================================================
-- La visibilidad de una fila documental se hereda de su ancla
-- (RF-609, RF-905, RF-910, RF-911, RF-912, RF-913, RF-906, RF-105, RF-106,
-- RF-109, RF-111).
--
-- ── LA FUGA, MEDIDA Y NO SUPUESTA ───────────────────────────
--
-- Ejercida el 4 de agosto de 2026 con la sesión de un Lector de verdad, sobre
-- una obra dada de baja lógica y NADA MÁS que la obra:
--
--   artworks (la obra de baja) ................ 0 filas   ← correcto
--   provenance_events (eslabón) ............... 1 fila    ← FUGA
--   parties alcanzada por el eslabón .......... 1 fila    ← FUGA, y la peor
--   artwork_bibliography (cita) ............... 1 fila    ← FUGA
--   artwork_exhibitions (participación) ....... 1 fila    ← FUGA
--   artwork_documents (documento) ............. 1 fila    ← FUGA
--   artwork_relationships (relación) .......... 1 fila    ← FUGA
--   external_links (enlace) ................... 0 filas   ← ya heredaba
--
-- Y el contacto se leyó tal cual, no se dedujo de un recuento: la consulta
-- `parties join provenance_events` devolvió al Lector el nombre del
-- coleccionista particular y su dirección de correo. Eso es lo que convierte
-- esto en una fuga de datos personales de un tercero y no en un descuido de
-- presentación: `parties.contact` es el dato que el plan de pruebas nombra como
-- el único cuya exposición afecta a personas ajenas al catálogo, y el eslabón de
-- procedencia es el camino que lleva hasta él. La ficha de la obra está
-- escondida, pero la cadena de propietarios de esa obra escondida no lo estaba.
--
-- La baja lógica de una obra no cae en cascada sobre sus filas documentales: no
-- hay trigger que las retire, y es deliberado (RF-905 restaura la obra con todo
-- lo suyo dentro, y una cascada de ida y vuelta sobre `active` perdería la
-- distinción entre «lo retiré yo» y «se retiró con su obra»). Así que la cascada
-- que falta no es de datos, es DE VISIBILIDAD, y ese es el sitio de una política.
--
-- La migración 20260804150000 dejó esto escrito como pregunta abierta —«la
-- cascada hacia abajo de RF-905 no vive aquí… es cosa de la consulta»—. La
-- respuesta es no: confiar en que la consulta recuerde filtrar es exactamente lo
-- que RF-609 prohíbe, y quien consulta puede ser un `curl` con el token de la
-- Lectora y la clave anónima que viaja en el cliente. Se cierra en la política.
--
-- ── EL CRITERIO, ESCRITO PARA NO TENER QUE DEDUCIRLO ────────
--
-- Una fila documental se ve si se ven TODAS sus anclas. Sus anclas son las
-- fichas de las que la fila no significa nada por separado:
--
--   provenance_events      -> la obra
--   artwork_bibliography   -> la obra Y la referencia
--   artwork_exhibitions    -> la obra Y la exposición
--   artwork_documents      -> la obra Y el documento
--   exhibition_documents   -> la exposición Y el documento
--   artwork_relationships  -> las DOS obras
--
-- LOS DOS EXTREMOS DE UNA PUENTE, y no uno. Una puente modela un dato que solo
-- existe por la combinación de dos fichas: «pp. 33-35» no es una cita, es la
-- página de una cita, y sin la referencia al otro lado no es nada. Enseñarla
-- cuando el otro extremo está escondido no es enseñar menos catálogo, es enseñar
-- un hueco — y en el caso de la relación entre obras es enseñar que existe una
-- obra que RF-609 esconde. Con `is_symmetric` y el trigger de canonicalización,
-- una relación tiene dos extremos intercambiables y ninguno es el principal: la
-- regla tiene que ser la conjunción o la mitad de las relaciones se filtrarían
-- por el lado que quedó de `to_catalog_id`.
--
-- QUÉ PASA CON UN DOCUMENTO QUE CUELGA DE UNA OBRA DE BAJA Y DE UNA EXPOSICIÓN
-- ACTIVA. Decidido, y esta es la decisión: la ficha del documento SIGUE
-- VISIBLE, y lo que desaparece es el puente de la obra. Un documento es una
-- ficha con identificador propio, papelera propia y su propia columna `active`
-- (RF-901), y puede colgar de varias obras y de varias exposiciones a la vez;
-- no tiene UN ancla de la que heredar, así que no hereda. Lo que hereda es cada
-- puente, y cada puente hereda del extremo que le toca. Resultado: la Lectora no
-- puede saber que ese recorte de prensa documenta la obra retirada, y sigue
-- viéndolo en la exposición donde legítimamente está.
--
-- Al revés sería peor de tres maneras. Esconder la ficha del documento por culpa
-- de una de sus obras retiradas lo borraría de la exposición activa —haría que
-- retirar una obra vaciara el expediente de una muestra que no tiene nada que
-- ver—; obligaría a una condición de agregado («¿le queda algún ancla
-- visible?») en vez de una búsqueda por clave, que es justo la subconsulta cara
-- que no se puede permitir; y dejaría el estado de una ficha compartida
-- dependiendo del de su vecina. La misma decisión vale para `bibliography`,
-- `exhibitions` y `parties`: son fichas, se ven por su propio `active`, y su
-- relación con una obra retirada se esconde en la puente.
--
-- LO QUE NO SE ESCONDE, Y POR QUÉ. Un documento cuyas únicas anclas estén todas
-- retiradas queda visible en el archivo, sin decir de qué obra era. Es un
-- documento sin obra a la vista, no una obra a la vista: el archivo tiene fichas
-- que no cuelgan de ninguna obra y son legítimas.
--
-- ── LA FORMA, QUE NO SE INVENTA AQUÍ ────────────────────────
--
-- Es la de `external_links` (20260805100000), la única tabla del esquema que ya
-- heredaba la visibilidad de su ficha ancla, y la de `change_log`
-- (20260805120000):
--
--   and exists (select 1 from public.artworks a where a.catalog_id = <fila>.catalog_id)
--
-- POR QUÉ ESTO FUNCIONA SIN REPETIR LA REGLA. La subconsulta se evalúa BAJO LA
-- POLÍTICA DE SU PROPIA TABLA, porque corre con el rol de quien pregunta y no
-- con el del dueño. `artworks_select` es
-- `(active and can_read()) or can_edit()`, así que:
--
--   * al Lector la subconsulta no le devuelve nada para una obra retirada, y la
--     fila documental desaparece;
--   * al Catalogador se la devuelve siempre, porque `can_edit()` es verdadero, y
--     LA PAPELERA SIGUE COMPLETA — que es la forma de restaurar (RF-906) y lo
--     único que esta migración no puede romper;
--   * y el día que cambie la regla de visibilidad de las obras, estas seis la
--     siguen solas. No hay una segunda copia del criterio que se pueda quedar
--     atrás.
--
-- EL PRECIO, MEDIDO Y NO ESTIMADO. La preocupación es legítima: una subconsulta
-- por fila sobre una tabla de miles se nota. No es lo que hace. Medido con
-- `explain (analyze)` desde la sesión del Lector, sobre 5008 eslabones de
-- procedencia:
--
--   Seq Scan on provenance_events (actual rows=5008 loops=1)
--     Filter: (((active AND can_read()) OR can_edit())
--              AND (ANY (catalog_id = (hashed SubPlan 2).col1)))
--     SubPlan 2 -> Seq Scan on artworks (actual rows=22 loops=1)
--
-- `hashed SubPlan` y `loops=1`: el planificador ejecuta la subconsulta UNA VEZ,
-- se queda con la tabla de claves visibles y la sondea en memoria por fila. Lo
-- que se paga por fila es un sondeo de tabla hash, no una consulta. Tiempos de
-- la misma consulta, tres pasadas de cada: 74, 123 y 87 ms con la política
-- anterior; 57, 87 y 128 ms con esta. La diferencia no se distingue del ruido, y
-- el coste dominante es el `can_read()` por fila, que ya estaba. Cuando la tabla
-- de anclas crezca, el sondeo pasa a ir por su clave primaria, que es la forma
-- que se quería.
--
-- No hace falta índice nuevo: el lado de la puente ya lo tiene por la unicidad
-- `(catalog_id, …)` y por los índices del otro extremo. Lo que NO se hace, por
-- caro: ninguna condición de agregado, ninguna función `security definer` nueva
-- que envuelva el `exists` —eso sí sería opaca para el planificador y volvería a
-- ser una subconsulta por fila—, y ningún `join` a `parties` para recortar
-- `contact` por columnas: RF-105 decide que el Lector ve el contacto de las
-- partes que sí puede ver, y lo que había que arreglar era cuáles puede ver.
--
-- SOLO SE TOCA EL SELECT. `insert` y `update` siguen siendo `can_edit()` a
-- secas: quien escribe ve todas las obras, así que heredar allí no cambiaría una
-- sola decisión y dejaría el mismo criterio escrito en tres sitios. El recuento
-- de «exactamente tres políticas por tabla» de 20260804150000 y de
-- `documentary_policies.test.sql` sigue valiendo, y se vuelve a medir abajo.
--
-- LO QUE SIGUE ABIERTO. `images` tiene el mismo hueco: el Lector ve la fila —y
-- por tanto la ruta del fichero— de la fotografía de una obra retirada. Se midió
-- a la vez (1 fila) y NO se cierra aquí, por lo mismo que dice
-- 20260805100000: la política de `images` es de la primera migración, está en
-- producción, la tocan las pantallas de fotografía y le toca su propia migración.
-- No lleva dato personal de tercero, que es lo que hacía de esto una urgencia.
--
-- CONTRA QUÉ SE COMPRUEBA. `supabase/tests/documentary_visibility.test.sql`
-- reproduce la fuga entera autenticándose de verdad como Lector y como
-- Catalogador, tabla por tabla y por los dos extremos de cada puente, y
-- `rls_role_matrix.test.sql` añade la celda del Lector sobre la obra retirada.
-- ============================================================


-- ── 1. La cadena de procedencia (RF-509, RF-510, RF-511) ────
--
-- La fila de la que salía el dato personal. `reorder_provenance_events` es
-- SECURITY INVOKER y consulta la cadena a través de esta misma política: al
-- Catalogador le sigue devolviendo la cadena entera, incluida la de una obra
-- retirada, porque restaurar una obra tiene que devolver su procedencia en el
-- orden en que estaba.

drop policy provenance_events_select on public.provenance_events;

create policy provenance_events_select on public.provenance_events
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = provenance_events.catalog_id
    )
  );


-- ── 2. La cita bibliográfica (RF-504, RF-506, RF-514) ───────
--
-- Los dos extremos. `cite_artwork` hace `insert … on conflict do update …
-- returning` y necesita el select para devolver la fila: la llama un
-- Catalogador, para quien las dos subconsultas son verdaderas, así que sigue
-- devolviendo lo mismo que antes.

drop policy artwork_bibliography_select on public.artwork_bibliography;

create policy artwork_bibliography_select on public.artwork_bibliography
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_bibliography.catalog_id
    )
    and exists (
      select 1 from public.bibliography b
       where b.id = artwork_bibliography.bibliography_id
    )
  );


-- ── 3. La participación en una exposición (RF-501, RF-502) ──

drop policy artwork_exhibitions_select on public.artwork_exhibitions;

create policy artwork_exhibitions_select on public.artwork_exhibitions
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_exhibitions.catalog_id
    )
    and exists (
      select 1 from public.exhibitions e
       where e.id = artwork_exhibitions.exhibition_id
    )
  );


-- ── 4. El documento de una obra (RF-310, RF-515, RF-516) ────
--
-- Aquí se ejerce la decisión escrita arriba: desaparece el PUENTE, no la ficha
-- del documento. Y no hace falta política nueva de almacenamiento: la ruta del
-- fichero está en `archive_documents`, que sigue visible por su propio `active`,
-- y lo que la Lectora deja de saber es de qué obra era.

drop policy artwork_documents_select on public.artwork_documents;

create policy artwork_documents_select on public.artwork_documents
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_documents.catalog_id
    )
    and exists (
      select 1 from public.archive_documents d
       where d.id = artwork_documents.document_id
    )
  );


-- ── 5. El documento de una exposición (RF-515) ──────────────
--
-- La puente que no toca ninguna obra, y la que más fácil se olvida justo por
-- eso. Hereda de sus dos extremos igual que las demás: una exposición retirada
-- es papelera, y su expediente documental con ella.

drop policy exhibition_documents_select on public.exhibition_documents;

create policy exhibition_documents_select on public.exhibition_documents
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.exhibitions e
       where e.id = exhibition_documents.exhibition_id
    )
    and exists (
      select 1 from public.archive_documents d
       where d.id = exhibition_documents.document_id
    )
  );


-- ── 6. La relación entre dos obras (RF-212, RF-217) ─────────
--
-- Las DOS obras, con `and`. El trigger de canonicalización ordena el par, así
-- que la obra retirada puede haber quedado en cualquiera de las dos columnas:
-- mirar solo una escondería la mitad de las relaciones y filtraría la otra
-- mitad. Y una relación es simétrica en su lectura aunque el tipo no lo sea —la
-- ficha de la obra activa la muestra igual—, así que no basta con que se vea el
-- extremo desde el que se consulta.

drop policy artwork_relationships_select on public.artwork_relationships;

create policy artwork_relationships_select on public.artwork_relationships
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_relationships.from_catalog_id
    )
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_relationships.to_catalog_id
    )
  );


-- ── 7. La migración se mide a sí misma ──────────────────────
--
-- Corre DENTRO de la transacción que aplica la migración, así que si algo no
-- cuadra la migración no se aplica a medias — y media cascada de visibilidad es
-- peor que ninguna, porque parece hecha.
--
-- No se mide con `like` sobre el texto de la política: se mide con las
-- DEPENDENCIAS que PostgreSQL registra de cada política, tanto a las tablas que
-- su expresión nombra como a las COLUMNAS. Una comparación de cadenas pasa con
-- un `exists` que apunte a la tabla correcta por la columna equivocada; y la
-- dependencia de columna es la que caza el error de esta migración: que
-- `artwork_relationships` mire un solo extremo. Con la tabla bastaría un
-- `exists` sobre `artworks` para dar la lista por buena, y las relaciones de la
-- obra retirada se seguirían filtrando por el otro lado.
-- Lo funcional —que el Lector cuente cero y el Catalogador uno— es del test de
-- al lado, que es el único que puede autenticarse.

do $$
declare
  v_expected constant text[][] := array[
    -- tabla                  anclas                          columnas propias del select
    ['provenance_events',     'artworks',                      'catalog_id'],
    ['artwork_bibliography',  'artworks,bibliography',         'catalog_id,bibliography_id'],
    ['artwork_exhibitions',   'artworks,exhibitions',          'catalog_id,exhibition_id'],
    ['artwork_documents',     'artworks,archive_documents',    'catalog_id,document_id'],
    ['exhibition_documents',  'exhibitions,archive_documents', 'exhibition_id,document_id'],
    ['artwork_relationships', 'artworks',                      'from_catalog_id,to_catalog_id']
  ];
  v_i integer;
  v_table text;
  v_anchors text[];
  v_anchor text;
  v_found text[];
  v_columns text[];
  v_column text;
  v_used text[];
  v_cmds text[];
begin
  if array_length(v_expected, 1) <> 6 then
    raise exception 'FAIL: esta migración cubre seis tablas, la lista tiene %',
      array_length(v_expected, 1);
  end if;

  for v_i in 1 .. array_length(v_expected, 1) loop
    v_table   := v_expected[v_i][1];
    v_anchors := string_to_array(v_expected[v_i][2], ',');
    v_columns := string_to_array(v_expected[v_i][3], ',');

    -- Las tablas que la política de SELECT nombra, según pg_depend.
    select coalesce(array_agg(distinct anchor.relname order by anchor.relname), '{}')
      into v_found
      from pg_policy pol
      join pg_class target on target.oid = pol.polrelid
      join pg_depend d
        on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       and d.refclassid = 'pg_class'::regclass
      join pg_class anchor on anchor.oid = d.refobjid
     where target.relname = v_table
       and pol.polcmd = 'r'
       and anchor.relkind = 'r'
       and anchor.relname <> v_table;

    foreach v_anchor in array v_anchors loop
      if not (v_anchor = any (v_found)) then
        raise exception
          'FAIL: la política de select de public.% no depende de public.%, así que no hereda su visibilidad; nombra [%]',
          v_table, v_anchor, array_to_string(v_found, ', ');
      end if;
    end loop;

    -- Y las columnas PROPIAS por las que la política se ata a sus anclas: es lo
    -- que distingue «hereda de los dos extremos» de «hereda de uno».
    select coalesce(array_agg(distinct att.attname order by att.attname), '{}')
      into v_used
      from pg_policy pol
      join pg_class target on target.oid = pol.polrelid
      join pg_depend d
        on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       and d.refclassid = 'pg_class'::regclass and d.refobjid = pol.polrelid
       and d.refobjsubid > 0
      join pg_attribute att
        on att.attrelid = d.refobjid and att.attnum = d.refobjsubid
     where target.relname = v_table
       and pol.polcmd = 'r';

    foreach v_column in array v_columns loop
      if not (v_column = any (v_used)) then
        raise exception
          'FAIL: la política de select de public.% no mira su columna %, así que ese extremo no hereda nada; mira [%]',
          v_table, v_column, array_to_string(v_used, ', ');
      end if;
    end loop;

    -- Y siguen siendo exactamente tres políticas: reescribir el select no ha
    -- añadido una cuarta ni se ha dejado una por el camino (RF-111, RF-901).
    select coalesce(array_agg(cmd::text order by cmd::text), '{}')
      into v_cmds
      from pg_policies
     where schemaname = 'public' and tablename = v_table;

    if v_cmds <> array['INSERT', 'SELECT', 'UPDATE'] then
      raise exception
        'FAIL: public.% debería seguir con exactamente SELECT, INSERT y UPDATE, tiene [%]',
        v_table, array_to_string(v_cmds, ', ');
    end if;
  end loop;

  raise notice 'OK: las seis tablas documentales heredan la visibilidad de sus anclas y siguen con tres políticas';
end $$;
