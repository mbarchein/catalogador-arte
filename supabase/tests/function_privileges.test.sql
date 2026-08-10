-- RF-111: no function of the public schema is executable by whoever should not.
--
-- They are invariants of the whole project, like rls_default_deny's: they do not
-- check a case, they check that there are no exceptions. They are written to
-- break the day somebody adds a function and keeps PostgreSQL's default
-- grant, which is to PUBLIC.
\set ON_ERROR_STOP on
begin;

-- Fixture: one cataloguer. The profile is created by the auth.users trigger.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000f1', 'privilegios@test.local');
update public.profiles set role = 'CATALOGER'
 where id = '00000000-0000-0000-0000-0000000000f1';

-- ── 1. No function belongs to PUBLIC ─────────────────────────
-- The ACL's grantee 0 is PUBLIC. anon and authenticated inherit it by being its
-- members, so revoking from them closes nothing while this exists.
do $$
declare
  v_publicas text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_publicas
    from pg_proc p, aclexplode(p.proacl) a
   where p.pronamespace = 'public'::regnamespace
     and a.grantee = 0;

  if array_length(v_publicas, 1) > 0 then
    raise exception 'FAIL: funciones ejecutables por PUBLIC: %',
      array_to_string(v_publicas, ', ');
  end if;
  raise notice 'OK: ninguna función del esquema público es ejecutable por PUBLIC';
end $$;

-- ── 2. Every function fixes its search_path ──────────────────
-- A function that resolves its names against a search_path controlled by whoever
-- invokes it is a function of which it is not known what it executes.
do $$
declare
  v_sin_ruta text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_sin_ruta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%'
     );

  if array_length(v_sin_ruta, 1) > 0 then
    raise exception 'FAIL: funciones sin search_path fijado: %',
      array_to_string(v_sin_ruta, ', ');
  end if;
  raise notice 'OK: toda función del esquema público fija su search_path';
end $$;

-- ── 3. An anonymous one cannot execute anything that writes ──
do $$
begin
  if has_function_privilege('anon', 'public.recalculate_photographed(text)', 'execute') then
    raise exception 'FAIL: anon puede ejecutar recalculate_photographed, que escribe';
  end if;
  if has_function_privilege('anon', 'public.set_main_image(text)', 'execute')
     or has_function_privilege('anon', 'public.reorder_images(text, text[])', 'execute')
     or has_function_privilege('anon', 'public.next_catalog_id(public.artist_fund)', 'execute')
  then
    raise exception 'FAIL: anon puede ejecutar alguna RPC de escritura o de reserva';
  end if;
  raise notice 'OK: un anónimo no puede ejecutar ninguna RPC que escriba';
end $$;

-- ── 4. The trigger functions are executed by nobody ──────────
do $$
declare
  v_concedidas text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_concedidas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if array_length(v_concedidas, 1) > 0 then
    raise exception 'FAIL: funciones de trigger ejecutables por la API: %',
      array_to_string(v_concedidas, ', ');
  end if;
  raise notice 'OK: ninguna función de trigger es invocable desde la API';
end $$;

-- ── 5. And even so the triggers still fire ───────────────────
-- It is the check that justifies point 4: PostgreSQL does not require EXECUTE to
-- fire a trigger, only to invoke the function. If this broke, revoking
-- would have broken the identifier's assignment and the authorship trace.
do $$
declare
  v_id text;
  v_actualizado timestamptz;
  v_autor uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
  set local role authenticated;

  insert into public.artworks (artist, artwork_type) values ('TEST', '')
  returning catalog_id, updated_at, updated_by into v_id, v_actualizado, v_autor;

  reset role;

  if v_id is null or v_id !~ '^TS-[0-9]{4}$' then
    raise exception 'FAIL: el trigger de identificador no ha asignado nada (%)', v_id;
  end if;
  if v_actualizado is null or v_autor is distinct from '00000000-0000-0000-0000-0000000000f1'::uuid then
    raise exception 'FAIL: el trigger de traza no ha sellado la fila (% / %)', v_actualizado, v_autor;
  end if;
  raise notice 'OK: los triggers disparan sin que nadie tenga EXECUTE sobre ellos (%)', v_id;
end $$;

-- ── 6. A legitimate reader goes on reading ──────────────────
-- It is the real risk of revoking: can_read() is evaluated INSIDE the policy, with
-- the privilege of whoever queries. If EXECUTE were taken away from authenticated,
-- the queries of a user with a session would fail with «permission denied» instead
-- of applying the policy.
--
-- The anonymous one needs nothing granted: it has no privilege over any
-- table, and without it the policy is not even evaluated. That is covered by rls_default_deny.
do $$
declare
  v_filas int;
begin
  insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000f2', 'lector-privilegios@test.local');

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_filas from public.artworks;
  reset role;

  raise notice 'OK: un lector con sesión sigue leyendo (% filas), la política se evalúa', v_filas;
exception when insufficient_privilege then
  reset role;
  raise exception 'FAIL: revocar EXECUTE ha roto la evaluación de la política para un usuario con sesión';
end $$;

-- ── 7. The public schema is not open to PUBLIC ──────────────
-- The same misunderstanding as in the functions: `revoke ... from anon` does not undo what
-- PUBLIC grants. Here the result is checked, which is what matters.
do $$
begin
  if has_schema_privilege('anon', 'public', 'usage') then
    raise exception 'FAIL: anon tiene USAGE sobre el esquema público';
  end if;
  -- And the ones the API needs, which without this is left unable to start.
  if not has_schema_privilege('authenticated', 'public', 'usage')
     or not has_schema_privilege('authenticator', 'public', 'usage')
  then
    raise exception 'FAIL: authenticated o authenticator han perdido el USAGE del esquema';
  end if;
  raise notice 'OK: el esquema público está cerrado a PUBLIC y abierto a quien lo necesita';
end $$;

rollback;
