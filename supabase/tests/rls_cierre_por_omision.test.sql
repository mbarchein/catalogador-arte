-- RF-111: no existe ningún camino a los datos que no atraviese RLS.
--
-- Estos dos son invariantes de todo el proyecto, no de una tabla concreta. Están
-- escritos para romperse el día que alguien añada una tabla y olvide activar RLS,
-- o el día que alguien conceda un DELETE. No comprueban un caso: comprueban que
-- no hay excepciones.
\set ON_ERROR_STOP on
begin;

-- ── 1. Toda tabla de public tiene RLS activado ──────────────
-- Una tabla sin política está cerrada para esa operación; una tabla sin RLS
-- activado está completamente abierta. Es el fallo que más caro sale y el más
-- fácil de cometer.
do $$
declare
  v_sin_rls text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_sin_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if array_length(v_sin_rls, 1) > 0 then
    raise exception 'FAIL: tablas de public sin RLS activado: %',
      array_to_string(v_sin_rls, ', ');
  end if;
  raise notice 'OK: todas las tablas de public tienen RLS activado';
end $$;

-- ── 2. Ninguna tabla tiene política de DELETE ───────────────
-- RF-901: la eliminación nunca es un borrado real. Si no existe política de
-- DELETE, ni un fallo de la interfaz ni una llamada directa a la API pueden
-- borrar una fila del catálogo. Dar de baja es un UPDATE de `activo`.
do $$
declare
  v_con_delete text[];
begin
  select coalesce(array_agg(tablename || '.' || policyname order by tablename), '{}')
    into v_con_delete
    from pg_policies
   where schemaname = 'public'
     and cmd in ('DELETE', 'ALL');

  if array_length(v_con_delete, 1) > 0 then
    raise exception
      'FAIL: hay políticas que permiten DELETE, y nada debe borrarse de verdad (RF-901): %',
      array_to_string(v_con_delete, ', ');
  end if;
  raise notice 'OK: ninguna política permite DELETE';
end $$;

-- ── 3. El rol anónimo no alcanza ninguna tabla de datos ─────
-- RF-101: la aplicación no tiene zona pública.
do $$
begin
  set local role anon;
  perform 1 from public.obras limit 1;
  raise exception 'FAIL: el rol anónimo pudo consultar obras';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no tiene acceso a obras';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.perfiles limit 1;
  raise exception 'FAIL: el rol anónimo pudo consultar perfiles';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no tiene acceso a perfiles';
end $$;

reset role;
rollback;
