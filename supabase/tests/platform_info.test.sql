-- Diagnostics of the platform: available to the team, to nobody else.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'cat-info@test.local'),
  ('00000000-0000-0000-0000-00000000c002', 'lec-info@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000c001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000c002';

-- ── It reports the version and the applied schema ────────────
do $$
declare v jsonb;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
  set local role authenticated;

  v := public.platform_info();
  if v->>'postgres' is null or v->>'postgres' = '' then
    raise exception 'FAIL: no informó la versión de Postgres: %', v;
  end if;
  if (v->>'migrations')::integer < 1 then
    raise exception 'FAIL: no contó las migraciones aplicadas: %', v;
  end if;
  if v->>'schema_version' is null then
    raise exception 'FAIL: no informó la última migración aplicada: %', v;
  end if;
  raise notice 'OK: informa plataforma y esquema (postgres %, esquema %, % migraciones)',
    v->>'postgres', v->>'schema_version', v->>'migrations';
end $$;

reset role;

-- ── The reader also sees it: is diagnostics, not catalog data ─
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
  set local role authenticated;
  perform public.platform_info();
  raise notice 'OK: el lector puede consultar el diagnóstico';
end $$;

reset role;

-- ── Without a session, nothing ───────────────────────────────
do $$
begin
  set local role anon;
  perform public.platform_info();
  raise exception 'FAIL: el rol anónimo obtuvo información de la plataforma';
exception
  when insufficient_privilege then
    raise notice 'OK: el anónimo no tiene privilegio de ejecución';
  when others then
    if position('permiso' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: el anónimo no obtiene información: %', sqlerrm;
end $$;

reset role;

rollback;
