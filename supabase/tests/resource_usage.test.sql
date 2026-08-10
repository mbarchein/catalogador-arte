-- How much the catalogue takes up, and who can ask (RF-1202, RF-106).
--
-- What is pinned down here is what makes a `security definer` function dangerous:
-- that it checks the permission inside. The execution privilege does not distinguish roles
-- —either it is granted or it is not—, so without that check a Reader would read the server's
-- catalogue and the store's rows with the owner's key in place.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'cat-uso@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'lec-uso@test.local');

update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000e2';

-- ── El Catalogador obtiene tres cifras utilizables ───────────

do $$
declare v_row record;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  select * into v_row from public.resource_usage();

  if v_row is null then
    raise exception 'FAIL: resource_usage no ha devuelto ninguna fila';
  end if;

  -- Una base con el esquema entero aplicado no puede ocupar cero. El aserto
  -- distingue «ha medido» de «ha contestado un cero por no poder mirar», que es
  -- exactamente lo que devolvería esta función sin `security definer`.
  if coalesce(v_row.database_bytes, 0) <= 0 then
    raise exception 'FAIL: el tamaño de la base sale %, que no es una medida',
      coalesce(v_row.database_bytes, -1);
  end if;

  -- El almacén puede estar vacío en un stack recién levantado, y eso es un cero
  -- legítimo. Lo que no puede es ser nulo ni negativo: la aplicación divide por
  -- el límite para pintar la barra.
  if v_row.storage_bytes is null or v_row.storage_bytes < 0 then
    raise exception 'FAIL: el almacén ocupa %', coalesce(v_row.storage_bytes::text, '(nulo)');
  end if;
  if v_row.storage_objects is null or v_row.storage_objects < 0 then
    raise exception 'FAIL: el almacén dice tener % ficheros',
      coalesce(v_row.storage_objects::text, '(nulo)');
  end if;

  reset role;
  raise notice 'OK: el Catalogador obtiene el tamaño de la base y del almacén';
end $$;

reset role;

-- ── Un Lector no ─────────────────────────────────────────────

do $$
declare
  v_row record;
  v_leyo boolean := false;
  v_dijo text := '';
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  -- El resultado se guarda en variables y se juzga FUERA del bloque. Juzgarlo
  -- dentro sería atrapar con el mismo `when` el propio FAIL de este test, y un
  -- aserto que se traga su propio fallo no es un aserto.
  begin
    select * into v_row from public.resource_usage();
    v_leyo := true;
  exception
    when insufficient_privilege or raise_exception then
      v_dijo := sqlerrm;
  end;

  reset role;

  if v_leyo then
    raise exception 'FAIL: un Lector ha podido consultar el espacio ocupado';
  end if;
  -- El mensaje lo lee la usuaria tal cual: tiene que decir de qué habla.
  if v_dijo not like '%espacio ocupado%' then
    raise exception 'FAIL: el rechazo al Lector no explica qué se le negó: %', v_dijo;
  end if;

  raise notice 'OK: un Lector no consulta el espacio ocupado, y se le dice por qué';
end $$;

reset role;

-- ── Nadie más tiene la llave ─────────────────────────────────

do $$
begin
  if has_function_privilege('anon', 'public.resource_usage()', 'execute') then
    raise exception 'FAIL: el rol anónimo puede ejecutar resource_usage (RF-101)';
  end if;
  if not has_function_privilege('authenticated', 'public.resource_usage()', 'execute') then
    raise exception 'FAIL: la sesión no puede ejecutar resource_usage y la pantalla no tendría dato';
  end if;
  raise notice 'OK: solo la sesión ejecuta resource_usage, y el anónimo no';
end $$;

-- ── Y es de las que se comprueban por dentro ─────────────────
--
-- `function_privileges.test.sql` ya barre el esquema entero exigiendo
-- `search_path` fijado y ninguna función ejecutable por PUBLIC. Aquí se afirma lo
-- que solo importa en esta: que es `security definer` de verdad. Si alguien la
-- pasara a `security invoker` para «simplificar», los dos bloques de arriba
-- seguirían en verde —el Lector seguiría rechazado— y la pantalla del Catalogador
-- se quedaría en ceros sin que nada se pusiera rojo.

do $$
declare v_definer boolean;
begin
  select p.prosecdef into v_definer
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'resource_usage';

  if v_definer is not true then
    raise exception 'FAIL: resource_usage no es security definer: mediría cero para todo el mundo';
  end if;
  raise notice 'OK: resource_usage mide con los privilegios del propietario';
end $$;

rollback;
