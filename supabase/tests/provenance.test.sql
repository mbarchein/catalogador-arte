-- RF-509: the provenance is an ordered sequence of events, not a field.
-- RF-510: the narrative account and the structured chain coexist without treading on each other.
-- RF-511: the rights holder is a relationship, and a party that holds up a
--         chain is not withdrawn (revises RF-905).
-- RF-218: «Sin revisar» is not «no», carried from the field to the documentary block.
-- RF-517, RF-901, RF-902: a link is withdrawn, not deleted, and the withdrawal leaves a trace.
-- RF-111, RF-113: the table is born closed and nobody has DELETE.
-- ADR-004: the structured date, with the only difference this group changes.
--
-- What is checked is what the client must not check again: that a
-- link says whom it speaks of, that the order is the cataloguer's and is redone
-- whole or is not redone, that the three enums admit no free text, that an
-- impossible year does not go in, that a link bought and sold in the same year DOES
-- go in —and that the artwork still does not admit it—, and that the research-state
-- column cannot lie through either of its two doors.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- One cataloguer, one reader, two artworks and two parties. The profiles are created by the
-- auth.users trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cat-procedencia@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-procedencia@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'La de la cadena larga', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'La de la cadena corta', 'UNCONFIRMED');

insert into public.parties (id, party_type, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'INSTITUTION', 'Galería de prueba de procedencia'),
  ('00000000-0000-0000-0000-0000000000e2', 'PERSON',      'Coleccionista de prueba'),
  -- A rights holder that does NOT appear in any chain: it is RF-511's case
  -- —the rights may not go with possession— and besides it is what allows
  -- checking the guardrail's two branches separately.
  ('00000000-0000-0000-0000-0000000000e3', 'PERSON',      'Heredera de prueba');

-- ── 1. A minimal link goes in ────────────────────────────────
-- What is known the first time a name appears in a 1985 catalogue: whom
-- it speaks of, and nothing else. Everything else is born explicit and pending.
do $$
declare v_fila public.provenance_events%rowtype;
begin
  insert into public.provenance_events (catalog_id, party_id)
  values ('AR-9700', '00000000-0000-0000-0000-0000000000e1');

  select * into v_fila from public.provenance_events where catalog_id = 'AR-9700';

  if v_fila.capacity <> 'UNREVIEWED' or v_fila.acquisition <> 'UNREVIEWED' then
    raise exception 'FAIL: la calidad y la adquisición no nacen «Sin revisar» (% / %)',
      v_fila.capacity, v_fila.acquisition;
  end if;
  if v_fila.position <> 1 then
    raise exception 'FAIL: el primer eslabón no ocupa la posición 1 (%)', v_fila.position;
  end if;
  if not v_fila.active or v_fila.note <> '' or v_fila.party_note <> ''
     or v_fila.date_text <> '' then
    raise exception 'FAIL: los campos opcionales no nacen vacíos';
  end if;
  raise notice 'OK: un eslabón mínimo entra y lo pendiente queda pendiente (RF-509, RF-205)';
end $$;

-- ── 2. A link says whom it speaks of ─────────────────────────
-- With a record or without one: «Colección privada, España» and «colección desconocida»
-- are legitimate links with no party behind them, and that is why `party_id` is null on
-- purpose. What does not exist is an anonymous link that also occupies a
-- position: a chain with a gap is a falsified document.
do $$
begin
  begin
    insert into public.provenance_events (catalog_id) values ('AR-9700');
    raise exception 'FAIL: ha entrado un eslabón que no dice de quién habla';
  exception when check_violation then
    raise notice 'OK: un eslabón sin parte y sin descripción se rechaza';
  end;

  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9700', 'Colección privada, España');
  raise notice 'OK: un eslabón sin ficha detrás es legítimo (v11: «Colección privada, [país]»)';
end $$;

-- ── 3. The order is set by the cataloguer ────────────────────
-- Manual and not derived from the dates: half the links of a catalogue
-- raisonné have no known year, and an order derived from nulls is not an order.
do $$
declare v_orden integer[];
begin
  insert into public.provenance_events (catalog_id, party_id)
  values ('AR-9700', '00000000-0000-0000-0000-0000000000e2');

  select array_agg(position order by created_at, position) into v_orden
    from public.provenance_events where catalog_id = 'AR-9700';
  if v_orden <> array[1, 2, 3] then
    raise exception 'FAIL: los eslabones no se numeraron por orden de llegada: %', v_orden;
  end if;

  -- And the order belongs to each artwork: another's first one starts at 1.
  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9701', 'colección desconocida');
  if (select position from public.provenance_events where catalog_id = 'AR-9701') <> 1 then
    raise exception 'FAIL: el orden no es independiente por obra';
  end if;
  raise notice 'OK: cada eslabón nuevo se coloca al final de la cadena de su obra';
