-- The visibility cascade of an artwork's logical deletion.
--
-- RF-609, RF-905, RF-910, RF-911, RF-912, RF-913, RF-906, RF-105, RF-106,
-- RF-109, RF-111, RF-511.
--
-- THIS FILE WAS BORN OF A MEASURED LEAK, not of a design review. With the
-- policy before 20260805130000, a Reader authenticated against a logically
-- deleted artwork saw:
--
--   the artwork ............... 0 rows
--   its provenance link ....... 1 row
--   its citation .............. 1 row
--   its participation ......... 1 row
--   its document .............. 1 row
--   its relationship .......... 1 row
--
-- and, following the link to `parties`, the name and the CONTACT of the
-- private collector who had it. The record was hidden and the chain of
-- owners of that hidden record was not: it is the only datum in the catalogue whose
-- exposure affects people outside the project, and that is why this file
-- checks it by reading the real contact and not by counting rows of a bridge.
--
-- Everything is exercised AUTHENTICATING as a user of each role. Checking that the
-- policy says `exists` verifies nothing: what matters is what the base
-- answers when the request comes from whom it comes, which is what a `curl`
-- with the Reader's token will do — there is no interface standing in between.
--
-- The four blocks that hold up the file, and why none is superfluous:
--
--   1. The leak: six counts at zero and the contact unreadable.
--   2. THE CONTROL, with everything active: the same six counts at one. Without it, a
--      policy that always denied would pass block 1 and the catalogue would be left
--      blank with nothing warning about it.
--   3. BOTH ENDS of each bridge, one by one. It is what distinguishes
--      «inherits» from «half inherits», and it is the mistake an extra `exists`
--      hides: with only the artwork's end, blocks 1 and 2 pass all the same.
--   4. The Cataloguer's COMPLETE wastebasket. It is the one this migration cannot
--      break: it is their way of restoring (RF-906), and a visibility fix
--      that emptied it would be worse than the leak.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- A real Cataloguer and a real Reader, with their `profiles` row created by the
-- `auth.users` trigger.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'cat-cascada@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'lec-cascada@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000a2';

-- Four artworks. The identifiers are chosen for their ORDER, not out of taste:
-- the canonicalisation trigger puts the lesser in `from_catalog_id` of a
-- symmetric relationship, so AR-9800 < AR-9805 < AR-9810 is what allows
-- the withdrawn artwork to be left once at each end.
insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9800', 'ROTILI', 'Obra activa anterior', 'UNCONFIRMED'),
  ('AR-9805', 'ROTILI', 'La obra que se da de baja', 'UNCONFIRMED'),
  ('AR-9810', 'ROTILI', 'Obra activa posterior', 'UNCONFIRMED'),
  ('AR-9820', 'ROTILI', 'Obra del control, todo activo', 'UNCONFIRMED');

-- The third party's personal datum. RF-105 decides that the Reader sees `contact` OF THE
-- PARTIES THEY CAN SEE; what had to be fixed is which ones they can see.
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

-- ── The five documentary rows of the artwork that is withdrawn ─

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

-- The SAME document, hanging also from an exhibition that is still active: it is the
-- case in which the two anchors disagree, and the criterion written in the migration
-- says which wins. It is checked in block 5.
insert into public.exhibition_documents (id, exhibition_id, document_id) values
  ('9a00000d-0000-4000-8000-000000000001', '9a000007-0000-4000-8000-000000000001',
   '9a00000b-0000-4000-8000-000000000001');

-- The artwork withdrawn at EACH end of a relationship, which is what is needed
-- for looking at only one side not to pass the test.
insert into public.artwork_relationships (id, from_catalog_id, to_catalog_id, relationship_type_id) values
  ('9a00000f-0000-4000-8000-000000000001', 'AR-9805', 'AR-9810',
   '9a00000e-0000-4000-8000-000000000001'),
  ('9a00000f-0000-4000-8000-000000000002', 'AR-9800', 'AR-9805',
   '9a00000e-0000-4000-8000-000000000001');

-- That the canonicalisation has left the ends where this file says they
-- are. If the criterion ever changes, this says so instead of leaving the test
-- passing for the wrong reason.
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

-- ── The same five rows of an artwork that is NOT withdrawn ───
--
-- Block 2's control. They go to the same anchor records, all active.

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

-- ── The bridges with the OTHER end withdrawn ─────────────────
--
-- Artwork ACTIVE in all of them: the only thing withdrawn is the record on the other side. Without these
-- five rows, a policy that only inherited from the artwork would pass the whole
-- file.

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

-- And NOW the anchor records are withdrawn: the artwork and, separately, the reference,
-- the exhibition and the document at the other end. Not a single documentary row is
-- touched — it is exactly what happens in production, because an artwork's withdrawal does
-- not carry a data cascade and must not carry one (RF-905: restoring gives the artwork
-- back with everything of its own inside and in the state it was in).
update public.artworks set active = false, deactivated_at = now(),
       deactivated_by = '00000000-0000-0000-0000-0000000000a1'
 where catalog_id = 'AR-9805';
