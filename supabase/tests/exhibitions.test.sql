-- RF-512: las sedes de exposición son maestra propia con clave sustituta,
--         distinta del árbol de lugares, y una sede en uso no se retira.
-- RF-501: la participación de una obra en una muestra es una fila de la puente,
--         única por pareja, con su número de catálogo y su nota.
-- RF-502: el historial expositivo se ordena de forma ascendente aunque la fecha
--         exacta no se conozca, y el año no puede contradecir a la fecha.
-- RF-503: el catálogo de una exposición no tiene tabla propia: enlaza con la
--         bibliografía, y el enlace es navegable en los dos sentidos.
-- RF-513: el número de catálogo de la muestra es columna aparte de la nota.
-- RF-517, RF-903: una participación se retira, no se borra, y volver a añadirla
--         la restaura en vez de chocar contra la unicidad.
-- RF-218: «Sin revisar» no es «no», llevado del campo al bloque documental. Es
--         el caso que da nombre a la regla: una obra sin participaciones
--         registradas no es una obra que no se expuso.
-- RF-205: lo pendiente nace pendiente.
-- RF-901, RF-902: nada se borra, y la baja deja traza.
-- RF-909: los duplicados se resuelven por revisión, no por unicidad del título.
-- RF-111, RF-113: las tres tablas nacen cerradas y nadie tiene DELETE.
--
-- Lo que se comprueba es lo que el cliente no debe volver a comprobar: que una
-- exposición sin fecha ninguna no entra, que el año se deduce de la fecha y
-- nunca la contradice, que media fecha no existe, que una sede se distingue por
-- nombre Y localidad porque hay una «Casa de Cultura» en cada pueblo, que una
-- ficha de catálogo no puede colgar de una muestra que consta sin catálogo, que
-- volver a añadir una participación retirada la recupera con su número, y que
-- la columna de estado de investigación no puede mentir por ninguna de sus dos
-- puertas — ni la nueva, ni las dos que este grupo REEMPLAZA y podría haberse
-- comido sin que nada avisara.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- Un catalogador, un lector y dos obras. Los perfiles los crea el trigger de
-- auth.users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'cat-expo@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'lec-expo@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9800', 'ROTILI', 'La muy expuesta', 'UNCONFIRMED'),
  ('AR-9801', 'ROTILI', 'La que no salió del estudio', 'UNCONFIRMED');

-- ── 1. Una sede mínima entra, y lo pendiente queda vacío ─────
-- El nombre y nada más: lo que se sabe al anotar una muestra de un recorte de
-- prensa. La institución detrás es opcional a propósito — una casa de cultura
-- es una sede real sin ficha de institución, y obligar a crearla llenaría
-- `parties` de fichas sin contacto ni procedencia.
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

-- ── 2. Una sede se distingue por nombre Y localidad ──────────
-- Hay una «Casa de Cultura» en cada pueblo y una «Sala de Exposiciones» en cada
-- capital: con la unicidad por el nombre a secas, la segunda sería un error
-- incomprensible. Y comparadas con la clave de comparación de nombres del
-- esquema, porque dos sedes que solo difieren en una tilde son la misma sede.
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

-- ── 3. Una exposición mínima entra ───────────────────────────
-- El título y el año: lo que consta en la primera línea de un recorte. Todo lo
-- demás nace pendiente y explícito (RF-205).
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

-- ── 4. Sin título no se cita; sin fecha no se ordena ─────────
-- Una exposición sin fecha ninguna no se puede colocar en un historial
-- cronológico, y colocarla al final «porque no se sabe» sería inventar el dato.
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

-- ── 5. El año se deduce de la fecha, nunca al revés ──────────
-- Escribir las fechas exactas y además el año sería pedir dos veces el mismo
-- dato y garantizar que un día no coincidan.
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

  -- Y al revés no: de un año suelto no se inventa un 1 de enero.
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

  -- Y corregir la fecha olvidando el año es el mismo error por la otra puerta.
  begin
    update public.exhibitions set start_date = date '1986-03-14'
     where title = 'Rotili en la Casa de Cultura';
    raise exception 'FAIL: mover la fecha ha dejado el año contradiciéndola';
  exception when check_violation then
    raise notice 'OK: mover la fecha sin mover el año se rechaza';
  end;
end $$;

