-- La cascada de visibilidad de la baja lógica de una obra.
--
-- RF-609, RF-905, RF-910, RF-911, RF-912, RF-913, RF-906, RF-105, RF-106,
-- RF-109, RF-111, RF-511.
--
-- ESTE FICHERO NACIÓ DE UNA FUGA MEDIDA, no de un repaso del diseño. Con la
-- política anterior a 20260805130000, un Lector autenticado contra una obra dada
-- de baja lógica veía:
--
--   la obra ................... 0 filas
--   su eslabón de procedencia . 1 fila
--   su cita ................... 1 fila
--   su participación .......... 1 fila
--   su documento .............. 1 fila
--   su relación ............... 1 fila
--
-- y, siguiendo el eslabón hasta `parties`, el nombre y el CONTACTO del
-- coleccionista particular que la tuvo. La ficha estaba escondida y la cadena de
-- propietarios de esa ficha escondida, no: es el único dato del catálogo cuya
-- exposición afecta a personas ajenas al proyecto, y por eso este fichero lo
-- comprueba leyendo el contacto de verdad y no contando filas de una puente.
--
-- Todo se ejerce AUTENTICÁNDOSE como un usuario de cada papel. Comprobar que la
-- política dice `exists` no verifica nada: lo que importa es lo que la base
-- contesta cuando la petición viene de quien viene, que es lo que hará un `curl`
-- con el token de la Lectora — no hay interfaz que se interponga.
--
-- Los cuatro bloques que sostienen el fichero, y por qué ninguno sobra:
--
--   1. La fuga: seis recuentos a cero y el contacto ilegible.
--   2. EL CONTROL, con todo activo: los mismos seis recuentos a uno. Sin él, una
--      política que negara siempre pasaría el bloque 1 y el catálogo se quedaría
--      en blanco sin que nada avisara.
--   3. Los DOS EXTREMOS de cada puente, uno por uno. Es lo que distingue
--      «hereda» de «hereda a medias», y es el error que un `exists` de más
--      esconde: con solo el extremo de la obra, los bloques 1 y 2 pasan igual.
--   4. La papelera del Catalogador COMPLETA. Es la que esta migración no puede
--      romper: es su forma de restaurar (RF-906), y un arreglo de visibilidad
--      que la vaciara sería peor que la fuga.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- Un Catalogador y un Lector de verdad, con su fila en `profiles` creada por el
-- trigger de `auth.users`.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'cat-cascada@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'lec-cascada@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000a2';

-- Cuatro obras. Los identificadores están elegidos por su ORDEN, no por gusto:
-- el trigger de canonicalización pone el menor en `from_catalog_id` de una
-- relación simétrica, así que AR-9800 < AR-9805 < AR-9810 es lo que permite
-- dejar la obra retirada una vez en cada extremo.
insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9800', 'ROTILI', 'Obra activa anterior', 'UNCONFIRMED'),
  ('AR-9805', 'ROTILI', 'La obra que se da de baja', 'UNCONFIRMED'),
  ('AR-9810', 'ROTILI', 'Obra activa posterior', 'UNCONFIRMED'),
  ('AR-9820', 'ROTILI', 'Obra del control, todo activo', 'UNCONFIRMED');

-- El dato personal de tercero. RF-105 decide que el Lector ve `contact` DE LAS
-- PARTES QUE PUEDE VER; lo que había que arreglar es cuáles puede ver.
insert into public.parties (id, party_type, name, contact) values
  ('9a000001-0000-4000-8000-000000000001', 'PERSON',
   'Coleccionista particular de la cascada', 'telefono-privado@cascada.test');

insert into public.bibliography (id, title) values
  ('9a000004-0000-4000-8000-000000000001', 'Referencia activa de la cascada'),
  ('9a000004-0000-4000-8000-000000000002', 'Referencia retirada de la cascada');

