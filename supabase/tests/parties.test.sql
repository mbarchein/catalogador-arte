-- RF-508: people and institutions, a single table with a surrogate key.
-- RF-804, RF-801, RF-902: the common traceability and the wastebasket, stamped by the base.
-- RF-901, RF-111, RF-113: nothing is deleted, and the table is born closed.
--
-- What is checked is what the client must not check again: that a
-- blank name or one with spaces around it does not go in, that two writings of the
-- same museum are the same record, that the two enums admit no free text,
-- that the withdrawal stamps itself and keeps its trace on restoring, and that the traceability
-- function does not touch a single column that is not its own — which is the risk
-- particular to reading the row as jsonb and returning it.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one cataloguer and one reader. The profiles are created by the
-- auth.users trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat-partes@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'lec-partes@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000c2';

-- ── 1. A minimal record goes in ──────────────────────────────
-- The name and the type, and nothing else: what is known the first time a
-- name appears in a 1985 catalogue. Everything else is born empty and explicit.
do $$
declare
  v_id uuid;
  v_fila public.parties%rowtype;
begin
  insert into public.parties (party_type, name)
  values ('INSTITUTION', 'Museo de Bellas Artes de Badajoz')
  returning id into v_id;

  select * into v_fila from public.parties where id = v_id;

  if v_fila.locality <> '' or v_fila.country <> '' or v_fila.contact <> ''
     or v_fila.note <> '' then
    raise exception 'FAIL: los campos opcionales no nacen vacíos';
  end if;
  if v_fila.contact_status <> 'NOT_CONTACTED' then
    raise exception 'FAIL: el estado de contacto no nace en «Sin contactar» (%)',
      v_fila.contact_status;
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una ficha nueva no nace activa';
  end if;
  raise notice 'OK: una ficha mínima entra y sus opcionales nacen vacíos';
end $$;

-- ── 2. El tipo es obligatorio y cerrado ──────────────────────
-- Sin «Sin revisar» a propósito (RF-508, con el argumento de RF-203): de este
-- valor depende cómo se redacta la línea de procedencia.
do $$
begin
  begin
    insert into public.parties (name) values ('Sin tipo');
    raise exception 'FAIL: ha entrado una parte sin tipo';
  exception when not_null_violation then
    raise notice 'OK: el tipo de parte es obligatorio';
  end;

  begin
    insert into public.parties (party_type, name) values ('UNREVIEWED', 'Pendiente de decidir');
    raise exception 'FAIL: el tipo de parte ha admitido «Sin revisar»';
  exception when invalid_text_representation then
    raise notice 'OK: el tipo de parte no ofrece «Sin revisar»';
  end;

  begin
    insert into public.parties (party_type, name) values ('GALERIA', 'Galería inventada');
    raise exception 'FAIL: el tipo de parte ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el tipo de parte es un enumerado cerrado';
  end;

  -- Y los dos valores que sí existen entran.
  insert into public.parties (party_type, name) values ('PERSON', 'Almudena Hormeño');
  raise notice 'OK: persona e institución son los dos valores del enumerado';
end $$;

-- ── 3. El estado de contacto tampoco admite texto libre ──────
do $$
declare v_id uuid;
begin
  select id into v_id from public.parties where name = 'Almudena Hormeño';

  update public.parties set contact_status = 'VISITED' where id = v_id;
  if (select contact_status from public.parties where id = v_id) <> 'VISITED' then
    raise exception 'FAIL: el estado de contacto no se ha guardado';
  end if;

  begin
    update public.parties set contact_status = 'ESCRIBIENDO' where id = v_id;
    raise exception 'FAIL: el estado de contacto ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de contacto es un enumerado cerrado';
  end;
end $$;

-- ── 4. Un nombre en blanco no identifica a nadie ─────────────
-- Y uno con espacios alrededor rompería la comparación de duplicados sin que se
-- vea en pantalla, que es la peor clase de dato malo.
do $$
begin
  begin
    insert into public.parties (party_type, name) values ('PERSON', '   ');
    raise exception 'FAIL: ha entrado una parte sin nombre';
  exception when check_violation then
    raise notice 'OK: un nombre en blanco se rechaza';
  end;

  begin
    insert into public.parties (party_type, name) values ('PERSON', ' Colección Pérez ');
    raise exception 'FAIL: ha entrado un nombre con espacios alrededor';
  exception when check_violation then
    raise notice 'OK: un nombre sin recortar se rechaza';
  end;
end $$;

-- ── 5. Un nombre, una ficha ──────────────────────────────────
-- El motivo es la procedencia: dos filas del mismo museo escritas con y sin
-- tilde parten la cadena de una obra, y eso no se ve al escribirlo.
do $$
begin
  begin
    insert into public.parties (party_type, name)
    values ('INSTITUTION', 'museo de BELLAS artes de badajoz');
    raise exception 'FAIL: han entrado dos fichas del mismo museo';
  exception when unique_violation then
    raise notice 'OK: dos escrituras del mismo nombre son la misma ficha';
  end;

  -- Pero la ñ es una letra y no un acento: son dos apellidos distintos y las dos
  -- fichas entran. Es la misma regla de `place_key`, y aquí se comprueba que la
  -- reutilización no la ha cambiado.
  insert into public.parties (party_type, name) values ('PERSON', 'Muñoz');
  insert into public.parties (party_type, name) values ('PERSON', 'Munoz');
  raise notice 'OK: la ñ distingue dos nombres, como en el árbol de lugares';
end $$;

