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

-- ── 3. Neither role has DELETE granted on any table ──────────
-- RF-901 again, by the other door. Part 2 checks the POLICY side; this checks
-- the PRIVILEGE side, and they are not the same guardrail. The platform grants
-- every privilege of a new table to anon and authenticated by default —
-- `delete` included — so a table whose migration forgets the `revoke` arrives
-- with the privilege already there. It would still be closed today, because a
-- table with RLS and no DELETE policy denies the operation, but then closing it
-- would rest on ONE mistake not being made instead of two.
do $$
declare
  v_with_delete text[];
begin
  select coalesce(array_agg(grantee || ' on ' || table_name order by table_name, grantee), '{}')
    into v_with_delete
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'DELETE';

  if array_length(v_with_delete, 1) > 0 then
    raise exception
      'FAIL: DELETE is granted, and nothing must ever be really deleted (RF-901): %',
      array_to_string(v_with_delete, ', ');
  end if;
  raise notice 'OK: neither anon nor authenticated has DELETE granted anywhere';
end $$;

-- ── 4. The anonymous role is shut out at BOTH walls ──────────
-- RF-101: the application has no public area.
--
-- This used to name three tables by hand, which is a test of three tables and
-- not an invariant: it stayed silent through six migrations that added fifteen.
-- Worse, what it proved was not what it said. There are TWO walls between the
-- anonymous key and the data, and the outer one hides whether the inner one is
-- there:
--
--   Outer wall: `anon` has no USAGE on schema `public`. With it missing, every
--   query by that role dies with insufficient_privilege before any table is
--   consulted — including a query against a table whose migration forgot to
--   revoke the platform's default grants.
--
--   Inner wall: `anon` holds no privilege on any table or column of `public`.
--
-- So attacking the database as `anon` and getting a refusal proves the outer
-- wall and says NOTHING about the inner one. Both are checked here, and the
-- inner one from the catalog, which is the only way to see it: three parts, so
-- that reading which one broke tells you what was forgotten.

-- 4a. The outer wall, measured.
do $$
begin
  if has_schema_privilege('anon', 'public', 'usage') then
    raise exception
      'FAIL: the anonymous role has USAGE on schema public (RF-101). '
      'Every other check of this role becomes weaker: they stop proving that a '
      'table revoked its privileges and start proving only that the schema did.';
  end if;
  raise notice 'OK: the anonymous role has no USAGE on schema public';
end $$;

-- 4b. The inner wall, measured from the catalog. This is the one that catches
-- the table that forgot its `revoke`, and the only way to catch it while the
-- outer wall stands. `column_privileges` and not just `role_table_grants`: a
-- `grant select (contact) on parties to anon` does not show up in the second
-- one, and `parties.contact` is third-party personal data (RF-105).
do $$
declare
  v_granted text[];
begin
  select coalesce(array_agg(distinct table_name || ' (' || privilege_type || ')' order by table_name || ' (' || privilege_type || ')'), '{}')
    into v_granted
    from information_schema.table_privileges
   where table_schema = 'public'
     and grantee = 'anon';

  if array_length(v_granted, 1) > 0 then
    raise exception 'FAIL: the anonymous role holds table privileges in public (RF-101): %',
      array_to_string(v_granted, ', ');
  end if;

  select coalesce(array_agg(distinct table_name || '.' || column_name || ' (' || privilege_type || ')'), '{}')
    into v_granted
    from information_schema.column_privileges
   where table_schema = 'public'
     and grantee = 'anon';

  if array_length(v_granted, 1) > 0 then
    raise exception 'FAIL: the anonymous role holds column privileges in public (RF-101): %',
      array_to_string(v_granted, ', ');
  end if;

  raise notice 'OK: the anonymous role holds no table or column privilege in public';
end $$;

-- 4c. And the attack itself, over EVERY table and not a sample of three. It is
-- the weakest of the three assertions and it is kept because it is the only one
-- that exercises the real path instead of reading the catalog.
--
-- The list is gathered BEFORE changing role: with `anon` on, the catalog query
-- itself returns nothing and the loop would iterate over an empty list and pass
-- by vacuity. The count in the final notice is there so that a list that
-- silently empties is visible instead of reassuring.
do $$
declare
  v_tables text[];
  v_table text;
  v_reachable text[] := '{}';
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r';

  if coalesce(array_length(v_tables, 1), 0) < 10 then
    raise exception
      'FAIL: only % tables found in public — the walk would pass by vacuity',
      coalesce(array_length(v_tables, 1), 0);
  end if;

  set local role anon;

  foreach v_table in array v_tables loop
    begin
      execute format('select 1 from public.%I limit 1', v_table);
      v_reachable := v_reachable || v_table;
    exception
      when insufficient_privilege then
        null;  -- closed, which is the point
    end;
  end loop;

  reset role;

  if array_length(v_reachable, 1) > 0 then
    raise exception 'FAIL: the anonymous role reaches these tables (RF-101): %',
      array_to_string(v_reachable, ', ');
  end if;
  raise notice 'OK: the anonymous role reaches none of the % tables of public',
    array_length(v_tables, 1);
end $$;

reset role;
rollback;
