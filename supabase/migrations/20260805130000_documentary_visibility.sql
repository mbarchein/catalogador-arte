-- ============================================================
-- A documentary row's visibility is inherited from its anchor
-- (RF-609, RF-905, RF-910, RF-911, RF-912, RF-913, RF-906, RF-105, RF-106,
-- RF-109, RF-111).
--
-- ── THE LEAK, MEASURED AND NOT ASSUMED ──────────────────────
--
-- Exercised on 4 August 2026 with a real Reader's session, over
-- a logically withdrawn artwork and NOTHING BUT the artwork:
--
--   artworks (the withdrawn artwork) .......... 0 rows   ← correct
--   provenance_events (link) .................. 1 row    ← LEAK
--   parties reached by the link ............... 1 row    ← LEAK, and the worst
--   artwork_bibliography (citation) ........... 1 row    ← LEAK
--   artwork_exhibitions (participation) ....... 1 row    ← LEAK
--   artwork_documents (document) .............. 1 row    ← LEAK
--   artwork_relationships (relationship) ...... 1 row    ← LEAK
--   external_links (link) ..................... 0 rows   ← already inherited
--
-- And the contact was read as it is, it was not deduced from a count: the query
-- `parties join provenance_events` returned to the Reader the name of the
-- private collector and their email address. That is what turns
-- this into a leak of a third party's personal data and not into a presentation
-- slip: `parties.contact` is the datum the test plan names as
-- the only one whose exposure affects people outside the catalogue, and the provenance
-- link is the path that leads to it. The artwork's record is
-- hidden, but that hidden artwork's chain of owners was not.
--
-- An artwork's logical deletion does not cascade over its documentary rows: there is
-- no trigger that withdraws them, and it is deliberate (RF-905 restores the artwork with everything
-- of its own inside, and a round-trip cascade over `active` would lose the
-- distinction between «I withdrew it» and «it was withdrawn with its artwork»). So the cascade
-- that is missing is not one of data, it is one OF VISIBILITY, and that is a policy's place.
--
-- Migration 20260804150000 left this written as an open question —«RF-905's
-- downward cascade does not live here… it is a matter for the query»—. The
-- answer is no: trusting that the query remembers to filter is exactly
-- what RF-609 forbids, and whoever queries may be a `curl` with the Reader's token
-- and the anonymous key that travels in the client. It is closed in the policy.
--
-- ── THE CRITERION, WRITTEN SO AS NOT TO HAVE TO DEDUCE IT ───
--
-- A documentary row is visible if ALL its anchors are visible. Its anchors are the
-- records without which the row means nothing on its own:
--
--   provenance_events      -> the artwork
--   artwork_bibliography   -> the artwork AND the reference
--   artwork_exhibitions    -> the artwork AND the exhibition
--   artwork_documents      -> the artwork AND the document
--   exhibition_documents   -> the exhibition AND the document
--   artwork_relationships  -> BOTH artworks
--
-- BOTH ENDS OF A BRIDGE, and not one. A bridge models a datum that only
-- exists by the combination of two records: «pp. 33-35» is not a citation, it is the
-- page of a citation, and with no reference on the other side it is nothing. Showing it
-- when the other end is hidden is not showing less catalogue, it is showing
-- a gap — and in the case of the relationship between artworks it is showing that an
-- artwork RF-609 hides exists. With `is_symmetric` and the canonicalisation trigger,
-- a relationship has two interchangeable ends and neither is the principal one: the
-- rule has to be the conjunction or half the relationships would be leaked
-- through the side that ended up in `to_catalog_id`.
--
-- WHAT HAPPENS WITH A DOCUMENT THAT HANGS FROM A WITHDRAWN ARTWORK AND FROM AN ACTIVE
-- EXHIBITION. Decided, and this is the decision: the document's record STAYS
-- VISIBLE, and what disappears is the artwork's bridge. A document is a
-- record with an identifier of its own, a wastebasket of its own and its own `active` column
-- (RF-901), and it can hang from several artworks and several exhibitions at once;
-- it does not have ONE anchor to inherit from, so it does not inherit. What inherits is each
-- bridge, and each bridge inherits from the end that is its own. Result: the Reader cannot
-- know that that press clipping documents the withdrawn artwork, and goes on
-- seeing it in the exhibition where it legitimately is.
--
-- The other way round would be worse in three ways. Hiding the document's record because of
-- one of its withdrawn artworks would erase it from the active exhibition —it would make
-- withdrawing an artwork empty the file of a show that has nothing to
-- do with it—; it would force an aggregate condition («does it have any visible
-- anchor left?») instead of a key lookup, which is exactly the expensive subquery
-- that cannot be afforded; and it would leave a shared record's state
-- depending on its neighbour's. The same decision holds for `bibliography`,
-- `exhibitions` and `parties`: they are records, they are visible by their own `active`, and their
-- relationship with a withdrawn artwork is hidden in the bridge.
--
-- WHAT IS NOT HIDDEN, AND WHY. A document whose only anchors are all
-- withdrawn stays visible in the archive, without saying which artwork it was of. It is a
-- document with no artwork in sight, not an artwork in sight: the archive has records
-- that hang from no artwork and they are legitimate.
--
-- ── THE SHAPE, WHICH IS NOT INVENTED HERE ───────────────────
--
-- It is that of `external_links` (20260805100000), the only table in the schema that already
-- inherited its anchor record's visibility, and that of `change_log`
-- (20260805120000):
--
--   and exists (select 1 from public.artworks a where a.catalog_id = <row>.catalog_id)
--
-- WHY THIS WORKS WITHOUT REPEATING THE RULE. The subquery is evaluated UNDER ITS
-- OWN TABLE'S POLICY, because it runs with the role of whoever asks and not
-- with the owner's. `artworks_select` is
-- `(active and can_read()) or can_edit()`, so:
--
--   * to the Reader the subquery returns nothing for a withdrawn artwork, and the
--     documentary row disappears;
--   * to the Cataloguer it always returns it, because `can_edit()` is true, and
--     THE WASTEBASKET STAYS COMPLETE — which is the way of restoring (RF-906) and the
--     only thing this migration cannot break;
--   * and the day the artworks' visibility rule changes, these six
--     follow it on their own. There is no second copy of the criterion that can be left
--     behind.
--
-- THE PRICE, MEASURED AND NOT ESTIMATED. The worry is legitimate: one subquery
-- per row over a table of thousands shows. It is not what it does. Measured with
-- `explain (analyze)` from the Reader's session, over 5008 provenance
-- links:
--
--   Seq Scan on provenance_events (actual rows=5008 loops=1)
--     Filter: (((active AND can_read()) OR can_edit())
--              AND (ANY (catalog_id = (hashed SubPlan 2).col1)))
--     SubPlan 2 -> Seq Scan on artworks (actual rows=22 loops=1)
--
-- `hashed SubPlan` and `loops=1`: the planner runs the subquery ONCE,
-- keeps the table of visible keys and probes it in memory per row. What
-- is paid per row is a hash-table probe, not a query. Times for
-- the same query, three passes each: 74, 123 and 87 ms with the previous
-- policy; 57, 87 and 128 ms with this one. The difference is indistinguishable from noise, and
-- the dominant cost is the per-row `can_read()`, which was already there. When the table
-- of anchors grows, the probe goes by its primary key, which is the shape
-- that was wanted.
--
-- No new index is needed: the bridge's side already has one by the uniqueness
-- `(catalog_id, …)` and by the other end's indexes. What is NOT done, because it is
-- expensive: no aggregate condition, no new `security definer` function
-- wrapping the `exists` —that WOULD be opaque to the planner and would go back to
-- being one subquery per row—, and no `join` to `parties` to trim
-- `contact` by columns: RF-105 decides that the Reader sees the contact of the
-- parties they can see, and what had to be fixed was which ones they can see.
--
-- ONLY THE SELECT IS TOUCHED. `insert` and `update` go on being `can_edit()` on
-- its own: whoever writes sees all the artworks, so inheriting there would not change a
-- single decision and would leave the same criterion written in three places. The count
-- of «exactly three policies per table» from 20260804150000 and from
-- `documentary_policies.test.sql` still holds, and it is measured again below.
--
-- WHAT REMAINS OPEN. `images` has the same hole: the Reader sees the row —and
-- therefore the file's path— of the photograph of a withdrawn artwork. It was measured
-- at the same time (1 row) and it is NOT closed here, for the same reason
-- 20260805100000 states: `images`' policy is from the first migration, it is in
-- production, the photograph screens touch it and it gets its own migration.
-- It carries no third party's personal datum, which is what made this urgent.
--
-- WHAT IT IS CHECKED AGAINST. `supabase/tests/documentary_visibility.test.sql`
-- reproduces the whole leak by authenticating for real as a Reader and as a
-- Cataloguer, table by table and by both ends of each bridge, and
-- `rls_role_matrix.test.sql` adds the Reader's cell over the withdrawn artwork.
-- ============================================================


