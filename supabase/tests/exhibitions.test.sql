-- RF-512: exhibition venues are their own master table with a surrogate key,
--         different from the place tree, and a venue in use is not withdrawn.
-- RF-501: an artwork's participation in a show is a row of the bridge,
--         unique per pair, with its catalogue number and its note.
-- RF-502: the exhibition history is ordered ascending even if the exact
--         date is not known, and the year cannot contradict the date.
-- RF-503: an exhibition's catalogue has no table of its own: it links to the
--         bibliography, and the link is navigable in both directions.
-- RF-513: the show's catalogue number is a column apart from the note.
-- RF-517, RF-903: a participation is withdrawn, not deleted, and adding it again
--         restores it instead of clashing against uniqueness.
-- RF-218: «Sin revisar» is not «no», carried from the field to the documentary block. It is
--         the case that gives the rule its name: an artwork with no registered
--         participations is not an artwork that was not exhibited.
-- RF-205: what is pending is born pending.
-- RF-901, RF-902: nothing is deleted, and the withdrawal leaves a trace.
-- RF-909: duplicates are resolved by review, not by uniqueness of the title.
-- RF-111, RF-113: the three tables are born closed and nobody has DELETE.
--
-- What is checked is what the client must not check again: that an
-- exhibition with no date at all does not go in, that the year is derived from the date and
-- never contradicts it, that half a date does not exist, that a venue is distinguished by
-- name AND locality because there is a «Casa de Cultura» in every town, that a
-- catalogue record cannot hang from a show recorded as having no catalogue, that
-- adding a withdrawn participation again recovers it with its number, and that
-- the research-state column cannot lie through either of its two
-- doors — neither the new one, nor the two this group REPLACES and could have
-- swallowed with nothing warning about it.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- One cataloguer, one reader and two artworks. The profiles are created by the
-- auth.users trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'cat-expo@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'lec-expo@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9800', 'ROTILI', 'La muy expuesta', 'UNCONFIRMED'),
  ('AR-9801', 'ROTILI', 'La que no salió del estudio', 'UNCONFIRMED');

-- ── 1. A minimal venue goes in, and what is pending stays empty ─
-- The name and nothing else: what is known on noting down a show from a press
-- clipping. The institution behind is optional on purpose — a house of culture
-- is a real venue with no institution record, and forcing one to create it would fill
-- `parties` with records with no contact and no provenance.
do $$
declare v_fila public.exhibition_venues%rowtype;
begin
  insert into public.exhibition_venues (name, locality, country)
  values ('Museo de Prueba de Badajoz', 'Badajoz', 'España');

  select * into v_fila from public.exhibition_venues
   where name = 'Museo de Prueba de Badajoz';

  if v_fila.party_id is not null then
    raise exception 'FAIL: la institución detrás de la sede no nace nula';
  end if;
  if v_fila.note <> '' then
    raise exception 'FAIL: la nota de la sede no nace vacía';
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una sede nueva no nace activa';
  end if;
  raise notice 'OK: una sede mínima entra y la institución detrás es opcional (RF-512)';
end $$;

-- ── 2. A venue is distinguished by name AND locality ─────────
-- There is a «Casa de Cultura» in every town and a «Sala de Exposiciones» in every
-- capital: with uniqueness by the bare name, the second would be an
-- incomprehensible error. And compared with the schema's name comparison
-- key, because two venues differing only in an accent are the same venue.
do $$
begin
  insert into public.exhibition_venues (name, locality) values ('Casa de Cultura', 'Olivenza');
  insert into public.exhibition_venues (name, locality) values ('Casa de Cultura', 'Mérida');
  raise notice 'OK: la misma casa de cultura en dos pueblos son dos sedes (RF-512)';

  begin
    insert into public.exhibition_venues (name, locality) values ('casa de CULTURA', 'Merida');
    raise exception 'FAIL: han entrado dos filas de la misma sede';
  exception when unique_violation then
    raise notice 'OK: dos escrituras de la misma sede son la misma fila';
  end;

  begin
    insert into public.exhibition_venues (name) values ('   ');
    raise exception 'FAIL: ha entrado una sede en blanco';
  exception when check_violation then
    raise notice 'OK: una sede sin nombre se rechaza';
  end;

  begin
    insert into public.exhibition_venues (name) values (' Ateneo ');
    raise exception 'FAIL: ha entrado una sede sin recortar';
  exception when check_violation then
    raise notice 'OK: una sede con espacios alrededor se rechaza';
  end;
end $$;