insert into public.exhibitions (id, title, year) values
  ('9a000007-0000-4000-8000-000000000001', 'Muestra activa de la cascada', 1988),
  ('9a000007-0000-4000-8000-000000000002', 'Muestra retirada de la cascada', 1989);

insert into public.archive_documents (id, title) values
  ('9a00000b-0000-4000-8000-000000000001', 'Documento activo de la cascada'),
  ('9a00000b-0000-4000-8000-000000000002', 'Documento retirado de la cascada');

insert into public.artwork_relationship_types (id, name, inverse_name, is_symmetric) values
  ('9a00000e-0000-4000-8000-000000000001', 'Cascada simétrica de', '', true);

-- ── Las cinco filas documentales de la obra que se retira ────

insert into public.provenance_events (id, catalog_id, party_id, capacity) values
  ('9a000002-0000-4000-8000-000000000001', 'AR-9805',
   '9a000001-0000-4000-8000-000000000001', 'OWNER');

insert into public.artwork_bibliography (id, catalog_id, bibliography_id, pages) values
  ('9a000005-0000-4000-8000-000000000001', 'AR-9805',
   '9a000004-0000-4000-8000-000000000001', 'pp. 41-43');

insert into public.artwork_exhibitions (id, catalog_id, exhibition_id, catalogue_number) values
  ('9a000008-0000-4000-8000-000000000001', 'AR-9805',
   '9a000007-0000-4000-8000-000000000001', 'cat. 21');

insert into public.artwork_documents (id, catalog_id, document_id) values
  ('9a00000c-0000-4000-8000-000000000001', 'AR-9805',
   '9a00000b-0000-4000-8000-000000000001');

-- El MISMO documento, colgado además de una exposición que sigue activa: es el
-- caso en el que las dos anclas discrepan, y el criterio escrito en la migración
-- dice qué gana. Se comprueba en el bloque 5.
insert into public.exhibition_documents (id, exhibition_id, document_id) values
  ('9a00000d-0000-4000-8000-000000000001', '9a000007-0000-4000-8000-000000000001',
   '9a00000b-0000-4000-8000-000000000001');

-- La obra retirada en CADA extremo de una relación, que es lo que hace falta
-- para que mirar un solo lado no pase el test.
insert into public.artwork_relationships (id, from_catalog_id, to_catalog_id, relationship_type_id) values
  ('9a00000f-0000-4000-8000-000000000001', 'AR-9805', 'AR-9810',
   '9a00000e-0000-4000-8000-000000000001'),
  ('9a00000f-0000-4000-8000-000000000002', 'AR-9800', 'AR-9805',
   '9a00000e-0000-4000-8000-000000000001');

-- Que la canonicalización haya dejado los extremos donde este fichero cuenta que
-- están. Si un día cambia el criterio, esto lo dice en vez de dejar el test
-- pasando por el motivo equivocado.
do $$
begin
  if not exists (select 1 from public.artwork_relationships
                  where id = '9a00000f-0000-4000-8000-000000000001'
                    and from_catalog_id = 'AR-9805' and to_catalog_id = 'AR-9810') then
    raise exception 'FAIL: el fixture esperaba la obra retirada en from_catalog_id';
  end if;
  if not exists (select 1 from public.artwork_relationships
                  where id = '9a00000f-0000-4000-8000-000000000002'
                    and from_catalog_id = 'AR-9800' and to_catalog_id = 'AR-9805') then
    raise exception 'FAIL: el fixture esperaba la obra retirada en to_catalog_id';
  end if;
end $$;

-- ── Las mismas cinco filas de una obra que NO se retira ──────
--
-- El control del bloque 2. Van a las mismas fichas ancla, todas activas.

insert into public.provenance_events (id, catalog_id, party_id, capacity) values
  ('9a000002-0000-4000-8000-000000000009', 'AR-9820',
   '9a000001-0000-4000-8000-000000000001', 'OWNER');
