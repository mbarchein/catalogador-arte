-- RF-111: ninguna función del esquema público es ejecutable por quien no debe.
--
-- Son invariantes del proyecto entero, como los de rls_default_deny: no
-- comprueban un caso, comprueban que no hay excepciones. Están escritos para
-- romperse el día que alguien añada una función y se quede con la concesión por
-- omisión de PostgreSQL, que es a PUBLIC.
\set ON_ERROR_STOP on
begin;

-- Fixture: un catalogador. El perfil lo crea el trigger de auth.users.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000f1', 'privilegios@test.local');
update public.profiles set role = 'CATALOGER'
 where id = '00000000-0000-0000-0000-0000000000f1';

-- ── 1. Ninguna función es de PUBLIC ──────────────────────────
-- El grantee 0 de la ACL es PUBLIC. anon y authenticated lo heredan por ser sus
-- miembros, así que revocar de ellos no cierra nada mientras esto exista.
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

-- ── 2. Toda función fija su search_path ──────────────────────
-- Una función que resuelve sus nombres contra un search_path que controla quien
-- la invoca es una función de la que no se sabe qué ejecuta.
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

-- ── 3. Un anónimo no puede ejecutar nada que escriba ─────────
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

-- ── 4. Las funciones de trigger no las ejecuta nadie ─────────
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

-- ── 5. Y aun así los triggers siguen disparando ──────────────
-- Es la comprobación que justifica el punto 4: PostgreSQL no exige EXECUTE al
-- disparar un trigger, solo al invocar la función. Si esto se rompiera, revocar
-- habría roto la asignación del identificador y la traza de autoría.
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

-- ── 6. Un lector legítimo sigue leyendo ─────────────────────
-- Es el riesgo real de revocar: can_read() se evalúa DENTRO de la política, con
-- el privilegio de quien consulta. Si se le quitara el EXECUTE a authenticated,
-- las consultas de un usuario con sesión fallarían con «permission denied» en
-- vez de aplicar la política.
--
-- Al anónimo no hay que concederle nada: no tiene privilegio sobre ninguna
-- tabla, y sin él la política ni se evalúa. Eso lo cubre rls_default_deny.
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

rollback;