-- ── 6. La traza de autoría la sella la base ──────────────────
-- RF-804 y RF-803: quién y cuándo salen de la sesión, no de lo que mande el
-- cliente.
--
-- La fecha se comprueba mandando una falsa y viendo que el trigger la pisa, y no
-- comparando dos instantes: dentro de una transacción `now()` no avanza, así que
-- «después es mayor que antes» sería un aserto que no puede fallar nunca.
do $$
declare
  v_id uuid;
  v_creado_por uuid; v_actualizado_por uuid;
  v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  insert into public.parties (party_type, name, created_by, updated_by)
  -- Se mandan a propósito los dos campos de autoría rellenos con otro usuario:
  -- el trigger tiene que pisarlos.
  values ('INSTITUTION', 'MACVA', '00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-0000000000c2')
  returning id, created_by, updated_by
       into v_id, v_creado_por, v_actualizado_por;

  if v_creado_por is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid
     or v_actualizado_por is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (% / %)',
      v_creado_por, v_actualizado_por;
  end if;

  update public.parties
     set note = 'Depósito de 2011',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000c2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado_por
    from public.parties where id = v_id;

  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado_por is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado_por;
  end if;
  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 7. La papelera: baja, traza y restauración ───────────────
-- RF-901 y RF-902: la fila sigue ahí, la baja se sella sola, y restaurar NO borra
-- la traza de la baja anterior — se guarda el último evento de cada clase.
do $$
declare
  v_id uuid;
  v_baja timestamptz; v_quien uuid;
  v_restaurada timestamptz; v_quien_restaura uuid;
begin
  select id into v_id from public.parties where name = 'MACVA';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  update public.parties set active = false where id = v_id;

  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.parties where id = v_id;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la baja no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.parties where id = v_id) then
    raise exception 'FAIL: la fila ha desaparecido al darla de baja';
  end if;

  update public.parties set active = true where id = v_id;
  select deactivated_at, restored_at, restored_by
    into v_baja, v_restaurada, v_quien_restaura
    from public.parties where id = v_id;

  if v_restaurada is null
     or v_quien_restaura is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la restauración no ha quedado sellada (% / %)',
      v_restaurada, v_quien_restaura;
  end if;
  if v_baja is null then
    raise exception 'FAIL: restaurar ha borrado la traza de la baja anterior (RF-902)';
  end if;
  raise notice 'OK: la baja y la restauración se sellan solas y conservan su traza';
end $$;

-- ── 8. La trazabilidad genérica no toca nada que no sea suyo ─
--
-- Es el riesgo propio de `tg_row_audit`, que lee la fila como jsonb y la
-- devuelve: si el parche llevara la fila entera, cualquier columna pasaría por
-- una conversión de ida y vuelta y un día una de ellas volvería distinta. Se
-- comprueba con la fila llena y cambiando un solo campo.
--
-- El nombre del fixture es inventado A PROPÓSITO y no el de una colección real:
-- la unicidad de `parties` es global y el traslado de la procedencia
-- (20260804100000) ya creó las fichas de las colecciones y los museos que
-- estaban escondidos en el árbol de lugares. Un fixture que se llame como un
-- dato de verdad choca contra el índice en cuanto la base lleva el volcado, y
-- deja rojo un test que no verifica nada de eso.
do $$
declare v_id uuid; v_fila public.parties%rowtype;
begin
  insert into public.parties (party_type, name, locality, country, contact,
                              contact_status, note)
  values ('PERSON', 'Colección particular familia Peñalba de prueba', 'Villafranca de los Barros',
          'España', 'almudena@ejemplo.test · 924 00 00 00', 'INFO_RECEIVED',
          'Dato facilitado por la familia, sin documentar [?]')
  returning id into v_id;

  update public.parties set contact_status = 'VERIFIED' where id = v_id;

  select * into v_fila from public.parties where id = v_id;
  if v_fila.name <> 'Colección particular familia Peñalba de prueba'
     or v_fila.locality <> 'Villafranca de los Barros'
     or v_fila.country <> 'España'
     or v_fila.contact <> 'almudena@ejemplo.test · 924 00 00 00'
     or v_fila.note <> 'Dato facilitado por la familia, sin documentar [?]'
     or v_fila.party_type <> 'PERSON' then
    raise exception 'FAIL: el sello de trazabilidad ha alterado otra columna (%)', v_fila;
  end if;
  if v_fila.contact_status <> 'VERIFIED' then
    raise exception 'FAIL: el cambio que se pedía no ha cuajado';
  end if;
  raise notice 'OK: el sello genérico solo escribe sus columnas, y los acentos vuelven intactos';
end $$;

-- ── 9. Nadie borra de verdad ─────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'parties'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL: hay una política que permite DELETE sobre las partes';
  end if;
  if has_table_privilege('authenticated', 'public.parties', 'delete')
     or has_table_privilege('anon', 'public.parties', 'delete') then
    raise exception 'FAIL: alguien tiene privilegio de DELETE sobre las partes';
  end if;
  raise notice 'OK: retirar es un update; borrar no está concedido a nadie (RF-901)';
end $$;

-- ── 10. La tabla nace cerrada ────────────────────────────────
-- RF-111 y RF-113: RLS activado y el rol anónimo sin privilegio ninguno, que es
-- lo que impide que la política sea la única barrera. Es el aserto que importa
-- mientras las políticas no existen, y sigue importando después: `contacto` es
-- dato personal de un tercero.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.parties'::regclass) then
    raise exception 'FAIL: la tabla de partes no tiene RLS activado';
  end if;
  raise notice 'OK: la tabla de partes tiene RLS activado';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.parties limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las partes';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las partes';
end $$;

reset role;

rollback;
