-- ============================================================
-- The RLS policies of the documentary catalogue raisonné
-- (RF-101, RF-103, RF-105, RF-106, RF-109, RF-111, RF-113, RF-901, RF-906).
--
-- The six previous groups (20260804090000 to 20260804140000) created FIFTEEN
-- tables with `enable row level security` and ZERO policies. That is the
-- safe state to be left half way in —RLS enabled with no policy denies everybody
-- with a session— but it also means that today the application cannot read
-- or write a single row of them. This migration is the one that opens them, and only
-- what each role needs.
--
-- It goes before the first screen on purpose, which is what
-- `docs/plan-de-pruebas.md` says: there is no backend, the anonymous key travels in the
-- client and these policies are the only perimeter. A failure here does not corrupt
-- data, it exposes it — and the most exposed datum of this group is `parties.contact`,
-- the telephone number or the email of a private collector, which belongs to a third party
-- and not to the studio.
--
-- ── THE SHAPE, WHICH IS NOT INVENTED HERE ───────────────────
--
-- That of `artworks` and `images` is copied, which have been there since the first migration:
--
--   select  ->  (active and public.can_read()) or public.can_edit()
--   insert  ->  public.can_edit()
--   update  ->  public.can_edit()  (using AND with check)
--   delete  ->  DOES NOT EXIST, in any table and for any role
--
-- `can_read()` is «having a profile», that is, having logged in; `can_edit()`
-- is being a CATALOGER or a SUPERUSER. Both are SECURITY DEFINER because they query
-- `profiles`, which also has RLS, and a policy that queried the table it
-- is filtering would recurse for ever.
--
-- WHY THE `active` IN THE SELECT, IN THE VOCABULARY TOO. The three
-- old master tables (`artwork_types`, `series`, `physical_places`) have a
-- select of `public.can_read()` on its own, without filtering the wastebasket. Here
-- `artworks`' shape has been chosen for the fifteen, and the reason is that the vocabulary's
-- wastebasket is a wastebasket just the same: RF-906 says whoever can edit sees it,
-- and a Reader who sees «Recorte de prensa (retirado)» in a dropdown is not
-- reading the catalogue, they are reading somebody else's work. What makes this not
-- break anything is that the six new master tables were born with their deactivation
-- trigger: a publication type used by an active reference is not withdrawn,
-- nor a venue with active exhibitions, nor a series with documents
-- inside, nor a party that holds up a provenance chain. That is, a
-- withdrawn vocabulary row CANNOT be hanging from anything the Reader
-- sees, so hiding it from them leaves them with no unresolved name.
--
-- The select of the three old master tables is not touched: changing a policy that
-- has been in production for months is not this migration's job, and the divergence
-- is noted here so that it is decided once and for all when somebody unifies it.
--
-- WHY THERE IS NO DELETE POLICY. Because nothing is ever deleted (RF-901,
-- RF-517), and because `rls_default_deny.test.sql` throws an exception on any
-- DELETE or ALL policy in `public`. The absence of a policy already closes the
-- operation; the revoked privilege closes it again, and two
-- mistakes are needed instead of one to open it. Both barriers are checked below.
--
-- RF-905'S DOWNWARD CASCADE DOES NOT LIVE HERE. Hiding the provenance links,
-- the citations or the participations of a withdrawn artwork is a matter
-- for the query, exactly as is done today with the images: `images`'
-- policy looks at `images.active` and not at `artworks.active`. The alternative —a
-- policy requiring the parent to be visible too— is harder to
-- get round and a good deal more expensive to evaluate, and it is one of the design's open
-- questions. Until it is decided, the perimeter is the perimeter and the filtering
-- by context belongs to whoever queries.
--
-- WHAT IT IS CHECKED AGAINST. `supabase/tests/documentary_policies.test.sql`
-- (the perimeter table by table) and `supabase/tests/rls_role_matrix.test.sql`
-- (the three roles, authenticating for real). At the end of this file there is
-- besides a `do` block that measures what has been left in the system catalogue
-- and aborts the migration if it does not add up: the platform grants by default all
-- the privileges of every new table to `anon` and `authenticated` —including
-- `delete`—, and that is not taken as known, it is measured.
-- ============================================================


-- ── 1. People and institutions (RF-508) ─────────────────────
--
-- The row that matters most in the whole matrix. RF-105 decides expressly that the
-- Reader sees `contact`: there is no per-column trimming, and that is why the matrix's
-- assertion about this table is the one to look at twice. Its being a
-- written decision is what separates it from an oversight.