-- ── 3. A minimal exhibition goes in ──────────────────────────
-- The title and the year: what appears in a clipping's first line. Everything
-- else is born pending and explicit (RF-205).
do $$
declare v_fila public.exhibitions%rowtype;
begin
  insert into public.exhibitions (title, year)
  values ('Rotili. Pinturas de prueba', 1985);

  select * into v_fila from public.exhibitions where title = 'Rotili. Pinturas de prueba';

  if v_fila.exhibition_type <> 'UNREVIEWED' then
    raise exception 'FAIL: el tipo de exposición no nace «Sin revisar» (RF-205)';
  end if;
  if v_fila.catalogue_published <> 'UNREVIEWED' then
    raise exception 'FAIL: el catálogo publicado no nace «Sin revisar»: que no conste no es que no lo hubiera';
  end if;
  if v_fila.venue_id is not null or v_fila.catalogue_reference_id is not null
     or v_fila.start_date is not null or v_fila.end_date is not null then
    raise exception 'FAIL: la sede, el catálogo o las fechas no nacen nulos';
  end if;
  if v_fila.venue_note <> '' or v_fila.date_note <> '' or v_fila.note <> '' then
    raise exception 'FAIL: las notas no nacen vacías';
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una exposición nueva no nace activa';
  end if;
  raise notice 'OK: una exposición mínima entra y lo pendiente queda pendiente (RF-205)';
end $$;

-- ── 4. With no title it is not cited; with no date it is not ordered ─
-- An exhibition with no date at all cannot be placed in a chronological
-- history, and placing it last «because it is not known» would be inventing the datum.
do $$
begin
  begin
    insert into public.exhibitions (title, year) values ('   ', 1985);
    raise exception 'FAIL: ha entrado una exposición sin título';
  exception when check_violation then
    raise notice 'OK: un título en blanco se rechaza';
  end;

  begin
    insert into public.exhibitions (title) values ('Sin fecha ninguna');
    raise exception 'FAIL: ha entrado una exposición sin año y sin fechas';
  exception when check_violation then
    raise notice 'OK: una exposición sin fecha ninguna se rechaza (RF-502)';
  end;

  begin
    insert into public.exhibitions (title, year) values ('Año imposible por abajo', 999);
    raise exception 'FAIL: ha entrado un año de tres cifras';
  exception when check_violation then
    raise notice 'OK: un año implausible por abajo se rechaza';
  end;

  begin
    insert into public.exhibitions (title, year) values ('Año imposible por arriba', 2101);
    raise exception 'FAIL: ha entrado un año del siglo XXII';
  exception when check_violation then
    raise notice 'OK: un año implausible por arriba se rechaza';
  end;
end $$;

-- ── 5. The year is derived from the date, never the other way round ─
-- Writing the exact dates and the year as well would be asking twice for the same
-- datum and guaranteeing that one day they do not match.
do $$
declare v_fila public.exhibitions%rowtype;
begin
  insert into public.exhibitions (title, start_date, end_date)
  values ('Rotili en la Casa de Cultura', date '1985-03-14', date '1985-04-07');

  select * into v_fila from public.exhibitions where title = 'Rotili en la Casa de Cultura';
  if v_fila.year <> 1985 then
    raise exception 'FAIL: el año no se ha deducido de la fecha de inicio (%)', v_fila.year;
  end if;
  raise notice 'OK: el año se rellena solo desde la fecha de inicio (RF-502)';

  -- And the other way round no: from a lone year no 1 January is invented.
  if (select start_date from public.exhibitions where title = 'Rotili. Pinturas de prueba')
     is not null then
    raise exception 'FAIL: se ha inventado una fecha de apertura a partir del año';
  end if;
  raise notice 'OK: de un año suelto no se inventa una fecha de apertura';

  begin
    insert into public.exhibitions (title, year, start_date)
    values ('El año y la fecha se contradicen', 1985, date '1986-03-14');
    raise exception 'FAIL: el año ha podido contradecir a la fecha de inicio';
  exception when check_violation then
    raise notice 'OK: el año no puede contradecir a la fecha de inicio';
  end;

  -- And correcting the date forgetting the year is the same mistake through the other door.
  begin
    update public.exhibitions set start_date = date '1986-03-14'
     where title = 'Rotili en la Casa de Cultura';
    raise exception 'FAIL: mover la fecha ha dejado el año contradiciéndola';
  exception when check_violation then
    raise notice 'OK: mover la fecha sin mover el año se rechaza';
  end;
end $$;

-- ── 6. Half a date does not exist ────────────────────────────
-- A closing earlier than the opening is a typo; a closing WITH NO opening is
-- half a date, and a bare `end_date >= start_date` would have let it through
-- because a comparison with null is not false.
do $$
begin
  begin
    insert into public.exhibitions (title, start_date, end_date)
    values ('Cierra antes de abrir', date '1985-04-01', date '1985-03-01');
    raise exception 'FAIL: ha entrado una exposición que cierra antes de abrir';
  exception when check_violation then
    raise notice 'OK: un cierre anterior a la apertura se rechaza';
  end;

  begin
    insert into public.exhibitions (title, year, end_date)
    values ('Cierra sin haber abierto', 1985, date '1985-04-01');
    raise exception 'FAIL: ha entrado un cierre sin apertura';
  exception when check_violation then
    raise notice 'OK: un cierre sin apertura se rechaza: media fecha no existe';
  end;

  -- And a one-day show is legitimate: it opens and closes the same day.
  insert into public.exhibitions (title, start_date, end_date)
  values ('Muestra de un día', date '1990-05-18', date '1990-05-18');
  raise notice 'OK: una muestra que abre y cierra el mismo día entra';
