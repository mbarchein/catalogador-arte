-- RF-111: there is no path to the data that does not go through RLS.
--
-- These two are invariants of the whole project, not of a single table. They
-- are written to break the day someone adds a table and forgets to enable RLS,
-- or the day someone grants a DELETE. They do not check one case: they check
-- that there are no exceptions.
\set ON_ERROR_STOP on
begin;

-- ── 1. Every table in public has RLS enabled ─────────────────
-- A table without a policy is closed for that operation; a table without RLS
-- enabled is completely open. It is the most expensive mistake and the easiest
-- one to make.
do $$
declare
  v_without_rls text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_without_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if array_length(v_without_rls, 1) > 0 then
    raise exception 'FAIL: public tables without RLS enabled: %',
      array_to_string(v_without_rls, ', ');
  end if;
  raise notice 'OK: every public table has RLS enabled';
end $$;

-- ── 2. No table has a DELETE policy ──────────────────────────
-- RF-901: deletion is never a real delete. With no DELETE policy, neither an
-- interface bug nor a direct API call can remove a catalog row. Deactivating
-- is an UPDATE of `active`.
do $$
declare
  v_with_delete text[];
begin
  select coalesce(array_agg(tablename || '.' || policyname order by tablename), '{}')
    into v_with_delete
    from pg_policies
   where schemaname = 'public'
     and cmd in ('DELETE', 'ALL');

  if array_length(v_with_delete, 1) > 0 then
    raise exception
      'FAIL: policies allowing DELETE exist, and nothing must ever be really deleted (RF-901): %',
      array_to_string(v_with_delete, ', ');
  end if;
  raise notice 'OK: no policy allows DELETE';
end $$;

-- ── 3. The anonymous role reaches no data table ──────────────
-- RF-101: the application has no public area.
do $$
begin
  set local role anon;
  perform 1 from public.artworks limit 1;
  raise exception 'FAIL: the anonymous role could query artworks';
exception
  when insufficient_privilege then
    raise notice 'OK: the anonymous role has no access to artworks';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.profiles limit 1;
  raise exception 'FAIL: the anonymous role could query profiles';
exception
  when insufficient_privilege then
    raise notice 'OK: the anonymous role has no access to profiles';
end $$;

reset role;
rollback;