-- ── 1. The provenance chain (RF-509, RF-510, RF-511) ────────
--
-- The row the personal datum came out of. `reorder_provenance_events` is
-- SECURITY INVOKER and queries the chain through this very policy: to the
-- Cataloguer it goes on returning the whole chain, including that of a withdrawn
-- artwork, because restoring an artwork has to give back its provenance in the
-- order it was in.

drop policy provenance_events_select on public.provenance_events;

create policy provenance_events_select on public.provenance_events
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = provenance_events.catalog_id
    )
  );


-- ── 2. The bibliographic citation (RF-504, RF-506, RF-514) ──
--
-- Both ends. `cite_artwork` does `insert … on conflict do update …
-- returning` and it needs the select in order to return the row: a
-- Cataloguer calls it, for whom both subqueries are true, so it goes on
-- returning the same as before.

drop policy artwork_bibliography_select on public.artwork_bibliography;

create policy artwork_bibliography_select on public.artwork_bibliography
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_bibliography.catalog_id
    )
    and exists (
      select 1 from public.bibliography b
       where b.id = artwork_bibliography.bibliography_id
    )
  );


-- ── 3. The participation in an exhibition (RF-501, RF-502) ──

drop policy artwork_exhibitions_select on public.artwork_exhibitions;

create policy artwork_exhibitions_select on public.artwork_exhibitions
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_exhibitions.catalog_id
    )
    and exists (
      select 1 from public.exhibitions e
       where e.id = artwork_exhibitions.exhibition_id
    )
  );