end $$;

-- ── 7. Both enums are closed ─────────────────────────────────
do $$
begin
  begin
    insert into public.exhibitions (title, year, exhibition_type)
    values ('Tipo inventado', 1985, 'ANTOLOGICA');
    raise exception 'FAIL: el tipo de exposición ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el tipo de exposición es un enumerado cerrado';
  end;

  begin
    insert into public.exhibitions (title, year, catalogue_published)
    values ('Catálogo quizás', 1985, 'QUIZAS');
    raise exception 'FAIL: el catálogo publicado ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el catálogo publicado es un tri-estado cerrado';
  end;

  -- And the three values of the tri-state go in, including the one that gives the
  -- rule its name: «Sin revisar» is not «No».
  insert into public.exhibitions (title, year, exhibition_type, catalogue_published)
  values ('Colectiva con catálogo', 1988, 'COLLECTIVE', 'YES');
  insert into public.exhibitions (title, year, exhibition_type, catalogue_published)
  values ('Individual sin catálogo comprobado', 1992, 'INDIVIDUAL', 'NO');
  raise notice 'OK: individual, colectiva y los tres estados del catálogo entran';
end $$;

-- ── 8. The venue, and what it holds up ───────────────────────
-- The foreign key guarantees the venue exists; the withdrawal trigger guarantees
-- that one still hosting active exhibitions is not withdrawn. Without it, withdrawing it does not
-- withdraw it: it leaves the history pointing at something the interface no longer offers.
do $$
declare v_sede uuid;
begin
  select id into v_sede from public.exhibition_venues where name = 'Museo de Prueba de Badajoz';

  update public.exhibitions set venue_id = v_sede where title = 'Colectiva con catálogo';

  begin
    insert into public.exhibitions (title, year, venue_id)
    values ('Sede inventada', 1985, '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: una exposición ha podido apuntar a una sede inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una sede inexistente';
  end;

  begin
    update public.exhibition_venues set active = false where id = v_sede;
    raise exception 'FAIL: se ha retirado una sede que todavía acoge exposiciones';
  exception when raise_exception then
    raise notice 'OK: una sede en uso no se retira: %', sqlerrm;
  end;

  -- An exhibition in the wastebasket does not count, as in the other master tables: requiring
  -- the wastebasket to be emptied before withdrawing a venue would make the wastebasket
  -- get in the way.
  update public.exhibitions set active = false where title = 'Colectiva con catálogo';
  update public.exhibition_venues set active = false where id = v_sede;
  raise notice 'OK: una exposición retirada no impide retirar su sede (RF-905)';

  -- And everything is left as it was for what comes afterwards.
  update public.exhibition_venues set active = true where id = v_sede;
  update public.exhibitions set active = true where title = 'Colectiva con catálogo';

  begin
    delete from public.exhibition_venues where id = v_sede;
    raise exception 'FAIL: se ha borrado una sede en uso';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena impide borrar una sede en uso';
  end;
end $$;

-- ── 9. The venue is NOT the place tree ───────────────────────
-- Decided explicitly, and that is why it is checked: they are two tables. The tree
-- answers «where is the artwork today» and its nodes contain other nodes; the venue
-- answers «where did a show happen in 1985», it is historical and contains
-- nothing. Merging them would put «Balda 2» in the venue selector.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'exhibition_venues'
                and column_name = 'parent_id') then
    raise exception 'FAIL: la sede ha ganado jerarquía y se ha convertido en un árbol (RF-512)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'exhibition_venues'
                    and column_name = 'locality') then
    raise exception 'FAIL: la sede no tiene localidad propia y RF-502 no puede componerse';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'exhibitions'
                and column_name = 'physical_place_id') then
    raise exception 'FAIL: la exposición cuelga del árbol del almacén (RF-512)';
  end if;
  raise notice 'OK: la sede y el árbol de lugares siguen siendo dos cosas (RF-512)';
end $$;