-- ── 6. Media fecha no existe ─────────────────────────────────
-- Un cierre anterior a la apertura es una errata; un cierre SIN apertura es
-- media fecha, y un `end_date >= start_date` a secas la habría dejado pasar
-- porque una comparación con nulo no es falsa.
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

  -- Y una muestra de un solo día es legítima: abre y cierra el mismo día.
  insert into public.exhibitions (title, start_date, end_date)
  values ('Muestra de un día', date '1990-05-18', date '1990-05-18');
  raise notice 'OK: una muestra que abre y cierra el mismo día entra';
end $$;

-- ── 7. Los dos enumerados son cerrados ───────────────────────
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

  -- Y los tres valores del tri-estado entran, incluido el que da nombre a la
  -- regla: «Sin revisar» no es «No».
  insert into public.exhibitions (title, year, exhibition_type, catalogue_published)
  values ('Colectiva con catálogo', 1988, 'COLLECTIVE', 'YES');
  insert into public.exhibitions (title, year, exhibition_type, catalogue_published)
  values ('Individual sin catálogo comprobado', 1992, 'INDIVIDUAL', 'NO');
  raise notice 'OK: individual, colectiva y los tres estados del catálogo entran';
end $$;

-- ── 8. La sede, y lo que sostiene ────────────────────────────
-- La clave ajena garantiza que la sede existe; el trigger de baja garantiza que
-- no se retira una que todavía acoge exposiciones activas. Sin él, retirarla no
-- la retira: deja el historial apuntando a algo que la interfaz ya no ofrece.
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

  -- Una exposición en la papelera no cuenta, como en las demás maestras: exigir
  -- vaciar la papelera antes de retirar una sede sería hacer que la papelera
  -- estorbe.
  update public.exhibitions set active = false where title = 'Colectiva con catálogo';
  update public.exhibition_venues set active = false where id = v_sede;
  raise notice 'OK: una exposición retirada no impide retirar su sede (RF-905)';

  -- Y se deja todo como estaba para lo que viene después.
  update public.exhibition_venues set active = true where id = v_sede;
  update public.exhibitions set active = true where title = 'Colectiva con catálogo';

  begin
    delete from public.exhibition_venues where id = v_sede;
    raise exception 'FAIL: se ha borrado una sede en uso';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena impide borrar una sede en uso';
  end;
end $$;

-- ── 9. La sede NO es el árbol de lugares ─────────────────────
-- Decidido de forma explícita, y por eso se comprueba: son dos tablas. El árbol
-- contesta «dónde está la obra hoy» y sus nodos contienen otros nodos; la sede
-- contesta «dónde ocurrió una muestra en 1985», es histórica y no contiene
-- nada. Fundirlas metería «Balda 2» en el selector de sedes.
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

-- ── 10. La institución detrás de la sede ─────────────────────
-- Para no duplicar el contacto del museo. Y una parte que está detrás de una
-- sede activa no se retira, con la misma regla que sostiene la procedencia: la
-- sede se quedaría con el contacto colgando de una ficha que la interfaz ya no
-- ofrece.
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

  -- Retirada la sede, la institución se puede retirar.
  update public.exhibitions set venue_id = null where venue_id = v_sede;
  update public.exhibition_venues set active = false where id = v_sede;
  update public.parties set active = false where id = v_parte;
  raise notice 'OK: retirada la sede, su institución se puede retirar';

  -- Y se deja todo como estaba.
  update public.parties set active = true where id = v_parte;
  update public.exhibition_venues set active = true where id = v_sede;
end $$;

-- ── 11. Y las dos puertas anteriores de esa misma función ────
--
-- `tg_party_deactivation` la escribió la migración de la procedencia y este
-- grupo la REEMPLAZA con `create or replace` para añadirle la sede. Un reemplazo
-- puede comerse un bloque anterior sin que nada avise: el test de la procedencia
-- pasa igual, porque comprueba la función que hay y no la que había. Esta es la
-- regresión que hay que cazar aquí.
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

-- ── 12. El catálogo de la muestra vive en la bibliografía ────
-- RF-503: no tiene tabla propia. Y la ficha no puede colgar de una muestra que
-- consta sin catálogo — al revés sí: un catálogo puede constar publicado y no
-- estar todavía dado de alta, que es el estado normal mientras se investiga.
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

  -- Navegable en los dos sentidos, que es lo que pide el plan de pruebas: de la
  -- muestra a su catálogo y del catálogo a la muestra que lo generó.
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