update public.bibliography set active = false
 where id = '9a000004-0000-4000-8000-000000000002';
update public.exhibitions set active = false
 where id = '9a000007-0000-4000-8000-000000000002';
update public.archive_documents set active = false
 where id = '9a00000b-0000-4000-8000-000000000002';

-- And that the withdrawal has not cascaded over the data, measured and not assumed:
-- if that cascade were ever added, the blocks below would stop
-- verifying the policy and would pass for the wrong reason.
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


-- ── 1. The leak: the Reader sees nothing of the withdrawn artwork ─
--
-- RF-609. Each count is one of the lines of the measurement of 4 August
-- 2026, and each one was at 1 before 20260805130000.
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

  -- Both ends of the relationship in one go.
  select count(*) into v_n from public.artwork_relationships
   where from_catalog_id = 'AR-9805' or to_catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception
      'FAIL: el lector ve % relación(es) de una obra retirada, así que sabe que la obra existe', v_n;
  end if;

  raise notice 'OK: el lector no ve ninguna de las cinco filas documentales de una obra retirada (RF-609)';
end $$;

reset role;

-- And THE LEAK IN ITS OWN TERMS: not a count of a bridge, but the third
-- party's personal datum, read with the query that pulled it out. RF-511 and the
-- test plan's priority 1: it is the only datum whose exposure affects
-- people outside the catalogue.
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


-- ── 8. La fotografía, que era el último hueco ───────────────
--
-- `images` tenía el mismo hueco y 20260805130000 no lo cerró: el Lector veía la
-- fila —y con ella las tres rutas del almacén— de la fotografía de una obra
-- retirada. Se midió el 4 de agosto de 2026 (1 fila) y lo cierra
-- 20260805150000.
--
-- **Este bloque estuvo escrito AL REVÉS**, afirmando que la fuga seguía ahí para
-- ponerse rojo el día que se cerrara. Era una mala idea y por eso ya no está: un
-- rojo tiene que significar siempre «algo se ha roto», y si además puede
-- significar «alguien ha arreglado algo», el color deja de informar. Lo que está
-- pendiente se anota en el plan de pruebas, no en un aserto.
--
-- Se comprueban las TRES cosas, porque cerrar de más aquí rompe la papelera:
-- que el Lector no la vea, que el Catalogador sí —restaurar una obra devuelve
-- sus fotografías dentro (RF-905) y la papelera enseña lo retirado (RF-906)— y
-- que lo que cuelga de la fotografía hereda el cierre sin que nadie lo repita.
insert into public.images (image_id, catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
values ('AR-9805_v1', 'AR-9805', 'r/min.webp', 'r/der.webp', 'r/master.jpg', 'GENERAL');

-- Lo que cuelga de la fotografía: un enlace de «de dónde salió esta
-- reproducción» y una línea de historia con la fotografía como fila.
insert into public.external_links (id, image_id, url, title) values
  ('9a000010-0000-4000-8000-000000000001', 'AR-9805_v1',
   'https://ejemplo.es/de-donde-salio', 'De dónde salió esta reproducción');

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.images where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception
      'FAIL: el lector ve % fila(s) de la fotografía de una obra retirada, y con ellas las rutas del almacén (RF-609)',
      v_n;
  end if;

  -- La vista lleva `security_invoker = true`, así que era el otro camino a la
  -- misma fila: si heredara mal, la fuga seguiría abierta por aquí.
  select count(*) into v_n from public.representative_image where catalog_id = 'AR-9805';
  if v_n <> 0 then
    raise exception
      'FAIL: el lector alcanza la fotografía de una obra retirada por la vista representative_image (% filas)', v_n;
  end if;

  -- Y lo que cuelga de la fotografía, que hereda de `images` por su propia
  -- política y no por una copia de la regla.
  select count(*) into v_n from public.external_links
   where id = '9a000010-0000-4000-8000-000000000001';
  if v_n <> 0 then
    raise exception
      'FAIL: el lector ve un enlace que cuelga de la fotografía de una obra retirada (% filas)', v_n;
  end if;

  reset role;
  raise notice 'OK: el lector no ve la fotografía de una obra retirada, ni por la vista, ni lo que cuelga de ella';
end $$;

reset role;

-- Y el Catalogador sí, que es la mitad que se rompe si se cierra de más.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.images where catalog_id = 'AR-9805';
  if v_n <> 1 then
    raise exception
      'FAIL: el catalogador no ve la fotografía de la obra que está en la papelera (% filas): restaurarla no la devolvería entera (RF-905, RF-906)',
      v_n;
  end if;

  select count(*) into v_n from public.external_links
   where id = '9a000010-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception
      'FAIL: el catalogador no ve el enlace de la fotografía de una obra retirada (% filas)', v_n;
  end if;

  reset role;
  raise notice 'OK: el catalogador sigue viendo la fotografía de la papelera y lo que cuelga de ella (RF-905, RF-906)';
end $$;

reset role;

rollback;