-- ── 4. An artwork's document (RF-310, RF-515, RF-516) ───────
--
-- Here the decision written above is exercised: the BRIDGE disappears, not the document's
-- record. And no new storage policy is needed: the file's path
-- is in `archive_documents`, which stays visible by its own `active`,
-- and what the Reader stops knowing is which artwork it was of.

drop policy artwork_documents_select on public.artwork_documents;

create policy artwork_documents_select on public.artwork_documents
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_documents.catalog_id
    )
    and exists (
      select 1 from public.archive_documents d
       where d.id = artwork_documents.document_id
    )
  );


-- ── 5. An exhibition's document (RF-515) ────────────────────
--
-- The bridge that touches no artwork, and the one most easily forgotten precisely for
-- that reason. It inherits from both its ends just like the others: a withdrawn exhibition
-- is the wastebasket, and its documentary file with it.

drop policy exhibition_documents_select on public.exhibition_documents;

create policy exhibition_documents_select on public.exhibition_documents
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.exhibitions e
       where e.id = exhibition_documents.exhibition_id
    )
    and exists (
      select 1 from public.archive_documents d
       where d.id = exhibition_documents.document_id
    )
  );


-- ── 6. The relationship between two artworks (RF-212, RF-217) ──
--
-- BOTH artworks, with `and`. The canonicalisation trigger orders the pair, so
-- the withdrawn artwork may have ended up in either of the two columns:
-- looking at only one would hide half the relationships and leak the other
-- half. And a relationship is symmetric in its reading even if the type is not —the
-- active artwork's record shows it just the same—, so it is not enough for the
-- end being queried from to be visible.

drop policy artwork_relationships_select on public.artwork_relationships;

create policy artwork_relationships_select on public.artwork_relationships
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_relationships.from_catalog_id
    )
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = artwork_relationships.to_catalog_id
    )
  );