insert into public.artwork_bibliography (id, catalog_id, bibliography_id, pages) values
  ('9a000005-0000-4000-8000-000000000009', 'AR-9820',
   '9a000004-0000-4000-8000-000000000001', 'p. 8');
insert into public.artwork_exhibitions (id, catalog_id, exhibition_id, catalogue_number) values
  ('9a000008-0000-4000-8000-000000000009', 'AR-9820',
   '9a000007-0000-4000-8000-000000000001', 'cat. 22');
insert into public.artwork_documents (id, catalog_id, document_id) values
  ('9a00000c-0000-4000-8000-000000000009', 'AR-9820',
   '9a00000b-0000-4000-8000-000000000001');
insert into public.artwork_relationships (id, from_catalog_id, to_catalog_id, relationship_type_id) values
  ('9a00000f-0000-4000-8000-000000000009', 'AR-9800', 'AR-9820',
   '9a00000e-0000-4000-8000-000000000001');

-- ── Las puentes con el OTRO extremo retirado ─────────────────
--
-- Obra ACTIVA en todas: lo único retirado es la ficha del otro lado. Sin estas
-- cinco filas, una política que solo heredara de la obra pasaría el fichero
-- entero.

insert into public.artwork_bibliography (id, catalog_id, bibliography_id, pages) values
  ('9a000005-0000-4000-8000-00000000000b', 'AR-9820',
   '9a000004-0000-4000-8000-000000000002', 'p. 99');
insert into public.artwork_exhibitions (id, catalog_id, exhibition_id, catalogue_number) values
  ('9a000008-0000-4000-8000-00000000000b', 'AR-9820',
   '9a000007-0000-4000-8000-000000000002', 'cat. 99');
insert into public.artwork_documents (id, catalog_id, document_id) values
  ('9a00000c-0000-4000-8000-00000000000b', 'AR-9820',
   '9a00000b-0000-4000-8000-000000000002');
insert into public.exhibition_documents (id, exhibition_id, document_id) values
  -- exposición retirada, documento activo
  ('9a00000d-0000-4000-8000-00000000000b', '9a000007-0000-4000-8000-000000000002',
   '9a00000b-0000-4000-8000-000000000001'),
  -- exposición activa, documento retirado
  ('9a00000d-0000-4000-8000-00000000000c', '9a000007-0000-4000-8000-000000000001',
   '9a00000b-0000-4000-8000-000000000002');

-- Y AHORA se retiran las fichas ancla: la obra y, por separado, la referencia,
-- la exposición y el documento del otro extremo. Ni una sola fila documental se
-- toca — es exactamente lo que pasa en producción, porque la baja de una obra no
-- lleva cascada de datos y no debe llevarla (RF-905: restaurar devuelve la obra
-- con todo lo suyo dentro y en el estado en que estaba).
update public.artworks set active = false, deactivated_at = now(),
       deactivated_by = '00000000-0000-0000-0000-0000000000a1'
 where catalog_id = 'AR-9805';
update public.bibliography set active = false
 where id = '9a000004-0000-4000-8000-000000000002';
update public.exhibitions set active = false
 where id = '9a000007-0000-4000-8000-000000000002';
update public.archive_documents set active = false
 where id = '9a00000b-0000-4000-8000-000000000002';

-- Y que la baja no haya caído en cascada sobre los datos, medido y no supuesto:
-- si algún día se añadiera esa cascada, los bloques de abajo dejarían de
-- verificar la política y pasarían por el motivo equivocado.
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select active from public.provenance_events where id = '9a000002-0000-4000-8000-000000000001'
    union all
    select active from public.artwork_bibliography where id = '9a000005-0000-4000-8000-000000000001'
    union all
    select active from public.artwork_exhibitions where id = '9a000008-0000-4000-8000-000000000001'
    union all
    select active from public.artwork_documents where id = '9a00000c-0000-4000-8000-000000000001'
    union all
    select active from public.artwork_relationships
     where id in ('9a00000f-0000-4000-8000-000000000001', '9a00000f-0000-4000-8000-000000000002')
  ) t where active;
  if v_n <> 6 then
    raise exception
      'FAIL: la baja de la obra debería dejar sus 6 filas documentales activas, quedan % activas', v_n;
  end if;
  raise notice 'OK: la baja de la obra no cae en cascada sobre los datos; lo que se propaga es la visibilidad (RF-910)';