revoke all on public.parties from anon, authenticated;
grant select, insert, update on public.parties to authenticated;

create policy parties_select on public.parties
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy parties_insert on public.parties
  for insert with check (public.can_edit());

create policy parties_update on public.parties
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 2. The provenance chain (RF-509, RF-510, RF-511) ────────
--
-- `reorder_provenance_events` is SECURITY INVOKER on purpose: reordering remains
-- subject to these policies, and without the select one the function would not find the
-- chain. With it in place, the Cataloguer reorders it and the Reader receives the
-- message in Spanish the function itself throws, instead of the silence of an
-- update that affects no row.

revoke all on public.provenance_events from anon, authenticated;
grant select, insert, update on public.provenance_events to authenticated;

create policy provenance_events_select on public.provenance_events
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy provenance_events_insert on public.provenance_events
  for insert with check (public.can_edit());

create policy provenance_events_update on public.provenance_events
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 3. Bibliography (RF-504, RF-506, RF-514) ────────────────
--
-- `cite_artwork` does `insert ... on conflict do update ... returning`, so
-- it needs the bridge's three policies at once: without the update one it does not
-- restore a withdrawn citation, and without the select one it cannot return the row.

revoke all on public.publication_types from anon, authenticated;
grant select, insert, update on public.publication_types to authenticated;

create policy publication_types_select on public.publication_types
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy publication_types_insert on public.publication_types
  for insert with check (public.can_edit());

create policy publication_types_update on public.publication_types
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.bibliography from anon, authenticated;
grant select, insert, update on public.bibliography to authenticated;

create policy bibliography_select on public.bibliography
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy bibliography_insert on public.bibliography
  for insert with check (public.can_edit());

create policy bibliography_update on public.bibliography
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_bibliography from anon, authenticated;
grant select, insert, update on public.artwork_bibliography to authenticated;

create policy artwork_bibliography_select on public.artwork_bibliography
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_bibliography_insert on public.artwork_bibliography
  for insert with check (public.can_edit());

create policy artwork_bibliography_update on public.artwork_bibliography
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 4. Exposiciones (RF-501, RF-502, RF-503, RF-512, RF-513) ─

revoke all on public.exhibition_venues from anon, authenticated;
grant select, insert, update on public.exhibition_venues to authenticated;

create policy exhibition_venues_select on public.exhibition_venues
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy exhibition_venues_insert on public.exhibition_venues
  for insert with check (public.can_edit());

create policy exhibition_venues_update on public.exhibition_venues
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.exhibitions from anon, authenticated;
grant select, insert, update on public.exhibitions to authenticated;

create policy exhibitions_select on public.exhibitions
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy exhibitions_insert on public.exhibitions
  for insert with check (public.can_edit());

create policy exhibitions_update on public.exhibitions
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_exhibitions from anon, authenticated;
grant select, insert, update on public.artwork_exhibitions to authenticated;

create policy artwork_exhibitions_select on public.artwork_exhibitions
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_exhibitions_insert on public.artwork_exhibitions
  for insert with check (public.can_edit());

create policy artwork_exhibitions_update on public.artwork_exhibitions
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 5. Archive and documentation (RF-310, RF-515, RF-516) ───
--
-- The digitised file needs NO new storage policy: it lives in
-- the `obras` bucket, which is private, and the three `storage.objects` policies
-- 20260726010000 wrote are placed over the whole bucket
-- (`bucket_id = 'obras'` and `can_read()` / `can_edit()`), so they cover the
-- document's prefix as they are. What is protected here is the document's RECORD,
-- which is where the path is: without it nobody knows what to sign.

revoke all on public.document_types from anon, authenticated;
grant select, insert, update on public.document_types to authenticated;

create policy document_types_select on public.document_types
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy document_types_insert on public.document_types
  for insert with check (public.can_edit());

create policy document_types_update on public.document_types
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.archive_series from anon, authenticated;
grant select, insert, update on public.archive_series to authenticated;

create policy archive_series_select on public.archive_series
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy archive_series_insert on public.archive_series
  for insert with check (public.can_edit());

create policy archive_series_update on public.archive_series
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.archive_documents from anon, authenticated;
grant select, insert, update on public.archive_documents to authenticated;

