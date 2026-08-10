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

-- ── The Cataloguer gets three usable figures ─────────────────

do $$
declare v_row record;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  select * into v_row from public.resource_usage();

  if v_row is null then
    raise exception 'FAIL: resource_usage no ha devuelto ninguna fila';
  end if;

  -- A base with the whole schema applied cannot take up zero. The assertion
  -- distinguishes «it has measured» from «it has answered a zero for not being able to look», which is
  -- exactly what this function would return without `security definer`.
  if coalesce(v_row.database_bytes, 0) <= 0 then
    raise exception 'FAIL: el tamaño de la base sale %, que no es una medida',
      coalesce(v_row.database_bytes, -1);
  end if;

  -- The store may be empty in a freshly raised stack, and that is a legitimate
  -- zero. What it cannot be is null or negative: the application divides by
  -- the limit to paint the bar.
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

  -- The result is stored in variables and judged OUTSIDE the block. Judging it
  -- inside would be catching this test's own FAIL with the same `when`, and an
  -- assertion that swallows its own failure is not an assertion.
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
  -- The message is read by the user as is: it has to say what it is talking about.
  if v_dijo not like '%espacio ocupado%' then
    raise exception 'FAIL: el rechazo al Lector no explica qué se le negó: %', v_dijo;
  end if;

  raise notice 'OK: un Lector no consulta el espacio ocupado, y se le dice por qué';
end $$;

reset role;

-- ── Nobody else has the key ──────────────────────────────────

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

-- ── And it is one of those checked from inside ────────────────
--
-- `function_privileges.test.sql` already sweeps the whole schema requiring
-- a fixed `search_path` and no function executable by PUBLIC. Here what is asserted is what
-- only matters in this one: that it is really `security definer`. If somebody
-- changed it to `security invoker` to «simplify», the two blocks above
-- would stay green —the Reader would still be rejected— and the Cataloguer's screen
-- would be left at zeros with nothing going red.

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