-- ── 13. Dos exposiciones se pueden llamar igual (RF-909) ─────
-- Una itinerante en Badajoz y en Cáceres son dos muestras y se titulan igual. La
-- unicidad del título habría convertido un dato real en un error.
do $$
begin
  insert into public.exhibitions (title, year) values ('Alberto Rotili. Antológica', 1995);
  insert into public.exhibitions (title, year) values ('Alberto Rotili. Antológica', 1996);
  raise notice 'OK: dos exposiciones distintas pueden llamarse igual (RF-909)';
end $$;

-- ── 14. El historial expositivo se ordena ascendente ─────────
-- RF-502. Lo que se comprueba es que el orden funciona SIN depender de que la
-- fecha exacta se conozca: cuando no hay fecha, ordena el año.
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

-- ── 15. La participación: número y nota, dos columnas ────────
-- RF-513. Deshace la fusión de v11 v7 con el criterio que el propio v11 escribió
-- en v9: «cat. 12 bis» es un dato citable de forma exacta y se busca. Lo que
-- este test demuestra es que se consulta SIN analizar texto libre.
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

  -- Y se filtra por él sin buscar dentro de una nota, que es lo que v7 dejó
  -- escrito que se perdía al fundirlos.
  if not exists (select 1 from public.artwork_exhibitions
                  where catalogue_number = '12 bis' and active) then
    raise exception 'FAIL: no se puede filtrar por número de catálogo de exposición (RF-513)';
  end if;

  -- «s/n» y «II.4» son números de catálogo reales: por eso la columna es texto.
  insert into public.artwork_exhibitions (catalog_id, exhibition_id, catalogue_number)
  values ('AR-9801', v_expo, 's/n');

  raise notice 'OK: el número de catálogo se guarda y se filtra como dato aislado (RF-513)';
end $$;

-- ── 16. Una obra participa una vez en cada muestra ───────────
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

  -- Y la misma obra en dos muestras distintas es lo normal (RF-501).
  insert into public.artwork_exhibitions (catalog_id, exhibition_id)
  values ('AR-9800', (select id from public.exhibitions
                       where title = 'Alberto Rotili. Antológica' and year = 1995));
  raise notice 'OK: la misma obra participa en varias exposiciones (RF-501)';
end $$;

-- ── 17. Volver a añadir una participación la RESTAURA ────────
--
-- RF-517. Con la unicidad cubriendo también las participaciones retiradas, un
-- `insert` crudo choca contra el índice y la interfaz convertiría un «Añadir» en
-- una violación de unicidad incomprensible. Se comprueban las dos mitades: que
-- el `insert` crudo efectivamente choca —que es por lo que la función existe— y
-- que la función restaura sin borrar lo investigado.
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

  -- Y la función la recupera. Sin número: el formulario de «Añadir» viene en
  -- blanco, y lo que no se manda no puede borrar lo que alguien investigó.
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

  -- Y con número nuevo, manda lo que se manda.
  v_fila := public.exhibit_artwork('AR-9800', v_expo, '12 bis (bis)');
  if v_fila.catalogue_number <> '12 bis (bis)' then
    raise exception 'FAIL: la función no ha actualizado el número (%)', v_fila.catalogue_number;
  end if;

  -- Una pareja que no existía se crea, que es el otro camino de la misma
  -- función.
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