end $$;


-- ── 1. La fuga: el Lector no ve nada de la obra retirada ─────
--
-- RF-609. Cada recuento es una de las líneas de la medición del 4 de agosto de
-- 2026, y cada uno estaba a 1 antes de 20260805130000.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.artworks where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve la obra retirada (% filas)', v_n;
  end if;

  select count(*) into v_n from public.provenance_events where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve el eslabón de procedencia de una obra retirada (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_bibliography where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve la cita de una obra retirada (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_exhibitions where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve la participación de una obra retirada (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_documents where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve el documento de una obra retirada (% filas)', v_n;
  end if;

  -- Los dos extremos de la relación de una sola vez.
  select count(*) into v_n from public.artwork_relationships
   where from_catalog_id = 'AR-9805' or to_catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception
      'FAIL: el lector ve % relación(es) de una obra retirada, así que sabe que la obra existe', v_n;
  end if;

  raise notice 'OK: el lector no ve ninguna de las cinco filas documentales de una obra retirada (RF-609)';
end $$;

reset role;

-- Y LA FUGA EN SUS PROPIOS TÉRMINOS: no un recuento de una puente, sino el dato
-- personal del tercero, leído con la consulta que lo sacaba. RF-511 y la
-- prioridad 1 del plan de pruebas: es el único dato cuya exposición afecta a
-- personas ajenas al catálogo.
do $$
declare v_contact text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select p.contact into v_contact
    from public.parties p
    join public.provenance_events e on e.party_id = p.id
   where e.catalog_id = 'AR-9805';

  if v_contact is not null then
    raise exception
      'FAIL: el lector ha leído el contacto de un tercero a través de la procedencia de una obra retirada: %',
      v_contact;
  end if;

  raise notice 'OK: la cadena de propietarios de una obra retirada no lleva al contacto de nadie (RF-511)';
end $$;

reset role;


-- ── 2. El control: con todo activo, el Lector sí lo ve ───────
--
-- RF-105. Sin este bloque, una política que negara siempre —o un `exists` con la
-- columna equivocada, que no encuentra nunca nada— pasaría el bloque 1 y dejaría
-- el catálogo en blanco. Es la mitad del fichero que no habla de la fuga.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.provenance_events where catalog_id = 'AR-9820';
  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve el eslabón de una obra activa (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_bibliography
   where id = '9a000005-0000-4000-8000-000000000009';
  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve la cita de una obra activa (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_exhibitions
   where id = '9a000008-0000-4000-8000-000000000009';
  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve la participación de una obra activa (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_documents
   where id = '9a00000c-0000-4000-8000-000000000009';
  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve el documento de una obra activa (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_relationships
   where id = '9a00000f-0000-4000-8000-000000000009';
  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve la relación entre dos obras activas (% filas)', v_n;
  end if;

  select count(*) into v_n from public.exhibition_documents
   where id = '9a00000d-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception
      'FAIL: el lector no ve el documento de una exposición activa (% filas)', v_n;
  end if;

  -- Y el contacto del propietario de una obra activa SÍ se lee: RF-105 lo decide
  -- expresamente, y este aserto es lo que impide que el arreglo se convierta en
  -- un recorte de columna que nadie pidió.
  if not exists (select 1 from public.parties p
                   join public.provenance_events e on e.party_id = p.id
                  where e.catalog_id = 'AR-9820' and p.contact <> '') then
    raise exception 'FAIL: el lector debería leer el contacto de la parte de una obra activa (RF-105)';
  end if;

  raise notice 'OK: con las anclas activas el lector lo ve todo, contacto incluido (RF-105)';
end $$;

reset role;


-- ── 3. Los dos extremos de cada puente ──────────────────────
--
-- La obra está ACTIVA en las cuatro filas de este bloque: lo retirado es la
-- ficha del otro lado. Una puente modela un dato que solo existe por la
-- combinación de dos fichas —«p. 99» no es una cita, es la página de una cita—,
-- así que enseñarla con un extremo escondido no es enseñar menos catálogo, es
-- enseñar un hueco.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.artwork_bibliography
   where id = '9a000005-0000-4000-8000-00000000000b';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve una cita cuya REFERENCIA está en la papelera (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_exhibitions
   where id = '9a000008-0000-4000-8000-00000000000b';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve una participación cuya EXPOSICIÓN está en la papelera (% filas)', v_n;
  end if;

  select count(*) into v_n from public.artwork_documents
   where id = '9a00000c-0000-4000-8000-00000000000b';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve un documento de obra cuyo DOCUMENTO está en la papelera (% filas)', v_n;
  end if;

  select count(*) into v_n from public.exhibition_documents
   where id = '9a00000d-0000-4000-8000-00000000000b';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve el expediente de una EXPOSICIÓN retirada (% filas)', v_n;
  end if;

  select count(*) into v_n from public.exhibition_documents
   where id = '9a00000d-0000-4000-8000-00000000000c';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve un expediente cuyo DOCUMENTO está en la papelera (% filas)', v_n;
  end if;

  raise notice 'OK: una puente se ve si se ven sus DOS extremos, no uno (RF-911)';
end $$;

reset role;


-- ── 4. La papelera del Catalogador, completa ─────────────────
--
-- RF-906, y es lo único que este arreglo no puede romper: si la visibilidad
-- heredada escondiera al Catalogador las filas documentales de una obra
-- retirada, restaurarla devolvería una ficha vacía y el trabajo estaría perdido
-- sin que nada avisara. Lo que lo hace gratis es que la subconsulta se evalúa
-- bajo `artworks_select`, donde `can_edit()` es verdadero.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.artworks where catalog_id = 'AR-9805';
  if v_n <> 1 then raise exception 'FAIL: el catalogador no ve la obra en la papelera'; end if;

  select count(*) into v_n from public.provenance_events where catalog_id = 'AR-9805';
  if v_n <> 1 then raise exception 'FAIL: el catalogador no ve el eslabón de la obra retirada'; end if;

  select count(*) into v_n from public.artwork_bibliography where catalog_id = 'AR-9805';
  if v_n <> 1 then raise exception 'FAIL: el catalogador no ve la cita de la obra retirada'; end if;

  select count(*) into v_n from public.artwork_exhibitions where catalog_id = 'AR-9805';
  if v_n <> 1 then raise exception 'FAIL: el catalogador no ve la participación de la obra retirada'; end if;

  select count(*) into v_n from public.artwork_documents where catalog_id = 'AR-9805';
  if v_n <> 1 then raise exception 'FAIL: el catalogador no ve el documento de la obra retirada'; end if;

  select count(*) into v_n from public.artwork_relationships
   where from_catalog_id = 'AR-9805' or to_catalog_id = 'AR-9805';
  if v_n <> 2 then
    raise exception 'FAIL: el catalogador debería ver las 2 relaciones de la obra retirada, ve %', v_n;
  end if;

  -- Y las puentes con el otro extremo en la papelera, que son las que restaura
  -- al restaurar la referencia, la exposición o el documento.
  select count(*) into v_n from public.artwork_bibliography
   where id = '9a000005-0000-4000-8000-00000000000b';
  if v_n <> 1 then raise exception 'FAIL: el catalogador no ve la cita de una referencia retirada'; end if;

  select count(*) into v_n from public.exhibition_documents
   where id in ('9a00000d-0000-4000-8000-00000000000b', '9a00000d-0000-4000-8000-00000000000c');
  if v_n <> 2 then
    raise exception 'FAIL: el catalogador debería ver los 2 expedientes con un extremo retirado, ve %', v_n;
  end if;

  -- Y el contacto del tercero: quien puede editar la papelera tiene que poder
  -- reconstruir la procedencia de lo que restaura.
  if not exists (select 1 from public.parties p
                   join public.provenance_events e on e.party_id = p.id
                  where e.catalog_id = 'AR-9805') then
    raise exception 'FAIL: el catalogador no alcanza la parte de la procedencia de una obra retirada';
  end if;

  raise notice 'OK: el catalogador ve la papelera entera y puede restaurar (RF-906, RF-913)';
end $$;

reset role;


-- ── 5. El documento con dos anclas que discrepan ─────────────
--
-- El criterio escrito en 20260805130000, ejercido: el documento cuelga de la
-- obra RETIRADA y de una exposición ACTIVA. Desaparece EL PUENTE de la obra, y
-- siguen visibles la ficha del documento y su puente con la exposición.
--
-- Al revés sería peor: esconder la ficha del documento por culpa de una de sus
-- obras retiradas lo borraría del expediente de una muestra que no tiene nada
-- que ver, y haría depender el estado de una ficha compartida del de su vecina.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.artwork_documents
   where id = '9a00000c-0000-4000-8000-000000000001';
  if v_n <> 0 then
    raise exception 'FAIL: el lector sabe que el documento documenta la obra retirada (% filas)', v_n;
  end if;

  select count(*) into v_n from public.archive_documents
   where id = '9a00000b-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception
      'FAIL: la ficha del documento debería seguir visible: es una ficha propia y su otra ancla está activa (% filas)',
      v_n;
  end if;

  select count(*) into v_n from public.exhibition_documents
   where id = '9a00000d-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception
      'FAIL: retirar una obra ha vaciado el expediente de una exposición activa (% filas)', v_n;
  end if;

  raise notice 'OK: el documento sigue en su exposición y deja de nombrar la obra retirada (RF-912)';
end $$;

reset role;


-- ── 6. Y el rol anónimo sigue sin llegar a ninguna ──────────
--
-- RF-101, RF-113. La clave anónima viaja en el cliente de todo el mundo, y la
-- visibilidad heredada se ha escrito tocando seis políticas: el aserto está aquí
-- para que un `revoke` que se cayera al reescribirlas se vea en este fichero y
-- no solo en el de al lado.
do $$
declare
  v_tables constant text[] := array[
    'provenance_events', 'artwork_bibliography', 'artwork_exhibitions',
    'artwork_documents', 'exhibition_documents', 'artwork_relationships'
  ];
  v_table text;
begin
  foreach v_table in array v_tables loop
    begin
      set local role anon;
      execute format('select 1 from public.%I limit 1', v_table);
      reset role;
      raise exception 'FAIL: el rol anónimo ha podido consultar public.%', v_table;
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: el rol anónimo no llega a ninguna de las seis (RF-101)';
end $$;

reset role;


-- ── 7. Y la forma de la política, para que no se pierda ─────
--
-- Lo funcional de arriba es lo que verifica. Esto es la red que avisa el día que
-- alguien reescriba una de las seis políticas y se deje la herencia por el
-- camino: se mide contra las DEPENDENCIAS que PostgreSQL registra de la política
-- a sus anclas y a sus propias columnas, que es lo que distingue «hereda de los
-- dos extremos» de «hereda de uno». Es el mismo bloque que corre dentro de la
-- migración, repetido desde fuera a propósito: allí protege la transacción que
-- la aplica, aquí protege el esquema que ya está aplicado.
do $$
declare
  v_expected constant text[][] := array[
    ['provenance_events',     'artworks',                      'catalog_id'],
    ['artwork_bibliography',  'artworks,bibliography',         'catalog_id,bibliography_id'],
    ['artwork_exhibitions',   'artworks,exhibitions',          'catalog_id,exhibition_id'],
    ['artwork_documents',     'artworks,archive_documents',    'catalog_id,document_id'],
    ['exhibition_documents',  'exhibitions,archive_documents', 'exhibition_id,document_id'],
    ['artwork_relationships', 'artworks',                      'from_catalog_id,to_catalog_id']
  ];
  v_i integer;
  v_table text;
  v_names text[];
  v_name text;
  v_found text[];
begin
  for v_i in 1 .. array_length(v_expected, 1) loop
    v_table := v_expected[v_i][1];

    select coalesce(array_agg(distinct anchor.relname order by anchor.relname), '{}')
      into v_found
      from pg_policy pol
      join pg_class target on target.oid = pol.polrelid
      join pg_depend d
        on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       and d.refclassid = 'pg_class'::regclass
      join pg_class anchor on anchor.oid = d.refobjid
     where target.relname = v_table and pol.polcmd = 'r'
       and anchor.relkind = 'r' and anchor.relname <> v_table;

    v_names := string_to_array(v_expected[v_i][2], ',');
    foreach v_name in array v_names loop
      if not (v_name = any (v_found)) then
        raise exception
          'FAIL: la política de select de public.% ya no hereda de public.%; nombra [%]',
          v_table, v_name, array_to_string(v_found, ', ');
      end if;
    end loop;

    select coalesce(array_agg(distinct att.attname order by att.attname), '{}')
      into v_found
      from pg_policy pol
      join pg_class target on target.oid = pol.polrelid
      join pg_depend d
        on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       and d.refclassid = 'pg_class'::regclass and d.refobjid = pol.polrelid
       and d.refobjsubid > 0
      join pg_attribute att on att.attrelid = d.refobjid and att.attnum = d.refobjsubid
     where target.relname = v_table and pol.polcmd = 'r';

    v_names := string_to_array(v_expected[v_i][3], ',');
    foreach v_name in array v_names loop
      if not (v_name = any (v_found)) then
        raise exception
          'FAIL: la política de select de public.% ya no mira su columna %; mira [%]',
          v_table, v_name, array_to_string(v_found, ', ');
      end if;
    end loop;
  end loop;
  raise notice 'OK: las seis políticas siguen atadas a sus anclas por las columnas que les corresponden';
end $$;


-- ── 8. Y lo que sigue abierto, escrito y no escondido ───────
--
-- `images` tiene el mismo hueco y no se cierra en 20260805130000: el Lector ve
-- la fila —y con ella la ruta del fichero— de la fotografía de una obra
-- retirada. Se midió el 4 de agosto de 2026 (1 fila) y le toca su propia
-- migración, como dice 20260805100000.
--
-- El aserto está AL REVÉS a propósito: afirma que el hueco sigue ahí. El día que
-- se cierre, este bloque se pone rojo y obliga a venir aquí a borrarlo, en vez de
-- dejar un comentario obsoleto diciendo que falta algo que ya está hecho.
insert into public.images (image_id, catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
values ('AR-9805_v1', 'AR-9805', 'r/min.webp', 'r/der.webp', 'r/master.jpg', 'GENERAL');

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.images where catalog_id = 'AR-9805';
  if v_n <> 1 then
    raise exception
      'El hueco de `images` ya está cerrado (el lector ve % filas de la fotografía de una obra retirada). Bórrese este bloque y anótese en el plan de pruebas.',
      v_n;
  end if;
  raise notice 'PENDIENTE, medido: el lector sigue viendo la fila de la fotografía de una obra retirada (1 fila)';
end $$;

reset role;

rollback;