-- ── 7. The migration measures itself ────────────────────────
--
-- It runs INSIDE the transaction that applies the migration, so if something does not
-- add up the migration is not applied half way — and half a visibility cascade is
-- worse than none, because it looks done.
--
-- It is not measured with a `like` over the policy's text: it is measured with the
-- DEPENDENCIES PostgreSQL records for each policy, both to the tables
-- its expression names and to the COLUMNS. A string comparison passes with
-- an `exists` pointing at the correct table by the wrong column; and the
-- column dependency is the one that catches this migration's mistake: that
-- `artwork_relationships` look at a single end. With the table, an
-- `exists` over `artworks` would be enough to pass the list as good, and the withdrawn
-- artwork's relationships would go on leaking through the other side.
-- The functional part —the Reader counting zero and the Cataloguer one— belongs to the test
-- alongside, which is the only one that can authenticate.

do $$
declare
  v_expected constant text[][] := array[
    -- table                  anchors                         the select's own columns
    ['provenance_events',     'artworks',                      'catalog_id'],
    ['artwork_bibliography',  'artworks,bibliography',         'catalog_id,bibliography_id'],
    ['artwork_exhibitions',   'artworks,exhibitions',          'catalog_id,exhibition_id'],
    ['artwork_documents',     'artworks,archive_documents',    'catalog_id,document_id'],
    ['exhibition_documents',  'exhibitions,archive_documents', 'exhibition_id,document_id'],
    ['artwork_relationships', 'artworks',                      'from_catalog_id,to_catalog_id']
  ];
  v_i integer;
  v_table text;
  v_anchors text[];
  v_anchor text;
  v_found text[];
  v_columns text[];
  v_column text;
  v_used text[];
  v_cmds text[];
begin
  if array_length(v_expected, 1) <> 6 then
    raise exception 'FAIL: esta migración cubre seis tablas, la lista tiene %',
      array_length(v_expected, 1);
  end if;

  for v_i in 1 .. array_length(v_expected, 1) loop
    v_table   := v_expected[v_i][1];
    v_anchors := string_to_array(v_expected[v_i][2], ',');
    v_columns := string_to_array(v_expected[v_i][3], ',');

    -- The tables the SELECT policy names, according to pg_depend.
    select coalesce(array_agg(distinct anchor.relname order by anchor.relname), '{}')
      into v_found
      from pg_policy pol
      join pg_class target on target.oid = pol.polrelid
      join pg_depend d
        on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       and d.refclassid = 'pg_class'::regclass
      join pg_class anchor on anchor.oid = d.refobjid
     where target.relname = v_table
       and pol.polcmd = 'r'
       and anchor.relkind = 'r'
       and anchor.relname <> v_table;

    foreach v_anchor in array v_anchors loop
      if not (v_anchor = any (v_found)) then
        raise exception
          'FAIL: la política de select de public.% no depende de public.%, así que no hereda su visibilidad; nombra [%]',
          v_table, v_anchor, array_to_string(v_found, ', ');
      end if;
    end loop;

    -- And the OWN columns by which the policy ties itself to its anchors: it is what
    -- distinguishes «it inherits from both ends» from «it inherits from one».
    select coalesce(array_agg(distinct att.attname order by att.attname), '{}')
      into v_used
      from pg_policy pol
      join pg_class target on target.oid = pol.polrelid
      join pg_depend d
        on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       and d.refclassid = 'pg_class'::regclass and d.refobjid = pol.polrelid
       and d.refobjsubid > 0
      join pg_attribute att
        on att.attrelid = d.refobjid and att.attnum = d.refobjsubid
     where target.relname = v_table
       and pol.polcmd = 'r';

    foreach v_column in array v_columns loop
      if not (v_column = any (v_used)) then
        raise exception
          'FAIL: la política de select de public.% no mira su columna %, así que ese extremo no hereda nada; mira [%]',
          v_table, v_column, array_to_string(v_used, ', ');
      end if;
    end loop;

    -- And there are still exactly three policies: rewriting the select has not
    -- added a fourth nor lost one along the way (RF-111, RF-901).
    select coalesce(array_agg(cmd::text order by cmd::text), '{}')
      into v_cmds
      from pg_policies
     where schemaname = 'public' and tablename = v_table;

    if v_cmds <> array['INSERT', 'SELECT', 'UPDATE'] then
      raise exception
        'FAIL: public.% debería seguir con exactamente SELECT, INSERT y UPDATE, tiene [%]',
        v_table, array_to_string(v_cmds, ', ');
    end if;
  end loop;

  raise notice 'OK: las seis tablas documentales heredan la visibilidad de sus anclas y siguen con tres políticas';
end $$;