-- ── 19. «Sin revisar» no es «no», por las dos puertas ────────
--
-- RF-218, y este es el caso que da nombre a la regla: una obra sin
-- participaciones registradas no es una obra que no se expuso. La columna solo
-- vale si no puede mentir, y para eso hacen falta las dos puertas.
do $$
declare v_expo uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  if (select exhibition_history_status from public.artworks where catalog_id = 'AR-9800')
     <> 'UNREVIEWED' then
    raise exception 'FAIL: el historial expositivo no nace «Sin revisar» (RF-205)';
  end if;

  -- Lo que SÍ se permite, y es intencionado: participaciones con el estado en
  -- «Sin revisar». Tener un dato no es haber hecho la investigación.
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

  -- Retiradas las participaciones, sí se puede declarar.
  update public.artwork_exhibitions set active = false where catalog_id = 'AR-9800';
  update public.artworks set exhibition_history_status = 'NONE_FOUND' where catalog_id = 'AR-9800';

  -- Y entonces la segunda puerta cierra por el otro lado.
  select id into v_expo from public.exhibitions where title = 'Muestra de un día';
  begin
    insert into public.artwork_exhibitions (catalog_id, exhibition_id)
    values ('AR-9800', v_expo);
    raise exception 'FAIL: se ha expuesto una obra cuyo historial consta investigado sin resultado';
  exception when raise_exception then
    raise notice 'OK: segunda puerta — no se expone una obra declarada sin historial: %', sqlerrm;
  end;

  -- Restaurar una participación retirada es la misma puerta, y es el camino que
  -- la interfaz usará de verdad.
  begin
    update public.artwork_exhibitions set active = true
     where catalog_id = 'AR-9800'
       and exhibition_id = (select id from public.exhibitions where title = 'Colectiva con catálogo');
    raise exception 'FAIL: se ha restaurado una participación en una obra declarada sin historial';
  exception when raise_exception then
    raise notice 'OK: restaurar una participación pasa por la misma puerta';
  end;

  -- Y una edición cualquiera de la obra no se bloquea por un estado que no
  -- cambia: la comprobación solo hace trabajo cuando el estado se mueve.
  update public.artworks set exhibition_history_status = 'IN_PROGRESS' where catalog_id = 'AR-9800';
  update public.artwork_exhibitions set active = true where catalog_id = 'AR-9800';
  raise notice 'OK: con el estado corregido, las participaciones vuelven';
end $$;

-- ── 20. Y las dos puertas anteriores siguen en pie ───────────
--
-- Este grupo REEMPLAZA `tg_artwork_research_status_coherent` por tercera vez, y
-- un reemplazo puede comerse los bloques anteriores sin que nada avise: los
-- tests de la procedencia y de la bibliografía pasan igual, porque comprueban la
-- función que hay y no la que había.
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

  -- Y los tres bloques son independientes: cada uno mira SUS filas. Retirado el
  -- eslabón, la procedencia se declara aunque la obra siga teniendo cita y
  -- participación.
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

-- ── 21. El estado de investigación es un enumerado cerrado ───
do $$
begin
  update public.artworks set exhibition_history_status = 'PENDIENTE' where catalog_id = 'AR-9801';
  raise exception 'FAIL: el estado del historial expositivo ha admitido texto libre';
exception when invalid_text_representation then
  raise notice 'OK: el estado del historial expositivo no admite texto libre';
end $$;

-- ── 22. La papelera de cada una ──────────────────────────────
--
-- La exposición es una ficha con nombre propio y de las que RF-901 enumera:
-- lleva papelera completa y restaurar NO borra la traza de la baja anterior
-- (RF-902). La sede y la participación cuelgan de otra ficha y no tienen
-- pantalla de papelera propia, así que restaurarlas las deja como si nunca se
-- hubieran retirado — y por eso se comprueba, para que la diferencia sea
-- deliberada y no un olvido.
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

-- ── 23. La autoría la sella la base ──────────────────────────
-- RF-803 y RF-804 con la función genérica: quién y cuándo salen de la sesión, no
-- de lo que mande el cliente. Se comprueba mandando una fecha falsa y viendo que
-- el trigger la pisa; comparar dos instantes no valdría, porque dentro de una
-- transacción `now()` no avanza.
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

  -- Y en la sede, que no tiene columnas de actualización: la función genérica
  -- toca solo las columnas que la fila tenga, y una tabla sin ellas funciona
  -- igual (RF-804).
  insert into public.exhibition_venues (name, locality, created_by)
  values ('Ateneo de Prueba', 'Cáceres', '00000000-0000-0000-0000-0000000000b2');
  if (select created_by from public.exhibition_venues where name = 'Ateneo de Prueba')
     is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la autoría de la sede no la ha sellado la sesión';
  end if;

  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 24. Nadie borra de verdad, y las tres nacen cerradas ─────
-- RF-901, RF-111, RF-113. Las políticas las escribe la migración siguiente; con
-- RLS activado y sin política, la tabla está cerrada, que es el estado seguro
-- para esperar. Lo que no puede pasar nunca es lo contrario: privilegios
-- concedidos sin RLS.
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