end $$;

-- ── 4. Redoing the order is all or nothing ───────────────────
--
-- The test does NOT change role to `authenticated`, unlike the photographs'
-- one, and it is on purpose: this table's policies are written by the
-- next migration, so with RLS enabled and no policy a role with a session
-- would not see a single row and the function would fail for not finding the chain, not for
-- what is checked here. What is set is the session, which is where
-- `can_edit()` gets the caller's role from.
do $$
declare
  v_ids uuid[];
  v_orden uuid[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select array_agg(id order by position) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700' and active;

  perform public.reorder_provenance_events(
    'AR-9700', array[v_ids[3], v_ids[1], v_ids[2]]
  );

  select array_agg(id order by position) into v_orden
    from public.provenance_events where catalog_id = 'AR-9700' and active;
  if v_orden <> array[v_ids[3], v_ids[1], v_ids[2]] then
    raise exception 'FAIL: el orden guardado no es el pedido';
  end if;
  raise notice 'OK: el catalogador rehace el orden de la cadena (RF-509)';
end $$;

do $$
declare
  v_ids uuid[];
  v_antes uuid[];
  v_despues uuid[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select array_agg(id order by position) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700' and active;
  v_antes := v_ids;

  -- One is missing: half an ordered chain reads as an order and is not one.
  begin
    perform public.reorder_provenance_events('AR-9700', array[v_ids[2], v_ids[1]]);
    raise exception 'FAIL: se admitió una lista incompleta';
  exception when others then
    if position('no coincide' in sqlerrm) = 0 then raise; end if;
  end;

  -- Repeated: it would pass the count and would leave two links fighting over a position.
  begin
    perform public.reorder_provenance_events(
      'AR-9700', array[v_ids[1], v_ids[1], v_ids[2]]);
    raise exception 'FAIL: se admitieron identificadores repetidos';
  exception when others then
    if position('repetidos' in sqlerrm) = 0 then raise; end if;
  end;

  -- From another artwork: it would drag the chain next door.
  begin
    perform public.reorder_provenance_events(
      'AR-9700',
      array[v_ids[1], v_ids[2],
            (select id from public.provenance_events where catalog_id = 'AR-9701')]);
    raise exception 'FAIL: se admitió un eslabón de otra obra';
  exception when others then
    if position('no pertenece' in sqlerrm) = 0 then raise; end if;
  end;

  select array_agg(id order by position) into v_despues
    from public.provenance_events where catalog_id = 'AR-9700' and active;
  if v_antes <> v_despues then
    raise exception 'FAIL: una lista rechazada dejó el orden a medias';
  end if;
  raise notice 'OK: una lista que no es exactamente la cadena se rechaza entera';
end $$;

-- ── 5. Un lector no reordena ─────────────────────────────────
do $$
declare v_ids uuid[];
begin
  select array_agg(id order by position) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700' and active;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

  perform public.reorder_provenance_events('AR-9700', array[v_ids[2], v_ids[1], v_ids[3]]);
  raise exception 'FAIL: un lector pudo reordenar la procedencia';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no reordena la cadena: %', sqlerrm;
end $$;

-- ── 6. The three enums are closed ────────────────────────────
-- They are enums and not master tables because the CODE looks at their value: on the quality of
-- tenure depends who the current holder is and how the line is worded.
do $$
declare v_id uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events set capacity = 'DEPOSIT', acquisition = 'GIFT'
   where id = v_id;
  raise notice 'OK: en depósito habiendo llegado por donación es un eslabón normal';

  begin
    update public.provenance_events set capacity = 'PRESTADO' where id = v_id;
    raise exception 'FAIL: la calidad de tenencia ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: la calidad de tenencia es un enumerado cerrado';
  end;

  begin
    update public.provenance_events set acquisition = 'REGALO' where id = v_id;
    raise exception 'FAIL: la forma de adquisición ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: la forma de adquisición es un enumerado cerrado';
  end;

  begin
    update public.artworks set provenance_status = 'PENDIENTE' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el estado de investigación ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de investigación es un enumerado cerrado';
  end;

  -- And the two that distinguish what is pending from what was researched with no result
  -- coexist, which is the reason there are five values and not four (RF-205).
  update public.provenance_events set capacity = 'UNKNOWN' where id = v_id;
  update public.provenance_events set capacity = 'UNREVIEWED' where id = v_id;
  raise notice 'OK: «Desconocido» y «Sin revisar» son dos valores distintos';
end $$;

-- ── 7. The date, with ADR-004's shape ────────────────────────
do $$
declare v_id uuid; v_texto text;
begin
  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events
     set start_year = 1985, end_year = 1991, approximate_date = true
   where id = v_id;
  select date_text into v_texto from public.provenance_events where id = v_id;
  if v_texto <> 'c. 1985-1991' then
    raise exception 'FAIL: el texto de la fecha no se compone solo (%)', v_texto;
  end if;

  -- The note rules over the composition, like `date_note` over `execution_date`.
  update public.provenance_events set date_note = 'finales de los ochenta' where id = v_id;
  select date_text into v_texto from public.provenance_events where id = v_id;
  if v_texto <> 'finales de los ochenta' then
    raise exception 'FAIL: la nota de fecha no manda sobre la fecha compuesta (%)', v_texto;
  end if;
  update public.provenance_events set date_note = '' where id = v_id;

  -- And it is never written directly.
  begin
    update public.provenance_events set date_text = 'a mano' where id = v_id;
    raise exception 'FAIL: se ha podido escribir la columna generada';
  exception when generated_always then
    raise notice 'OK: el texto de la fecha es generado y no se escribe';
  end;

  begin
    update public.provenance_events set start_year = 985 where id = v_id;
    raise exception 'FAIL: ha entrado un año imposible';
  exception when check_violation then
    raise notice 'OK: un año fuera de rango plausible es una errata, no una fecha';
  end;

  begin
    update public.provenance_events
       set start_year = null, end_year = null, unconfirmed_date = true where id = v_id;
    raise exception 'FAIL: una bandera de duda sin año ha entrado';
  exception when check_violation then
    raise notice 'OK: «[?]» a secas no dice nada: las banderas exigen año';
  end;

  begin
    update public.provenance_events set start_year = 1990, end_year = 1985 where id = v_id;
    raise exception 'FAIL: ha entrado un rango invertido';
  exception when check_violation then
    raise notice 'OK: un rango no acaba antes de empezar';
  end;
end $$;

-- ── 8. Bought and sold in 1985 ───────────────────────────────
-- The ONLY difference from `artworks_coherent_range`, and it is the one that justifies
-- repeating the five columns instead of reusing the artwork's: there the range
-- requires strictly greater and here it admits the same year, because a tenure of
-- a few months is a perfectly normal link.
do $$
declare v_id uuid;
begin
  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events set start_year = 1985, end_year = 1985 where id = v_id;
  raise notice 'OK: un eslabón que empieza y acaba en 1985 entra';

  begin
    update public.artworks set start_year = 1985, end_year = 1985 where catalog_id = 'AR-9701';
    raise exception 'FAIL: la obra ha admitido un rango de un solo año';
  exception when check_violation then
    raise notice 'OK: la obra sigue exigiendo un rango de verdad (ADR-004, sin tocar)';
  end;
end $$;

-- ── 9. The account and the chain coexist ─────────────────────
-- RF-510: when the account has text it is what the record prints, and when it is
-- empty the record composes the line with the links. The rule lives in the
-- interface; what the base guarantees is that both representations exist and
-- neither treads on the other.
do $$
declare v_fila public.artworks%rowtype; v_eslabones int;
begin
  update public.artworks
     set provenance = 'Colección del artista; Galería de prueba, 1985 [?]; colección privada, España.',
         provenance_note = 'Según catálogo de la exposición de 1985.',
         rights_holder_party_id = '00000000-0000-0000-0000-0000000000e3',
         rights_holder_note = 'Derechos reservados a la familia pese al depósito.'
   where catalog_id = 'AR-9700';

  select * into v_fila from public.artworks where catalog_id = 'AR-9700';
  select count(*) into v_eslabones
    from public.provenance_events where catalog_id = 'AR-9700' and active;

  if v_fila.provenance = '' or v_eslabones < 3 then
    raise exception 'FAIL: escribir el relato ha borrado la cadena, o al revés (% eslabones)',
      v_eslabones;
  end if;
  if v_fila.rights_holder_party_id is distinct from '00000000-0000-0000-0000-0000000000e3'::uuid then
    raise exception 'FAIL: el titular de derechos no se ha guardado como relación (RF-511)';
  end if;
  raise notice 'OK: el relato publicable y la cadena estructurada conviven (RF-510, RF-511)';
end $$;

-- ── 10. «Sin revisar» is not «no», through both doors ────────
-- RF-218. Without this the column can lie, and a column that can lie about
-- whether something was researched is worse than not having it: the record would say «researched with no
-- result» above a list of links.
do $$
declare v_ids uuid[];
begin
  -- First door: declaring it with links underneath.
  begin
    update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9700';
    raise exception 'FAIL: se ha declarado la procedencia investigada sin resultado con eslabones';
  exception when others then
    if position('investigada sin resultado' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: no se declara «investigado sin resultado» habiendo cadena';
  end;

  -- With the chain withdrawn it can be: it is the difference between not having looked and
  -- having looked and finding nothing.
  update public.provenance_events set active = false where catalog_id = 'AR-9700';
  update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9700';
  raise notice 'OK: sin cadena activa, «investigado sin resultado» es una respuesta legítima';

  -- Second door: adding a link to an artwork declared that way.
  begin
    insert into public.provenance_events (catalog_id, party_note)
    values ('AR-9700', 'Un hallazgo posterior');
    raise exception 'FAIL: se ha añadido un eslabón a una procedencia investigada sin resultado';
  exception when others then
    if position('contradice' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: un eslabón nuevo no contradice en silencio al estado declarado';
  end;

  -- And restoring a withdrawn one does not slip through the back door either.
  select array_agg(id) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700';
  begin
    update public.provenance_events set active = true where id = v_ids[1];
    raise exception 'FAIL: restaurar un eslabón ha esquivado la comprobación';
  exception when others then
    if position('contradice' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: restaurar un eslabón tampoco contradice al estado declarado';
  end;

  -- What IS allowed, and it is intentional: links with the state on «Sin
  -- revisar». Having a datum is not having done the research.
  update public.artworks set provenance_status = 'UNREVIEWED' where catalog_id = 'AR-9700';
  update public.provenance_events set active = true where catalog_id = 'AR-9700';
  raise notice 'OK: una cadena con el estado «Sin revisar» es normal: tener datos no es haber investigado';
end $$;

-- ── 11. A party that holds up a chain is not withdrawn ───────
-- RF-511, and it revises RF-905: leaving the field empty in the artworks that had it
-- assigned would be erasing a documented link by the indirect route.
do $$
declare v_id uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  begin
    update public.parties set active = false
     where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FAIL: se ha retirado una parte que sostiene un eslabón';
  exception when others then
    if position('eslabón de procedencia' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una parte con eslabón activo no se retira';
  end;

  begin
    update public.parties set active = false
     where id = '00000000-0000-0000-0000-0000000000e3';
    raise exception 'FAIL: se ha retirado una parte que es titular de derechos';
  exception when others then
    if position('titular de derechos' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una parte titular de derechos de una obra activa no se retira';
  end;

  -- Taken out of the chain, it is withdrawn: the rule is not a padlock, it is an order.
  update public.provenance_events set active = false
   where party_id = '00000000-0000-0000-0000-0000000000e1';
  update public.parties set active = false
   where id = '00000000-0000-0000-0000-0000000000e1';
  raise notice 'OK: sacada de la cadena, la parte se retira con normalidad';

  -- And an artwork in the wastebasket does not count, as in the places: its links are no longer
  -- shown (RF-905 downwards) and requiring the wastebasket to be emptied before withdrawing
  -- a party would make the wastebasket get in the way.
  update public.provenance_events set active = true
   where party_id = '00000000-0000-0000-0000-0000000000e1';
  update public.parties set active = true
   where id = '00000000-0000-0000-0000-0000000000e1';
  update public.artworks set active = false, rights_holder_party_id = null
   where catalog_id = 'AR-9700';
  update public.parties set active = false
   where id = '00000000-0000-0000-0000-0000000000e1';
  raise notice 'OK: los eslabones de una obra en la papelera no retienen a su parte';

  update public.artworks set active = true where catalog_id = 'AR-9700';
  update public.parties set active = true where id = '00000000-0000-0000-0000-0000000000e1';
end $$;

-- ── 12. A party in use is not force-deleted either ───────────
-- `on delete restrict` is the belt under nobody having DELETE:
-- if a party were ever deleted by hand, this warns instead of breaking the
-- chain in silence.
do $$
begin
  begin
    delete from public.parties where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FAIL: se ha borrado una parte que sostiene un eslabón';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena impide borrar una parte en uso';
  end;
end $$;

-- ── 13. The link's wastebasket ───────────────────────────────
-- RF-517, which revises RF-903: RF-903's premise —that a bridge row has
-- nothing citable and redoing it is enough— does not hold for a link that carries
-- years, quality of tenure and the datum's source.
do $$
declare
  v_id uuid;
  v_baja timestamptz; v_quien uuid;
  v_restaurada timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events set active = false where id = v_id;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.provenance_events where id = v_id;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del eslabón no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.provenance_events where id = v_id) then
    raise exception 'FAIL: el eslabón ha desaparecido al retirarlo';
  end if;

  update public.provenance_events set active = true where id = v_id;
  select deactivated_at, restored_at into v_baja, v_restaurada
    from public.provenance_events where id = v_id;
  if v_restaurada is null or v_baja is null then
    raise exception 'FAIL: restaurar no ha dejado traza, o ha borrado la de la baja (RF-902)';
  end if;
  raise notice 'OK: el eslabón se retira, se restaura y conserva las dos trazas';
end $$;

-- ── 14. Nobody really deletes, and the table is born closed ──
-- RF-901, RF-111, RF-113. The policies are written by the next migration; with
-- RLS enabled and no policy, the table is closed, which is the safe state
-- to wait in. What can never happen is the opposite: privileges
-- granted with no RLS.
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'provenance_events'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL: hay una política que permite DELETE sobre los eslabones';
  end if;
  if has_table_privilege('authenticated', 'public.provenance_events', 'delete')
     or has_table_privilege('anon', 'public.provenance_events', 'delete') then
    raise exception 'FAIL: alguien tiene privilegio de DELETE sobre los eslabones';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.provenance_events'::regclass) then
    raise exception 'FAIL: la tabla de eslabones no tiene RLS activado';
  end if;
  raise notice 'OK: RLS activado, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.provenance_events limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar la procedencia';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a la procedencia';
end $$;

reset role;

-- ── 15. The move of the tree's four nodes ────────────────────
-- Over a base loaded with the dump: ADR-006 anticipated that the museums and the
-- collections would stop being places, and this migration fulfils it halfway and on
-- purpose —the node stays, because it still answers «where is the artwork»;
-- what leaves the tree is the ownership stuffed inside the name.
--
-- In a base with no dump (continuous integration) there is nothing to check and
-- the block says so out loud instead of taking a zero as good.
do $$
declare
  v_eslabones int;
  v_fichas int;
  v_matiz int;
  v_inventados int;
  v_lugar text;
begin
  select count(*) into v_eslabones
    from public.provenance_events where note like 'Trasladado del árbol de lugares%';

  if v_eslabones = 0 then
    raise notice 'OK (base sin volcado): no hay traslado del árbol que comprobar';
    return;
  end if;

  if v_eslabones <> 8 then
    raise exception 'FAIL: el traslado dejó % eslabones y las obras afectadas eran 8', v_eslabones;
  end if;

  select count(*) into v_fichas
    from public.parties where note like 'Ficha creada al sacar la propiedad%';
  if v_fichas <> 3 then
    raise exception 'FAIL: el traslado creó % fichas de parte y eran 3 (las dos Hormeño comparten)',
      v_fichas;
  end if;

  -- No active place carries the ownership inside its name any more, which is half
  -- the reason for all this.
  if exists (select 1 from public.physical_places where active and name ilike '%propiedad de%') then
    raise exception 'FAIL: sigue habiendo un lugar activo con la propiedad dentro del nombre';
  end if;

  -- And the precision that name carried inside has not been lost: it travels to the
  -- link, which is where it means something. The artwork is still in the tree, in the
  -- sibling node.
  select count(*) into v_matiz
    from public.provenance_events
   where note like 'Trasladado del árbol de lugares%' and party_note <> '';
  if v_matiz <> 1 then
    raise exception 'FAIL: la precisión de propiedad no ha llegado al eslabón (% filas)', v_matiz;
  end if;

  select p.name into v_lugar
    from public.provenance_events e
    join public.artworks a on a.catalog_id = e.catalog_id
    join public.physical_places p on p.id = a.physical_place_id
   where e.note like 'Trasladado del árbol de lugares%' and e.party_note <> '';
  if v_lugar is null or v_lugar ilike '%propiedad de%' then
    raise exception 'FAIL: la obra de la coletilla no ha quedado en el nodo hermano (%)', v_lugar;
  end if;

  -- And no legal fact has been invented: the tree said where the
  -- artwork is, not in what capacity whoever keeps it has it.
  select count(*) into v_inventados
    from public.provenance_events
   where note like 'Trasladado del árbol de lugares%'
     and (capacity <> 'UNREVIEWED' or acquisition <> 'UNREVIEWED');
  if v_inventados > 0 then
    raise exception 'FAIL: % eslabones trasladados se inventan la calidad o la adquisición',
      v_inventados;
  end if;

  raise notice 'OK: los ocho eslabones del árbol están, con su matiz y sin inventarse nada';
end $$;

rollback;