-- ── 10. The institution behind the venue ─────────────────────
-- So as not to duplicate the museum's contact. And a party that is behind an
-- active venue is not withdrawn, with the same rule that holds up the provenance: the
-- venue would be left with the contact hanging from a record the interface no longer
-- offers.
do $$
declare v_parte uuid; v_sede uuid;
begin
  insert into public.parties (party_type, name, locality, country, contact)
  values ('INSTITUTION', 'Fundación de Prueba para Exposiciones', 'Badajoz', 'España',
          'expo@fundacion.test')
  returning id into v_parte;

  select id into v_sede from public.exhibition_venues where name = 'Museo de Prueba de Badajoz';
  update public.exhibition_venues set party_id = v_parte where id = v_sede;

  begin
    update public.parties set active = false where id = v_parte;
    raise exception 'FAIL: se ha retirado la institución que hay detrás de una sede activa';
  exception when raise_exception then
    if position('sede' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la institución de una sede activa no se retira: %', sqlerrm;
  end;

  -- With the venue withdrawn, the institution can be withdrawn.
  update public.exhibitions set venue_id = null where venue_id = v_sede;
  update public.exhibition_venues set active = false where id = v_sede;
  update public.parties set active = false where id = v_parte;
  raise notice 'OK: retirada la sede, su institución se puede retirar';

  -- And everything is left as it was.
  update public.parties set active = true where id = v_parte;
  update public.exhibition_venues set active = true where id = v_sede;
end $$;

-- ── 11. And that same function's two previous doors ──────────
--
-- `tg_party_deactivation` was written by the provenance's migration and this
-- group REPLACES it with `create or replace` to add the venue to it. A replacement
-- can swallow a previous block with nothing warning: the provenance's test
-- passes all the same, because it checks the function that is there and not the one that was. This is the
-- regression to be caught here.
do $$
declare v_parte uuid;
begin
  insert into public.parties (party_type, name)
  values ('PERSON', 'Coleccionista de Prueba para Exposiciones')
  returning id into v_parte;

  insert into public.provenance_events (catalog_id, party_id)
  values ('AR-9800', v_parte);

  begin
    update public.parties set active = false where id = v_parte;
    raise exception 'FAIL: el reemplazo se ha comido la puerta del eslabón de procedencia';
  exception when raise_exception then
    if position('procedencia' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la puerta del eslabón de procedencia sigue en pie (RF-511)';
  end;

  update public.provenance_events set active = false
   where catalog_id = 'AR-9800' and party_id = v_parte;

  update public.artworks set rights_holder_party_id = v_parte where catalog_id = 'AR-9800';
  begin
    update public.parties set active = false where id = v_parte;
    raise exception 'FAIL: el reemplazo se ha comido la puerta del titular de derechos';
  exception when raise_exception then
    if position('derechos' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la puerta del titular de derechos sigue en pie (RF-511)';
  end;

  update public.artworks set rights_holder_party_id = null where catalog_id = 'AR-9800';
  update public.parties set active = false where id = v_parte;
  raise notice 'OK: sin nada que sostener, la parte se retira';
end $$;

-- ── 12. The show's catalogue lives in the bibliography ───────
-- RF-503: it has no table of its own. And the record cannot hang from a show that
-- is recorded as having no catalogue — the other way round it can: a catalogue may be recorded as published and not
-- yet be registered, which is the normal state while research goes on.
do $$
declare v_ref uuid; v_expo uuid; v_n int;
begin
  insert into public.bibliography (title, year, publisher, place)
  values ('Rotili. Catálogo de prueba de la colectiva', 1988,
          'Diputación de Badajoz', 'Badajoz')
  returning id into v_ref;

  select id into v_expo from public.exhibitions where title = 'Colectiva con catálogo';

  begin
    update public.exhibitions
       set catalogue_reference_id = v_ref, catalogue_published = 'UNREVIEWED'
     where id = v_expo;
    raise exception 'FAIL: una ficha de catálogo cuelga de una muestra que consta sin catálogo';
  exception when check_violation then
    raise notice 'OK: la ficha del catálogo exige que conste que hubo catálogo (RF-503)';
  end;

  update public.exhibitions
     set catalogue_reference_id = v_ref, catalogue_published = 'YES'
   where id = v_expo;

  -- Navigable in both directions, which is what the test plan asks for: from the
  -- show to its catalogue and from the catalogue to the show that generated it.
  select count(*) into v_n
    from public.exhibitions e
    join public.bibliography b on b.id = e.catalogue_reference_id
   where e.id = v_expo and b.title = 'Rotili. Catálogo de prueba de la colectiva';
  if v_n <> 1 then
    raise exception 'FAIL: de la exposición no se llega a su catálogo';
  end if;

  select count(*) into v_n
    from public.bibliography b
    join public.exhibitions e on e.catalogue_reference_id = b.id
   where b.id = v_ref;
  if v_n <> 1 then
    raise exception 'FAIL: del catálogo no se llega a la exposición que lo generó';
  end if;

  begin
    update public.exhibitions
       set catalogue_reference_id = '00000000-0000-0000-0000-00000000dead'
     where id = v_expo;
    raise exception 'FAIL: la ficha del catálogo ha podido apuntar a una referencia inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: el enlace con el catálogo es navegable en los dos sentidos (RF-503)';
  end;
end $$;

-- ── 13. Two exhibitions can be called the same (RF-909) ──────
-- A touring show in Badajoz and in Cáceres are two shows and are titled the same. Uniqueness
-- of the title would have turned a real datum into an error.
do $$
begin
  insert into public.exhibitions (title, year) values ('Alberto Rotili. Antológica', 1995);
  insert into public.exhibitions (title, year) values ('Alberto Rotili. Antológica', 1996);
  raise notice 'OK: dos exposiciones distintas pueden llamarse igual (RF-909)';
end $$;

-- ── 14. The exhibition history is ordered ascending ──────────
-- RF-502. What is checked is that the order works WITHOUT depending on the exact
-- date being known: when there is no date, the year orders.
do $$
declare v_orden text[];
begin
  select array_agg(title order by coalesce(start_date, make_date(year::integer, 1, 1)))
    into v_orden
    from public.exhibitions
   where title in ('Rotili. Pinturas de prueba',      -- 1985, solo año
                   'Rotili en la Casa de Cultura',    -- 1985-03-14
                   'Colectiva con catálogo',          -- 1988, solo año
                   'Muestra de un día');              -- 1990-05-18

  if v_orden <> array['Rotili. Pinturas de prueba',
                      'Rotili en la Casa de Cultura',
                      'Colectiva con catálogo',
                      'Muestra de un día'] then
    raise exception 'FAIL: el historial expositivo no se ordena de forma ascendente (%)',
      array_to_string(v_orden, ' | ');
  end if;
  raise notice 'OK: el historial se ordena ascendente con o sin fecha exacta (RF-502)';
end $$;

-- ── 15. The participation: number and note, two columns ──────
-- RF-513. It undoes v11 v7's merge with the criterion v11 itself wrote
-- in v9: «cat. 12 bis» is a datum citable exactly and it gets searched for. What
-- this test demonstrates is that it is queried WITHOUT parsing free text.
do $$
declare
  v_expo uuid;
  v_fila public.artwork_exhibitions%rowtype;
begin
  select id into v_expo from public.exhibitions where title = 'Colectiva con catálogo';

  insert into public.artwork_exhibitions (catalog_id, exhibition_id, catalogue_number, note)
  values ('AR-9800', v_expo, '12 bis',
          'Prestada por la familia; sin marco en aquel momento');

  select * into v_fila from public.artwork_exhibitions
   where catalog_id = 'AR-9800' and exhibition_id = v_expo;

  if v_fila.catalogue_number <> '12 bis' then
    raise exception 'FAIL: el número de catálogo no se guarda aparte (%)', v_fila.catalogue_number;
  end if;
  if v_fila.note <> 'Prestada por la familia; sin marco en aquel momento' then
    raise exception 'FAIL: la nota no se guarda aparte (%)', v_fila.note;
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una participación nueva no nace activa';
  end if;

  -- And it is filtered by without searching inside a note, which is what v7 left
  -- written as being lost on merging them.
  if not exists (select 1 from public.artwork_exhibitions
                  where catalogue_number = '12 bis' and active) then
    raise exception 'FAIL: no se puede filtrar por número de catálogo de exposición (RF-513)';
  end if;

  -- «s/n» and «II.4» are real catalogue numbers: that is why the column is text.
  insert into public.artwork_exhibitions (catalog_id, exhibition_id, catalogue_number)
  values ('AR-9801', v_expo, 's/n');

  raise notice 'OK: el número de catálogo se guarda y se filtra como dato aislado (RF-513)';
end $$;

-- ── 16. An artwork participates once in each show ────────────
do $$
declare v_expo uuid;
begin
  select id into v_expo from public.exhibitions where title = 'Colectiva con catálogo';

  begin
    insert into public.artwork_exhibitions (catalog_id, exhibition_id, catalogue_number)
    values ('AR-9800', v_expo, '13');
    raise exception 'FAIL: la misma obra ha participado dos veces en la misma exposición';
  exception when unique_violation then
    raise notice 'OK: la pareja obra + exposición es única';
  end;

  begin
    insert into public.artwork_exhibitions (catalog_id, exhibition_id)
    values ('AR-0000', v_expo);
    raise exception 'FAIL: ha participado una obra que no existe';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una obra inexistente';
  end;

  begin
    insert into public.artwork_exhibitions (catalog_id, exhibition_id)
    values ('AR-9800', '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: se ha participado en una exposición que no existe';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una exposición inexistente';
  end;

  -- And the same artwork in two different shows is the norm (RF-501).
  insert into public.artwork_exhibitions (catalog_id, exhibition_id)
  values ('AR-9800', (select id from public.exhibitions
                       where title = 'Alberto Rotili. Antológica' and year = 1995));
  raise notice 'OK: la misma obra participa en varias exposiciones (RF-501)';
end $$;

-- ── 17. Adding a participation again RESTORES it ─────────────
--
-- RF-517. With uniqueness also covering the withdrawn participations, a
-- raw `insert` clashes against the index and the interface would turn an «Añadir» into
-- an incomprehensible uniqueness violation. Both halves are checked: that
-- the raw `insert` does clash —which is why the function exists— and
-- that the function restores without erasing what was researched.
do $$
declare
  v_expo uuid; v_id uuid;
  v_fila public.artwork_exhibitions%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  select id into v_expo from public.exhibitions where title = 'Colectiva con catálogo';
  select id into v_id from public.artwork_exhibitions
   where catalog_id = 'AR-9800' and exhibition_id = v_expo;

  update public.artwork_exhibitions set active = false where id = v_id;

  begin
    insert into public.artwork_exhibitions (catalog_id, exhibition_id)
    values ('AR-9800', v_expo);
    raise exception 'FAIL: el insert crudo de una participación retirada no ha chocado';
  exception when unique_violation then
    raise notice 'OK: el insert crudo choca — que es por lo que existe exhibit_artwork';
  end;

  -- And the function recovers it. With no number: the «Añadir» form comes in
  -- blank, and what is not sent cannot erase what somebody researched.
  v_fila := public.exhibit_artwork('AR-9800', v_expo);

  if not v_fila.active then
    raise exception 'FAIL: añadir una participación retirada no la ha restaurado';
  end if;
  if v_fila.id is distinct from v_id then
    raise exception 'FAIL: se ha creado una fila nueva en vez de restaurar la que había';
  end if;
  if v_fila.catalogue_number <> '12 bis' then
    raise exception 'FAIL: restaurar ha borrado el número investigado (%)', v_fila.catalogue_number;
  end if;
  if v_fila.deactivated_at is not null or v_fila.deactivated_by is not null then
    raise exception 'FAIL: la participación restaurada conserva la traza de una baja que ya no existe';
  end if;

  -- And with a new number, what is sent rules.
  v_fila := public.exhibit_artwork('AR-9800', v_expo, '12 bis (bis)');
  if v_fila.catalogue_number <> '12 bis (bis)' then
    raise exception 'FAIL: la función no ha actualizado el número (%)', v_fila.catalogue_number;
  end if;

  -- A pair that did not exist is created, which is the same function's other
  -- path.
  v_fila := public.exhibit_artwork(
    'AR-9801',
    (select id from public.exhibitions where title = 'Alberto Rotili. Antológica' and year = 1996),
    'II.4', 'Reproducida en la portada');
  if v_fila.catalogue_number <> 'II.4' or not v_fila.active then
    raise exception 'FAIL: la función no ha creado la participación nueva';
  end if;

  raise notice 'OK: añadir una participación retirada la restaura con su número (RF-517)';
end $$;

-- ── 18. Un lector no expone ──────────────────────────────────
do $$
declare v_expo uuid; v_fila public.artwork_exhibitions%rowtype;
begin
  select id into v_expo from public.exhibitions where title = 'Muestra de un día';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

  v_fila := public.exhibit_artwork('AR-9800', v_expo);
  raise exception 'FAIL: un lector ha podido añadir una obra a una exposición';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no expone: %', sqlerrm;
end $$;

-- ── 19. «Sin revisar» is not «no», through both doors ────────
--
-- RF-218, and this is the case that gives the rule its name: an artwork with no
-- registered participations is not an artwork that was not exhibited. The column is only
-- worth something if it cannot lie, and for that both doors are needed.
do $$
declare v_expo uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  if (select exhibition_history_status from public.artworks where catalog_id = 'AR-9800')
     <> 'UNREVIEWED' then
    raise exception 'FAIL: el historial expositivo no nace «Sin revisar» (RF-205)';
  end if;

  -- What IS allowed, and it is intentional: participations with the state on
  -- «Sin revisar». Having a datum is not having done the research.
  if not exists (select 1 from public.artwork_exhibitions
                  where catalog_id = 'AR-9800' and active) then
    raise exception 'FAIL: el fixture de este bloque no tiene la participación que necesita';
  end if;

  begin
    update public.artworks set exhibition_history_status = 'NONE_FOUND'
     where catalog_id = 'AR-9800';
    raise exception 'FAIL: se ha declarado el historial investigado sin resultado con participaciones debajo';
  exception when raise_exception then
    raise notice 'OK: primera puerta — la columna no puede contradecir a las participaciones: %', sqlerrm;
  end;

  -- With the participations withdrawn, it can be declared.
  update public.artwork_exhibitions set active = false where catalog_id = 'AR-9800';
  update public.artworks set exhibition_history_status = 'NONE_FOUND' where catalog_id = 'AR-9800';

  -- And then the second door closes from the other side.
  select id into v_expo from public.exhibitions where title = 'Muestra de un día';
  begin
    insert into public.artwork_exhibitions (catalog_id, exhibition_id)
    values ('AR-9800', v_expo);
    raise exception 'FAIL: se ha expuesto una obra cuyo historial consta investigado sin resultado';
  exception when raise_exception then
    raise notice 'OK: segunda puerta — no se expone una obra declarada sin historial: %', sqlerrm;
  end;

  -- Restoring a withdrawn participation is the same door, and it is the path
  -- the interface will really use.
  begin
    update public.artwork_exhibitions set active = true
     where catalog_id = 'AR-9800'
       and exhibition_id = (select id from public.exhibitions where title = 'Colectiva con catálogo');
    raise exception 'FAIL: se ha restaurado una participación en una obra declarada sin historial';
  exception when raise_exception then
    raise notice 'OK: restaurar una participación pasa por la misma puerta';
  end;

  -- And any edit of the artwork is not blocked by a state that does not
  -- change: the check only does work when the state moves.
  update public.artworks set exhibition_history_status = 'IN_PROGRESS' where catalog_id = 'AR-9800';
  update public.artwork_exhibitions set active = true where catalog_id = 'AR-9800';
  raise notice 'OK: con el estado corregido, las participaciones vuelven';
end $$;

-- ── 20. And the two previous doors still stand ───────────────
--
-- This group REPLACES `tg_artwork_research_status_coherent` for the third time, and
-- a replacement can swallow the previous blocks with nothing warning: the
-- provenance's and the bibliography's tests pass all the same, because they check the
-- function that is there and not the one that was.
do $$
declare v_ref uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9801', 'Colección privada, España');

  begin
    update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9801';
    raise exception 'FAIL: el reemplazo se ha comido la puerta de la procedencia';
  exception when raise_exception then
    if position('procedencia' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la puerta de la procedencia sigue en pie tras el tercer reemplazo (RF-218)';
  end;

  select id into v_ref from public.bibliography
   where title = 'Rotili. Catálogo de prueba de la colectiva';
  insert into public.artwork_bibliography (catalog_id, bibliography_id, pages)
  values ('AR-9801', v_ref, '17');

  begin
    update public.artworks set bibliography_status = 'NONE_FOUND' where catalog_id = 'AR-9801';
    raise exception 'FAIL: el reemplazo se ha comido la puerta de la bibliografía';
  exception when raise_exception then
    if position('bibliografía' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la puerta de la bibliografía sigue en pie tras el tercer reemplazo (RF-218)';
  end;

  -- And the three blocks are independent: each one looks at ITS rows. With the
  -- link withdrawn, the provenance is declared even if the artwork still has a citation and
  -- a participation.
  update public.provenance_events set active = false where catalog_id = 'AR-9801';
  update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9801';

  if not exists (select 1 from public.artwork_bibliography
                  where catalog_id = 'AR-9801' and active)
     or not exists (select 1 from public.artwork_exhibitions
                     where catalog_id = 'AR-9801' and active) then
    raise exception 'FAIL: el aserto anterior no demuestra nada: a la obra le falta cita o participación';
  end if;
  raise notice 'OK: los tres bloques documentales se declaran por separado (RF-218)';
end $$;

-- ── 21. The research state is a closed enum ──────────────────
do $$
begin
  update public.artworks set exhibition_history_status = 'PENDIENTE' where catalog_id = 'AR-9801';
  raise exception 'FAIL: el estado del historial expositivo ha admitido texto libre';
exception when invalid_text_representation then
  raise notice 'OK: el estado del historial expositivo no admite texto libre';
end $$;

-- ── 22. Each one's wastebasket ───────────────────────────────
--
-- The exhibition is a record with a name of its own and one of those RF-901 enumerates:
-- it carries a complete wastebasket and restoring does NOT erase the trace of the previous withdrawal
-- (RF-902). The venue and the participation hang from another record and have no
-- wastebasket screen of their own, so restoring them leaves them as if they had never
-- been withdrawn — and that is why it is checked, so the difference is
-- deliberate and not an oversight.
do $$
declare
  v_expo uuid; v_sede uuid; v_part uuid;
  v_baja timestamptz; v_quien uuid; v_restaurada timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  select id into v_expo from public.exhibitions where title = 'Muestra de un día';

  update public.exhibitions set active = false where id = v_expo;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.exhibitions where id = v_expo;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la baja de la exposición no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.exhibitions where id = v_expo) then
    raise exception 'FAIL: la exposición ha desaparecido al retirarla (RF-901)';
  end if;

  update public.exhibitions set active = true where id = v_expo;
  select deactivated_at, restored_at into v_baja, v_restaurada
    from public.exhibitions where id = v_expo;
  if v_restaurada is null or v_baja is null then
    raise exception 'FAIL: restaurar la exposición no ha dejado traza, o ha borrado la de la baja (RF-902)';
  end if;

  select id into v_sede from public.exhibition_venues where name = 'Casa de Cultura' and locality = 'Olivenza';
  update public.exhibition_venues set active = false where id = v_sede;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.exhibition_venues where id = v_sede;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la baja de la sede no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  update public.exhibition_venues set active = true where id = v_sede;
  if (select deactivated_at from public.exhibition_venues where id = v_sede) is not null then
    raise exception 'FAIL: la sede restaurada arrastra la traza de una baja que ya no existe';
  end if;

  select id into v_part from public.artwork_exhibitions
   where catalog_id = 'AR-9801'
     and exhibition_id = (select id from public.exhibitions where title = 'Colectiva con catálogo');

  update public.artwork_exhibitions set active = false where id = v_part;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.artwork_exhibitions where id = v_part;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la baja de la participación no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.artwork_exhibitions where id = v_part) then
    raise exception 'FAIL: la participación ha desaparecido al retirarla (RF-517 revisa RF-903)';
  end if;

  update public.artwork_exhibitions set active = true where id = v_part;
  if (select deactivated_at from public.artwork_exhibitions where id = v_part) is not null then
    raise exception 'FAIL: la participación restaurada arrastra la traza de una baja que ya no existe';
  end if;
  raise notice 'OK: la exposición guarda las dos trazas; la sede y la participación vuelven limpias';
end $$;

-- ── 23. The authorship is stamped by the base ────────────────
-- RF-803 and RF-804 with the generic function: who and when come from the session, not
-- from what the client sends. It is checked by sending a false date and seeing that
-- the trigger overrides it; comparing two instants would not do, because inside a
-- transaction `now()` does not advance.
do $$
declare
  v_id uuid; v_creado uuid; v_actualizado uuid; v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  insert into public.exhibitions (title, year, created_by, updated_by)
  values ('Exposición con autoría mentida', 2001,
          '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2')
  returning id, created_by into v_id, v_creado;

  if v_creado is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (%)', v_creado;
  end if;

  update public.exhibitions
     set note = 'Comisariada por la Diputación',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000b2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado
    from public.exhibitions where id = v_id;
  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado;
  end if;

  -- And in the venue, which has no update columns: the generic function
  -- touches only the columns the row has, and a table with none of them works
  -- just the same (RF-804).
  insert into public.exhibition_venues (name, locality, created_by)
  values ('Ateneo de Prueba', 'Cáceres', '00000000-0000-0000-0000-0000000000b2');
  if (select created_by from public.exhibition_venues where name = 'Ateneo de Prueba')
     is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la autoría de la sede no la ha sellado la sesión';
  end if;

  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 23 bis. El cartel de una exposición (RF-518) ─────────────
--
-- Lo primero es el perímetro, como siempre: el cartel es una imagen del bucket
-- privado, y quien decide si se puede colgar una en una exposición es la política de
-- `exhibitions` y nada más. Un Lector que pudiera escribir aquí podría cambiar el
-- cartel de una exposición ajena sin dejar rastro en ninguna otra tabla.
do $$
declare v_expo uuid;
begin
  select id into v_expo from public.exhibitions where title = 'Muestra de un día';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;

  update public.exhibitions
     set poster_thumbnail_path = 'carteles/robado_min.webp',
         poster_derivative_path = 'carteles/robado_der.webp',
         poster_uploaded_at = now()
   where id = v_expo;

  if exists (select 1 from public.exhibitions
              where id = v_expo and poster_thumbnail_path is not null) then
    raise exception 'FAIL: un lector ha colgado un cartel en una exposición';
  end if;
  raise notice 'OK: un lector no cuelga carteles';
end $$;

reset role;

do $$
declare v_expo uuid; v_thumb text;
begin
  select id into v_expo from public.exhibitions where title = 'Muestra de un día';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;

  -- Quien cataloga sí, y las tres columnas van juntas o no van: media escritura
  -- dejaría una miniatura que se ve en el listado y no se puede abrir.
  update public.exhibitions
     set poster_thumbnail_path = 'carteles/cartel_min.webp',
         poster_derivative_path = 'carteles/cartel_der.webp',
         poster_uploaded_at = now()
   where id = v_expo;

  select poster_thumbnail_path into v_thumb from public.exhibitions where id = v_expo;
  if v_thumb <> 'carteles/cartel_min.webp' then
    raise exception 'FAIL: el cartel no se ha guardado: %', v_thumb;
  end if;

  begin
    update public.exhibitions set poster_derivative_path = null where id = v_expo;
    raise exception 'FAIL: se admitió un cartel a medias';
  exception
    when check_violation then null;
  end;

  -- Y quitarlo es poner las tres a nulo. El fichero se queda en el bucket, como
  -- todo lo que este catálogo sube: aquí nunca se borra nada de verdad (RF-901).
  update public.exhibitions
     set poster_thumbnail_path = null,
         poster_derivative_path = null,
         poster_uploaded_at = null
   where id = v_expo;
  if exists (select 1 from public.exhibitions
              where id = v_expo and poster_uploaded_at is not null) then
    raise exception 'FAIL: no se ha podido quitar el cartel';
  end if;

  raise notice 'OK: quien cataloga cuelga y quita el cartel, y nunca a medias';
end $$;

reset role;


-- ── 24. Nobody really deletes, and all three are born closed ─
-- RF-901, RF-111, RF-113. The policies are written by the next migration; with
-- RLS enabled and no policy, the table is closed, which is the safe state
-- to wait in. What can never happen is the opposite: privileges
-- granted with no RLS.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['exhibition_venues', 'exhibitions', 'artwork_exhibitions']
  loop
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = v_tabla
                  and cmd in ('DELETE', 'ALL')) then
      raise exception 'FAIL: hay una política que permite DELETE sobre %', v_tabla;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_tabla, 'delete')
       or has_table_privilege('anon', 'public.' || v_tabla, 'delete') then
      raise exception 'FAIL: alguien tiene privilegio de DELETE sobre %', v_tabla;
    end if;
    if not (select relrowsecurity from pg_class
             where oid = ('public.' || v_tabla)::regclass) then
      raise exception 'FAIL: la tabla % no tiene RLS activado', v_tabla;
    end if;
  end loop;
  raise notice 'OK: RLS activado en las tres, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.exhibition_venues limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las sedes';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las sedes';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.exhibitions limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las exposiciones';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las exposiciones';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.artwork_exhibitions limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las participaciones';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las participaciones';
end $$;

reset role;

rollback;