create policy archive_documents_select on public.archive_documents
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy archive_documents_insert on public.archive_documents
  for insert with check (public.can_edit());

create policy archive_documents_update on public.archive_documents
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_documents from anon, authenticated;
grant select, insert, update on public.artwork_documents to authenticated;

create policy artwork_documents_select on public.artwork_documents
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_documents_insert on public.artwork_documents
  for insert with check (public.can_edit());

create policy artwork_documents_update on public.artwork_documents
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.exhibition_documents from anon, authenticated;
grant select, insert, update on public.exhibition_documents to authenticated;

create policy exhibition_documents_select on public.exhibition_documents
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy exhibition_documents_insert on public.exhibition_documents
  for insert with check (public.can_edit());

create policy exhibition_documents_update on public.exhibition_documents
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 6. Artworks related to each other (RF-212, RF-217) ──────

revoke all on public.artwork_relationship_types from anon, authenticated;
grant select, insert, update on public.artwork_relationship_types to authenticated;

create policy artwork_relationship_types_select on public.artwork_relationship_types
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_relationship_types_insert on public.artwork_relationship_types
  for insert with check (public.can_edit());

create policy artwork_relationship_types_update on public.artwork_relationship_types
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_relationships from anon, authenticated;
grant select, insert, update on public.artwork_relationships to authenticated;

create policy artwork_relationships_select on public.artwork_relationships
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_relationships_insert on public.artwork_relationships
  for insert with check (public.can_edit());

create policy artwork_relationships_update on public.artwork_relationships
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 7. The migration measures itself ────────────────────────
--
-- It is neither an ornament nor the same as the test: this runs INSIDE the transaction
-- that applies the migration, so if something does not add up the migration is not applied
-- half way — and a table with half a perimeter is exactly the state that has
-- to be avoided. The test alongside measures it again from outside and besides attacks the
-- base with each role's session, which is the only thing that verifies for real.

do $$
declare
  v_tables constant text[] := array[
    'parties', 'provenance_events',
    'publication_types', 'bibliography', 'artwork_bibliography',
    'exhibition_venues', 'exhibitions', 'artwork_exhibitions',
    'document_types', 'archive_series', 'archive_documents',
    'artwork_documents', 'exhibition_documents',
    'artwork_relationship_types', 'artwork_relationships'
  ];
  v_table text;
  v_found text[];
  v_privs text;
begin
  if array_length(v_tables, 1) <> 15 then
    raise exception 'FAIL: la lista de tablas de este grupo debería tener 15 entradas, tiene %',
      array_length(v_tables, 1);
  end if;

  foreach v_table in array v_tables loop
    -- RLS enabled. Without this, the policies below are decoration.
    if not (select c.relrowsecurity
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = v_table) then
      raise exception 'FAIL: public.% no tiene RLS activado', v_table;
    end if;

    -- The three policies, not one more and not one fewer.
    select coalesce(array_agg(cmd::text order by cmd::text), '{}')
      into v_found
      from pg_policies
     where schemaname = 'public' and tablename = v_table;

    if v_found <> array['INSERT', 'SELECT', 'UPDATE'] then
      raise exception 'FAIL: public.% debería tener exactamente SELECT, INSERT y UPDATE, tiene [%]',
        v_table, array_to_string(v_found, ', ');
    end if;

    -- The anonymous role, not one privilege. `column_privileges` is looked at and not only
    -- `role_table_grants` because a `grant update (column)` does not appear in the
    -- second: it would be a one-column hole, invisible from where one usually
    -- looks.
    if exists (select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = v_table
                  and grantee = 'anon') then
      raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre public.%', v_table;
    end if;

    -- And the authenticated one, exactly three. Note the absence of DELETE: without the
    -- privilege there is not even a way of trying (RF-901).
    select string_agg(distinct privilege_type, ',' order by privilege_type)
      into v_privs
      from information_schema.column_privileges
     where table_schema = 'public' and table_name = v_table
       and grantee = 'authenticated';

    if v_privs is distinct from 'INSERT,SELECT,UPDATE' then
      raise exception 'FAIL: el rol autenticado debería tener INSERT, SELECT y UPDATE sobre public.%, tiene [%]',
        v_table, coalesce(v_privs, '(ninguno)');
    end if;
  end loop;

  raise notice 'OK: las 15 tablas del catálogo documental tienen RLS, tres políticas y los privilegios justos';
end $$;
