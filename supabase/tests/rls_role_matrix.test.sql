-- RF-103, RF-105, RF-106, RF-109: what each role can do on artworks.
--
-- Verified by truly authenticating as a user of each role and running real
-- queries. Checking that the policy exists verifies nothing: what matters is
-- what the database returns when the request comes from whoever it comes from.
--
-- Since 20260804150000 the matrix no longer covers artworks and images alone:
-- the last section runs the same three cells over the fifteen tables of the
-- documentary catalogue, and refuses to pass if a sixteenth appears without
-- being added here.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one user per role. The auth.users trigger creates the profile.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'lec@test.local');

update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9001', 'ROTILI', 'Obra activa de prueba', 'UNCONFIRMED');

insert into public.artworks (catalog_id, artist, title, attributed_title, active)
values ('AR-9002', 'ROTILI', 'Obra de baja de prueba', 'UNCONFIRMED', false);

-- A third ACTIVE artwork, and it is not decoration. Since 20260805130000 a
-- documentary row is only visible if its anchors are, so a fixture that hangs
-- from AR-9002 is hidden for TWO reasons at once and no longer isolates what its
-- own `active` decides. The trashed rows of the bridges below hang from here, so
-- that the only thing being asserted is the row's own state; the cell about the
-- artwork in the trash has its own section at the foot of this file.
insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9003', 'ROTILI', 'Segunda obra activa de prueba', 'UNCONFIRMED');

-- ── Cataloger ────────────────────────────────────────────────

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  -- RF-906: whoever can edit also sees the trash.
  select count(*) into v_n from public.artworks where catalog_id in ('AR-9001', 'AR-9002');
  if v_n <> 2 then
    raise exception 'FAIL: the cataloger should see the active and the deactivated artwork, sees %', v_n;
  end if;

  -- RF-103: can create.
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Alta del catalogador', 'UNCONFIRMED');

  -- RF-103: can edit what someone else created.
  update public.artworks set title = 'Editada por el catalogador' where catalog_id = 'AR-9001';

  raise notice 'OK: the cataloger reads trash included, creates and edits';
end $$;

reset role;

-- ── Reader ───────────────────────────────────────────────────

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  -- RF-105: reads active artworks.
  select count(*) into v_n from public.artworks where catalog_id = 'AR-9001';
  if v_n <> 1 then
    raise exception 'FAIL: the reader should see the active artwork';
  end if;

  -- RF-609: does not see deactivated ones.
  select count(*) into v_n from public.artworks where catalog_id = 'AR-9002';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees a deactivated record';
  end if;

  raise notice 'OK: the reader sees active artworks and not the trash';
end $$;

reset role;

-- RF-106: the reader does not write. Checked by attacking the database
-- directly, not by looking at whether the interface hides the button: a hidden
-- button is not a protection.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Alta indebida del lector', 'UNCONFIRMED');
  raise exception 'FAIL: the reader could create an artwork';
exception
  when insufficient_privilege then
    raise notice 'OK: the reader cannot create';
end $$;

reset role;

do $$
declare v_affected integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set title = 'Edición indebida' where catalog_id = 'AR-9001';
  get diagnostics v_affected = row_count;
  -- An UPDATE the USING policy hides does not fail: it affects no row. That
  -- silence is the correct behavior, and it must be asserted.
  if v_affected <> 0 then
    raise exception 'FAIL: the reader modified % row(s)', v_affected;
  end if;
  raise notice 'OK: the reader''s update affects no rows';
end $$;

reset role;

-- RF-901: nobody deletes, not even those who can edit.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;
  delete from public.artworks where catalog_id = 'AR-9001';
  raise exception 'FAIL: an artwork could really be deleted';
exception
  when insufficient_privilege then
    raise notice 'OK: real deletion is denied even to the cataloger';
end $$;

reset role;

-- ── The colour of a photo, its provenance and its file date ───
--
-- RF-106, RF-414, RF-417, RF-418. Twenty-one columns were added to public.images,
-- and a new column is new writable surface: no policy was written for them on
-- purpose —whoever may edit a photo may edit its colour— so what has to be proven
-- is that the existing images_update (can_edit()) already covers every one of
-- them. Reading the migration proves nothing; this authenticates for real.
--
-- The photo is a BACK shot so that colour_gray is coherent with what the
-- interface offers there. The database has no rule about that, and this test is
-- not the place to imply one.
insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
values ('AR-9001', 'r/min.webp', 'r/der.webp', 'r/master.jpg', 'BACK');

do $$
declare v_row public.images;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  -- All twenty-one at once, which is the point: not a sample of them.
  update public.images set
    color_temperature = -18, color_tint = 6, color_exposure = 0.33,
    color_black = 8, color_white = 250, color_gamma = 1.10, color_shoulder = 25,
    color_gray = true,
    color_neutral_x = 0.32000, color_neutral_y = 0.71500,
    color_clipped_low = 0.12, color_clipped_high = 1.40,
    color_source = 'NEUTRAL_PICKED', color_reference = 'TARGET_CARD',
    color_light = 'INCANDESCENT', color_inherited = true,
    file_photo_date = '2022-10-09', file_photo_date_exact = false,
    original_width = 4000, original_height = 2252,
    provenance = 'OTHER_CATALOG'
   where image_id = 'AR-9001_v1'
  returning * into v_row;

  if v_row.color_temperature <> -18 or v_row.color_source <> 'NEUTRAL_PICKED'
     or v_row.provenance <> 'OTHER_CATALOG' or v_row.file_photo_date <> '2022-10-09'
     or v_row.original_width <> 4000 or not v_row.color_gray
     or not v_row.color_inherited or v_row.color_neutral_x <> 0.32000 then
    raise exception 'FAIL: the cataloger could not write the colour of a photo';
  end if;

  raise notice 'OK: the cataloger writes colour, provenance and file date';
end $$;

reset role;

-- RF-106: the reader writes none of the twenty-one. Attacked directly against
-- the database, with the same statement the cataloger just ran: an UPDATE the
-- USING policy hides does not fail, it affects no row, and that silence is what
-- has to be asserted — otherwise the test would pass on a table with no policy
-- at all.
do $$
declare v_affected integer; v_row public.images;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  update public.images set
    color_temperature = 60, color_tint = -40, color_exposure = -2.00,
    color_black = 64, color_white = 192, color_gamma = 0.60, color_shoulder = 100,
    color_gray = false,
    color_neutral_x = 0.90000, color_neutral_y = 0.90000,
    color_clipped_low = 99.99, color_clipped_high = 99.99,
    color_source = 'MANUAL', color_reference = 'NONE',
    color_light = 'FLASH', color_inherited = false,
    file_photo_date = '1999-01-01', file_photo_date_exact = true,
    original_width = 1, original_height = 1,
    provenance = 'THIRD_PARTY'
   where image_id = 'AR-9001_v1';
  get diagnostics v_affected = row_count;

  reset role;
  if v_affected <> 0 then
    raise exception 'FAIL: the reader modified the colour of % row(s)', v_affected;
  end if;

  -- And the row still holds what the cataloger wrote, checked outside the
  -- reader's session: row_count alone would not catch a policy that let the
  -- write through and hid the row afterwards.
  select * into v_row from public.images where image_id = 'AR-9001_v1';
  if v_row.color_temperature <> -18 or v_row.color_source <> 'NEUTRAL_PICKED'
     or v_row.provenance <> 'OTHER_CATALOG' or v_row.file_photo_date <> '2022-10-09'
     or v_row.original_width <> 4000 or not v_row.color_gray then
    raise exception 'FAIL: the reader''s update left something written';
  end if;

  raise notice 'OK: the reader writes none of the twenty-one new columns';
end $$;

reset role;

-- And the reader cannot smuggle colour in through a new photo either.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, color_temperature)
  values ('AR-9001', 'r/min2.webp', 'r/der2.webp', 'r/master2.jpg', 40);
  raise exception 'FAIL: the reader could add a photo with colour';
exception
  when insufficient_privilege then
    raise notice 'OK: the reader cannot add a photo, with or without colour';
end $$;

reset role;

-- ── The documentary catalogue raisonné: fifteen more tables ───
--
-- RF-109. Until here this matrix covered two tables, `artworks` and `images`. The
-- six groups of 20260804 added fifteen —people and institutions, the provenance
-- chain, bibliography, exhibitions, archive and the relationships between
-- artworks— and their policies are in 20260804150000. A role matrix that
-- stops at two tables stops being a matrix.
--
-- All fifteen are walked and not a sample, because the failure to be caught is
-- exactly that of the table that was left out. The table-by-table perimeter
-- —privileges measured, creations, withdrawals, link functions— is in
-- `documentary_policies.test.sql`; here go the matrix's three cells: what
-- each role reads, what it writes and what it sees of the wastebasket.

insert into public.parties (id, party_type, name, contact) values
  ('ac000001-0000-4000-8000-000000000001', 'INSTITUTION',
   'Museo de la matriz de prueba', 'contacto-matriz@test.local'),
  ('ac000001-0000-4000-8000-000000000002', 'PERSON',
   'Coleccionista de la matriz, retirado', 'privado-matriz@test.local');

insert into public.provenance_events (id, catalog_id, party_note) values
  ('ac000002-0000-4000-8000-000000000001', 'AR-9001', 'Colección privada, España'),
  ('ac000002-0000-4000-8000-000000000002', 'AR-9001', 'Eslabón retirado de la matriz');

insert into public.publication_types (id, name) values
  ('ac000003-0000-4000-8000-000000000001', 'Tipo de publicación de la matriz'),
  ('ac000003-0000-4000-8000-000000000002', 'Tipo de publicación de la matriz, retirado');

insert into public.bibliography (id, title) values
  ('ac000004-0000-4000-8000-000000000001', 'Referencia de la matriz'),
  ('ac000004-0000-4000-8000-000000000002', 'Referencia de la matriz, retirada');

insert into public.artwork_bibliography (id, catalog_id, bibliography_id, pages) values
  ('ac000005-0000-4000-8000-000000000001', 'AR-9001',
   'ac000004-0000-4000-8000-000000000001', 'pp. 7-9'),
  ('ac000005-0000-4000-8000-000000000002', 'AR-9003',
   'ac000004-0000-4000-8000-000000000001', 'p. 40');

insert into public.exhibition_venues (id, name, locality) values
  ('ac000006-0000-4000-8000-000000000001', 'Sala de la matriz', 'Badajoz'),
  ('ac000006-0000-4000-8000-000000000002', 'Sala de la matriz, cerrada', 'Badajoz');

insert into public.exhibitions (id, title, year) values
  ('ac000007-0000-4000-8000-000000000001', 'Muestra de la matriz', 1985),
  ('ac000007-0000-4000-8000-000000000002', 'Muestra de la matriz, retirada', 1986);

insert into public.artwork_exhibitions (id, catalog_id, exhibition_id, catalogue_number) values
  ('ac000008-0000-4000-8000-000000000001', 'AR-9001',
   'ac000007-0000-4000-8000-000000000001', 'cat. 4'),
  ('ac000008-0000-4000-8000-000000000002', 'AR-9003',
   'ac000007-0000-4000-8000-000000000001', 'cat. 5');

insert into public.document_types (id, name) values
  ('ac000009-0000-4000-8000-000000000001', 'Tipo de documento de la matriz'),
  ('ac000009-0000-4000-8000-000000000002', 'Tipo de documento de la matriz, retirado');

insert into public.archive_series (id, name) values
  ('ac00000a-0000-4000-8000-000000000001', 'Fondo de la matriz'),
  ('ac00000a-0000-4000-8000-000000000002', 'Fondo de la matriz, retirado');

insert into public.archive_documents (id, title) values
  ('ac00000b-0000-4000-8000-000000000001', 'Recorte de la matriz'),
  ('ac00000b-0000-4000-8000-000000000002', 'Recorte de la matriz, retirado');

insert into public.artwork_documents (id, catalog_id, document_id) values
  ('ac00000c-0000-4000-8000-000000000001', 'AR-9001', 'ac00000b-0000-4000-8000-000000000001'),
  ('ac00000c-0000-4000-8000-000000000002', 'AR-9003', 'ac00000b-0000-4000-8000-000000000001');

insert into public.exhibition_documents (id, exhibition_id, document_id) values
  ('ac00000d-0000-4000-8000-000000000001', 'ac000007-0000-4000-8000-000000000001',
   'ac00000b-0000-4000-8000-000000000001'),
  ('ac00000d-0000-4000-8000-000000000002', 'ac000007-0000-4000-8000-000000000002',
   'ac00000b-0000-4000-8000-000000000001');

insert into public.artwork_relationship_types (id, name, inverse_name, is_symmetric) values
  ('ac00000e-0000-4000-8000-000000000001', 'Matriz simétrica de', '', true),
  ('ac00000e-0000-4000-8000-000000000002', 'Matriz retirada de', '', true);

insert into public.artwork_relationships (id, from_catalog_id, to_catalog_id, relationship_type_id) values
  ('ac00000f-0000-4000-8000-000000000001', 'AR-9001', 'AR-9003',
   'ac00000e-0000-4000-8000-000000000001'),
  ('ac00000f-0000-4000-8000-000000000002', 'AR-9001', 'AR-9003',
   'ac00000e-0000-4000-8000-000000000002');

-- Each table's second row is sent to the wastebasket, which is the only way
-- of withdrawing something in this catalogue (RF-901).
update public.parties                    set active = false where id = 'ac000001-0000-4000-8000-000000000002';
update public.provenance_events          set active = false where id = 'ac000002-0000-4000-8000-000000000002';
update public.publication_types          set active = false where id = 'ac000003-0000-4000-8000-000000000002';
update public.bibliography               set active = false where id = 'ac000004-0000-4000-8000-000000000002';
update public.artwork_bibliography       set active = false where id = 'ac000005-0000-4000-8000-000000000002';
update public.exhibition_venues          set active = false where id = 'ac000006-0000-4000-8000-000000000002';
update public.exhibitions                set active = false where id = 'ac000007-0000-4000-8000-000000000002';
update public.artwork_exhibitions        set active = false where id = 'ac000008-0000-4000-8000-000000000002';
update public.document_types             set active = false where id = 'ac000009-0000-4000-8000-000000000002';
update public.archive_series             set active = false where id = 'ac00000a-0000-4000-8000-000000000002';
update public.archive_documents          set active = false where id = 'ac00000b-0000-4000-8000-000000000002';
update public.artwork_documents          set active = false where id = 'ac00000c-0000-4000-8000-000000000002';
update public.exhibition_documents       set active = false where id = 'ac00000d-0000-4000-8000-000000000002';
-- The order matters: a relationship type in use is not withdrawn while the
-- relationship is still active, and that guardrail belongs to group 6's migration.
update public.artwork_relationships      set active = false where id = 'ac00000f-0000-4000-8000-000000000002';
update public.artwork_relationship_types set active = false where id = 'ac00000e-0000-4000-8000-000000000002';

-- ── The cataloger: reads everything, trash included, and writes ──
--
-- RF-103, RF-906. The list of the fifteen is contrasted against the system
-- catalog first, so that the day somebody adds table number sixteen without a
-- policy this matrix says so instead of ignoring it.
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
  v_prefixes constant text[] := array[
    'ac000001', 'ac000002', 'ac000003', 'ac000004', 'ac000005',
    'ac000006', 'ac000007', 'ac000008', 'ac000009', 'ac00000a',
    'ac00000b', 'ac00000c', 'ac00000d', 'ac00000e', 'ac00000f'
  ];
  v_missing text[];
  i integer;
  v_n integer;
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname <> all (v_tables)
     and c.relname not in ('artworks', 'images', 'profiles',
                           'artwork_types', 'series', 'physical_places',
                           '_migraciones',
                           -- Covered by its own section at the foot of this
                           -- file: `external_links` is not one of the fifteen
                           -- and its rows hang from an anchor, so it does not
                           -- fit the `id`-only walk these loops do.
                           'external_links',
                           -- Also covered at the foot, and it is the one table
                           -- of the schema whose row of this matrix is almost
                           -- all zeros: nobody writes the change log, so the
                           -- loops below —which insert, update and expect the
                           -- cataloger to succeed— would assert the opposite of
                           -- what this table needs.
                           'change_log',
                           -- Covered by `artist_funds.test.sql`, and it cannot
                           -- join these loops: they insert a row per table and
                           -- expect the cataloger to succeed, while this table
                           -- grants no insert at all — a fund is the axis of its
                           -- artworks' identifiers, so it is created by
                           -- migration and never from the application.
                           'artist_funds');
  if array_length(v_missing, 1) > 0 then
    raise exception 'FAIL: this matrix does not cover these public tables: %',
      array_to_string(v_missing, ', ');
  end if;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  for i in 1 .. array_length(v_tables, 1) loop
    execute format(
      'select count(*) from public.%I where id in (%L, %L)',
      v_tables[i],
      v_prefixes[i] || '-0000-4000-8000-000000000001',
      v_prefixes[i] || '-0000-4000-8000-000000000002')
      into v_n;
    if v_n <> 2 then
      raise exception 'FAIL: the cataloger should see the active row and the trashed one of public.%, sees %',
        v_tables[i], v_n;
    end if;
  end loop;

  raise notice 'OK: the cataloger reads the fifteen documentary tables, trash included';
end $$;

reset role;


-- ── The reader: reads what is active, and only that ──────────
--
-- RF-105, RF-906.
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
  v_prefixes constant text[] := array[
    'ac000001', 'ac000002', 'ac000003', 'ac000004', 'ac000005',
    'ac000006', 'ac000007', 'ac000008', 'ac000009', 'ac00000a',
    'ac00000b', 'ac00000c', 'ac00000d', 'ac00000e', 'ac00000f'
  ];
  i integer;
  v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  for i in 1 .. array_length(v_tables, 1) loop
    execute format('select count(*) from public.%I where id = %L',
                   v_tables[i], v_prefixes[i] || '-0000-4000-8000-000000000001')
      into v_n;
    if v_n <> 1 then
      raise exception 'FAIL: the reader does not see the active row of public.%', v_tables[i];
    end if;

    execute format('select count(*) from public.%I where id = %L',
                   v_tables[i], v_prefixes[i] || '-0000-4000-8000-000000000002')
      into v_n;
    if v_n <> 0 then
      raise exception 'FAIL: the reader sees the trashed row of public.%', v_tables[i];
    end if;
  end loop;

  raise notice 'OK: the reader reads the fifteen documentary tables and none of their trash';
end $$;

reset role;


-- ── The reader writes nothing, in any of the fifteen ─────────
--
-- RF-106, attacked straight at the database. Two things are asserted and both
-- are needed: that the INSERT is refused, and that the UPDATE affects no row —
-- an UPDATE the USING clause hides does not fail, it is silent, and that
-- silence is the whole behavior. Whether anything was left written is checked
-- OUTSIDE the reader's session, right below: row_count alone would not catch a
-- policy that let the write through and hid the row afterwards.
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
  v_prefixes constant text[] := array[
    'ac000001', 'ac000002', 'ac000003', 'ac000004', 'ac000005',
    'ac000006', 'ac000007', 'ac000008', 'ac000009', 'ac00000a',
    'ac00000b', 'ac00000c', 'ac00000d', 'ac00000e', 'ac00000f'
  ];
  i integer;
  v_affected integer;
begin
  for i in 1 .. array_length(v_tables, 1) loop
    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
    set local role authenticated;
    execute format('update public.%I set active = false where id = %L',
                   v_tables[i], v_prefixes[i] || '-0000-4000-8000-000000000001');
    get diagnostics v_affected = row_count;
    reset role;

    if v_affected <> 0 then
      raise exception 'FAIL: the reader modified % row(s) of public.%', v_affected, v_tables[i];
    end if;
  end loop;
  raise notice 'OK: the reader''s update affects no rows in any of the fifteen';
end $$;

reset role;

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
  v_prefixes constant text[] := array[
    'ac000001', 'ac000002', 'ac000003', 'ac000004', 'ac000005',
    'ac000006', 'ac000007', 'ac000008', 'ac000009', 'ac00000a',
    'ac00000b', 'ac00000c', 'ac00000d', 'ac00000e', 'ac00000f'
  ];
  i integer;
  v_active boolean;
begin
  for i in 1 .. array_length(v_tables, 1) loop
    execute format('select active from public.%I where id = %L',
                   v_tables[i], v_prefixes[i] || '-0000-4000-8000-000000000001')
      into v_active;
    if not v_active then
      raise exception 'FAIL: the reader''s update left something written in public.%', v_tables[i];
    end if;
  end loop;
  raise notice 'OK: nothing the reader tried was written, checked outside their session';
end $$;

-- And the reader creates nothing either. One insert per table, minimal and
-- legal, so that what refuses it is the policy and not a check constraint.
do $$
declare
  v_inserts constant text[] := array[
    $q$insert into public.parties (party_type, name) values ('PERSON', 'Alta indebida del lector')$q$,
    $q$insert into public.provenance_events (catalog_id, party_note) values ('AR-9001', 'Eslabón indebido')$q$,
    $q$insert into public.publication_types (name) values ('Tipo indebido del lector')$q$,
    $q$insert into public.bibliography (title) values ('Referencia indebida del lector')$q$,
    $q$insert into public.artwork_bibliography (catalog_id, bibliography_id)
       values ('AR-9001', 'ac000004-0000-4000-8000-000000000002')$q$,
    $q$insert into public.exhibition_venues (name, locality) values ('Sede indebida', 'Mérida')$q$,
    $q$insert into public.exhibitions (title, year) values ('Muestra indebida', 1988)$q$,
    $q$insert into public.artwork_exhibitions (catalog_id, exhibition_id)
       values ('AR-9001', 'ac000007-0000-4000-8000-000000000002')$q$,
    $q$insert into public.document_types (name) values ('Tipo de documento indebido')$q$,
    $q$insert into public.archive_series (name) values ('Fondo indebido del lector')$q$,
    $q$insert into public.archive_documents (title) values ('Documento indebido del lector')$q$,
    $q$insert into public.artwork_documents (catalog_id, document_id)
       values ('AR-9001', 'ac00000b-0000-4000-8000-000000000002')$q$,
    $q$insert into public.exhibition_documents (exhibition_id, document_id)
       values ('ac000007-0000-4000-8000-000000000001', 'ac00000b-0000-4000-8000-000000000002')$q$,
    $q$insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
       values ('Matriz indebida de', '', true)$q$,
    $q$insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
       values ('AR-9002', 'AR-9001', 'ac00000e-0000-4000-8000-000000000001')$q$
  ];
  i integer;
begin
  for i in 1 .. array_length(v_inserts, 1) loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
      set local role authenticated;
      execute v_inserts[i];
      reset role;
      raise exception 'FAIL: the reader could insert: %', v_inserts[i];
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: the reader creates nothing in any of the fifteen (RF-106)';
end $$;

reset role;


-- ── The one row of this matrix that is about a third party ───
--
-- RF-105 decides in writing that the Reader sees `parties.contact`, and that is
-- the phone number or the email of a private collector: somebody who is not the
-- studio and never agreed to anything. If a policy is written wrong here, what
-- leaks is not the catalog, it is a stranger's contact details. So it is
-- exercised in both directions and the writing is verified from outside.
do $$
declare v_contact text; v_affected integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  select contact into v_contact from public.parties
   where id = 'ac000001-0000-4000-8000-000000000001';
  if v_contact is distinct from 'contacto-matriz@test.local' then
    raise exception 'FAIL: the reader should read the contact of an active party (RF-105), reads [%]',
      coalesce(v_contact, '(nothing)');
  end if;

  -- And of a party in the trash, nothing at all, not even by searching for it.
  select count(*) into v_affected from public.parties
   where contact = 'privado-matriz@test.local';
  if v_affected <> 0 then
    raise exception 'FAIL: the reader sees the contact of a trashed party';
  end if;

  update public.parties set contact = 'secuestrado@test.local'
   where id = 'ac000001-0000-4000-8000-000000000001';
  get diagnostics v_affected = row_count;
  reset role;

  if v_affected <> 0 then
    raise exception 'FAIL: the reader wrote the contact of % party row(s)', v_affected;
  end if;

  select contact into v_contact from public.parties
   where id = 'ac000001-0000-4000-8000-000000000001';
  if v_contact <> 'contacto-matriz@test.local' then
    raise exception 'FAIL: the reader''s update left the contact written as [%]', v_contact;
  end if;

  raise notice 'OK: the reader reads the contact of an active party and cannot write it (RF-105, RF-106)';
end $$;

reset role;


-- ── The cataloger does what is theirs to do ──────────────────
--
-- RF-103. Without this the three blocks above would pass on fifteen tables with
-- no policy at all, which is exactly the state these tables were in before
-- 20260804150000: closed for everyone, useless for everyone.
do $$
declare v_row public.parties;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  insert into public.parties (party_type, name, contact)
  values ('INSTITUTION', 'Alta del catalogador en la matriz', 'alta@test.local')
  returning * into v_row;

  update public.parties set contact = 'corregido@test.local' where id = v_row.id;

  -- Retiring is an UPDATE of `active`, and it must leave a trace of who and when.
  update public.parties set active = false where id = v_row.id;

  reset role;

  select * into v_row from public.parties where id = v_row.id;
  if v_row.contact <> 'corregido@test.local' or v_row.active
     or v_row.deactivated_by <> '00000000-0000-0000-0000-0000000000c1'::uuid
     or v_row.created_by <> '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: the cataloger could not create, edit and retire a party';
  end if;

  raise notice 'OK: the cataloger creates, edits and retires, with authorship sealed by the database';
end $$;

reset role;


-- ── And the anonymous role reaches none of the fifteen ───────
--
-- RF-101. There is no public area, and the anonymous key travels inside
-- everybody's browser.
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
  i integer;
begin
  for i in 1 .. array_length(v_tables, 1) loop
    begin
      set local role anon;
      execute format('select 1 from public.%I limit 1', v_tables[i]);
      reset role;
      raise exception 'FAIL: the anonymous role could query public.%', v_tables[i];
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: the anonymous role has no access to any of the fifteen';
end $$;

reset role;


-- ── The external links: the same matrix, with one more turn ───
--
-- RF-105, RF-106, RF-109, RF-609, RF-1401. `external_links` is not one of the
-- fifteen and does not fit in the loops above: its rows do not identify themselves,
-- they hang from a record, and from there comes the cell this table adds to the matrix
-- and that no other has — WHAT EACH ROLE SEES DEPENDS ON WHAT IT SEES OF THE ANCHOR
-- RECORD. The complete perimeter is in `external_links.test.sql`; here go the
-- usual three cells plus that fourth.

insert into public.external_links (id, artwork_id, url, title) values
  ('ac000010-0000-4000-8000-000000000001', 'AR-9001',
   'https://www.macvac.es/obra/matriz-activa/', 'Enlace activo de la matriz'),
  ('ac000010-0000-4000-8000-000000000002', 'AR-9001',
   'https://www.macvac.es/obra/matriz-retirada/', 'Enlace retirado de la matriz'),
  -- That of an artwork that is in the wastebasket: the reader must not even find out
  -- that it exists (RF-609).
  ('ac000010-0000-4000-8000-000000000003', 'AR-9002',
   'https://www.macvac.es/obra/matriz-de-obra-retirada/', 'Enlace de una obra retirada');

insert into public.external_links (id, image_id, url, title) values
  ('ac000010-0000-4000-8000-000000000004', 'AR-9001_v1',
   'https://www.macvac.es/foto/matriz/', 'De dónde salió esta reproducción');

update public.external_links set active = false
 where id = 'ac000010-0000-4000-8000-000000000002';

-- The cataloger reads all four, trash included (RF-906).
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.external_links
   where id::text like 'ac000010-%';
  reset role;

  if v_n <> 4 then
    raise exception 'FAIL: the cataloger should see the four external links, sees %', v_n;
  end if;
  raise notice 'OK: the cataloger reads every external link, trash and hidden anchors included';
end $$;

reset role;

-- The reader reads the active one of an active anchor, and only that: not the
-- trashed link, and not the link of an artwork in the trash. That last one is
-- the cell this table adds — the visibility is inherited from the anchor's own
-- policy, so it is not a copy of the rule but the rule itself.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.external_links
   where id = 'ac000010-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'FAIL: the reader does not see the active link of an active artwork (RF-105)';
  end if;

  select count(*) into v_n from public.external_links
   where id = 'ac000010-0000-4000-8000-000000000004';
  if v_n <> 1 then
    raise exception 'FAIL: the reader does not see the link of an active photograph (RF-105)';
  end if;

  select count(*) into v_n from public.external_links
   where id = 'ac000010-0000-4000-8000-000000000002';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees a trashed external link (RF-906)';
  end if;

  select count(*) into v_n from public.external_links
   where id = 'ac000010-0000-4000-8000-000000000003';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees the link of an artwork in the trash (RF-609)';
  end if;

  reset role;
  raise notice 'OK: the reader reads the active links of what they may see, and nothing else (RF-105, RF-609, RF-906)';
end $$;

reset role;

-- The reader writes nothing: no insert, and an update that affects no row. What
-- was left written is checked OUTSIDE their session, because row_count alone
-- does not tell «did not write» from «wrote and then had it hidden».
do $$
declare v_affected integer; v_title text; v_url text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  update public.external_links
     set title = 'Secuestrado por el lector', url = 'https://evil.example/obra'
   where id = 'ac000010-0000-4000-8000-000000000001';
  get diagnostics v_affected = row_count;
  reset role;

  if v_affected <> 0 then
    raise exception 'FAIL: the reader modified % external link row(s)', v_affected;
  end if;

  select title, url into v_title, v_url from public.external_links
   where id = 'ac000010-0000-4000-8000-000000000001';
  if v_title <> 'Enlace activo de la matriz'
     or v_url <> 'https://www.macvac.es/obra/matriz-activa/' then
    raise exception 'FAIL: the reader''s update left something written on an external link';
  end if;

  raise notice 'OK: the reader writes nothing on an external link, checked outside their session (RF-106)';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  insert into public.external_links (artwork_id, url)
  values ('AR-9001', 'https://alta.example/indebida-de-la-matriz');
  reset role;
  raise exception 'FAIL: the reader could insert an external link (RF-106)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: the reader creates no external link (RF-106)';
end $$;

reset role;

-- And the cataloger does what is theirs: creates, classifies, retires and
-- restores. Without this the three blocks above would pass on a table closed to
-- everyone.
do $$
declare v_row public.external_links;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  insert into public.external_links (artwork_id, url)
  values ('AR-9001', 'https://prensa.example/matriz-del-catalogador')
  returning * into v_row;

  update public.external_links set link_type = 'PRESS', title = 'Recorte de prensa'
   where id = v_row.id;
  update public.external_links set active = false where id = v_row.id;

  reset role;

  select * into v_row from public.external_links where id = v_row.id;
  if v_row.link_type <> 'PRESS' or v_row.active
     or v_row.deactivated_by <> '00000000-0000-0000-0000-0000000000c1'::uuid
     or v_row.created_by <> '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: the cataloger could not create, classify and retire an external link';
  end if;

  raise notice 'OK: the cataloger creates, classifies and retires external links, authorship sealed by the database';
end $$;

reset role;

-- And the anonymous role does not reach them either (RF-101).
do $$
begin
  set local role anon;
  perform 1 from public.external_links limit 1;
  reset role;
  raise exception 'FAIL: the anonymous role could query public.external_links';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: the anonymous role has no access to the external links';
end $$;

reset role;


-- ── The link nobody created, and somebody else's reproduction ──
--
-- RF-105, RF-106, RF-417, RF-1401, RF-1407. The cell 20260805110000's move
-- adds is not a new permission: it is A SHAPE OF ROW THAT DID NOT EXIST
-- BEFORE. The four links the migration pulled out of two inventory
-- notes have `created_by` NULL, because `tg_row_audit` signs with
-- `auth.uid()` and inside a migration `auth.uid()` is nobody. Null is the
-- truth: that row was created by no person.
--
-- And that shape of row is exactly the one that would break a policy written with the
-- usual temptation —«you see what you created»—: in production there are four rows
-- nobody created, so such a policy would hide them from everybody and the
-- move would have taken the addresses out of the note to put them in a closed
-- drawer. It is checked by authenticating for real, not by reading the policy.
--
-- The second half is RF-1407's pair: a photograph said to be somebody else's PLUS its source
-- link. Both halves were written by the same migration and the Reader has to be able
-- to read both, because the photograph's screen shows them
-- together; and neither of the two can be touched.

-- With no session, like the migration, and it has to be asked for EXPLICITLY: `reset role`
-- gives back the role but does not clear the `request.jwt.claims` the last
-- `set local` left in place, so by this point in the file `auth.uid()` still returns
-- the reader. Emptying the claim is what really reproduces a
-- migration's situation —nobody has logged in— and without this line the row would be born
-- signed and this block would be testing nothing.
set local request.jwt.claims = '';

insert into public.external_links (id, image_id, url, title, link_type, note) values
  ('ac000020-0000-4000-8000-000000000001', 'AR-9001_v1',
   'https://www.macvac.es/obra/origen-de-la-matriz/',
   'De dónde salió esta reproducción', 'PHOTO_SOURCE',
   'De aquí salen todos los datos catalográficos de la ficha, incluida la fotografía.');

do $$
declare v_row public.external_links;
begin
  select * into v_row from public.external_links
   where id = 'ac000020-0000-4000-8000-000000000001';

  if v_row.created_by is not null then
    raise exception 'FAIL: a link inserted without a session got an author invented for it';
  end if;
  if v_row.check_status is not null or v_row.checked_at is not null then
    raise exception 'FAIL: a migrated link was born already checked (RF-1405)';
  end if;
  raise notice 'OK: a link written without a session is unsigned and unchecked, which is the truth (RF-1405)';
end $$;

-- The reader reads the unsigned link and the provenance of the photograph it
-- documents. `AR-9001_v1` was marked OTHER_CATALOG by the cataloger further up in
-- this file, so this is the complete RF-1407 pair: «not mine, and here is where it
-- came from».
do $$
declare v_n integer; v_proc public.photo_provenance; v_title text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.external_links
   where id = 'ac000020-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'FAIL: the reader does not see a link that nobody created — a migrated row is invisible (RF-105)';
  end if;

  select title into v_title from public.external_links
   where id = 'ac000020-0000-4000-8000-000000000001';
  select provenance into v_proc from public.images where image_id = 'AR-9001_v1';
  reset role;

  if v_proc <> 'OTHER_CATALOG' or v_title is null then
    raise exception 'FAIL: the reader cannot read both halves of the RF-1407 pair';
  end if;

  raise notice 'OK: the reader reads the unsigned link and the provenance it documents, both halves of the pair (RF-1407)';
end $$;

reset role;

-- The reader cannot retire it: the origin of a reproduction is not theirs to
-- withdraw. Checked outside their session, because an update the USING policy
-- hides affects no row and does not fail.
do $$
declare v_affected integer; v_active boolean;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  update public.external_links set active = false
   where id = 'ac000020-0000-4000-8000-000000000001';
  get diagnostics v_affected = row_count;
  reset role;

  select active into v_active from public.external_links
   where id = 'ac000020-0000-4000-8000-000000000001';

  if v_affected <> 0 or not v_active then
    raise exception 'FAIL: the reader retired the origin link of a reproduction (RF-106, RF-1406)';
  end if;
  raise notice 'OK: the reader does not retire the origin of a reproduction (RF-106, RF-1406)';
end $$;

reset role;

-- And the cataloger completes it: they may classify and re-title a row nobody
-- created, and doing so does NOT invent an author for its creation. `created_by`
-- stays null —nobody created it— while `updated_by` becomes theirs, which is the
-- only one of the two that is true.
do $$
declare v_row public.external_links;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  update public.external_links
     set title = 'Ficha en el MACVA', note = 'Origen confirmado con la obra delante'
   where id = 'ac000020-0000-4000-8000-000000000001';

  reset role;

  select * into v_row from public.external_links
   where id = 'ac000020-0000-4000-8000-000000000001';

  if v_row.title <> 'Ficha en el MACVA' then
    raise exception 'FAIL: the cataloger could not edit a link that nobody created';
  end if;
  if v_row.created_by is not null then
    raise exception 'FAIL: editing a migrated link invented an author for its creation (RF-801)';
  end if;
  if v_row.updated_by <> '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: editing a link did not record who edited it (RF-801)';
  end if;

  raise notice 'OK: the cataloger completes a migrated link; nobody becomes its creator and the editor is recorded (RF-801)';
end $$;

reset role;


-- ── The change log: the matrix row that is almost all zeros ──
--
-- RF-105, RF-106, RF-109, RF-609, RF-1504, RF-1506. `change_log` does not fit in the
-- loops above and not because of its shape, but because its row of this matrix says the
-- opposite of every other one's: the Cataloguer does NOT write either. In the
-- rest of the schema the matrix is «whoever edits, edits»; here whoever edits is the
-- AUDITED, and a log the audited can touch is not a log.
--
-- The complete perimeter —the two padlocks, the four verbs, the panel's role—
-- is in `change_log.test.sql`. Here go the matrix's cells: what each
-- role reads and what it writes, which in this table is nothing.

insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
values ('AR-9001', 'm/min-hist.webp', 'm/der-hist.webp', 'm/master-hist.jpg', 'BACK');
update public.images set active = false where image_id = 'AR-9001_v2';

-- Writing a fixture here costs a disabled trigger, and that IS the result this
-- table was built for. It goes back on immediately.
alter table public.change_log disable trigger change_log_insert_guard;

insert into public.change_log
  (change_id, entity, row_key, catalog_id, operation, column_name, old_value, new_value, changed_by)
values
  ('ac000030-0000-4000-8000-000000000001', 'ARTWORK', 'AR-9001', 'AR-9001',
   'UPDATE', 'title', 'Antes', 'Después', '00000000-0000-0000-0000-0000000000c1'),
  -- The history of an artwork in the trash: the reader must not even learn it
  -- exists (RF-609).
  ('ac000030-0000-4000-8000-000000000002', 'ARTWORK', 'AR-9002', 'AR-9002',
   'DEACTIVATE', 'active', 'true', 'false', '00000000-0000-0000-0000-0000000000c1'),
  ('ac000030-0000-4000-8000-000000000003', 'IMAGE', 'AR-9001_v1', 'AR-9001',
   'CREATE', null, null, null, '00000000-0000-0000-0000-0000000000c1'),
  -- And the history of a RETIRED photograph of an artwork that is active: the
  -- cell that a policy written «per artwork» would have leaked.
  ('ac000030-0000-4000-8000-000000000004', 'IMAGE', 'AR-9001_v2', 'AR-9001',
   'DEACTIVATE', 'active', 'true', 'false', '00000000-0000-0000-0000-0000000000c1');

alter table public.change_log enable trigger change_log_insert_guard;

-- The cataloger reads all four, trash included (RF-906).
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.change_log
   where change_id::text like 'ac000030-%';
  reset role;

  if v_n <> 4 then
    raise exception 'FAIL: the cataloger should see the four change log rows, sees %', v_n;
  end if;
  raise notice 'OK: the cataloger reads the whole history, trash included (RF-906, RF-1506)';
end $$;

reset role;

-- The reader reads the history of what they may see, and only that. The
-- visibility is inherited from the audited row''s own policy, so it is not a copy
-- of the rule but the rule itself.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.change_log
   where change_id = 'ac000030-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'FAIL: the reader does not see the history of an active artwork (RF-105, RF-1506)';
  end if;

  select count(*) into v_n from public.change_log
   where change_id = 'ac000030-0000-4000-8000-000000000003';
  if v_n <> 1 then
    raise exception 'FAIL: the reader does not see the history of an active photograph (RF-105, RF-1506)';
  end if;

  select count(*) into v_n from public.change_log
   where change_id = 'ac000030-0000-4000-8000-000000000002';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees the history of an artwork in the trash (RF-609)';
  end if;

  select count(*) into v_n from public.change_log
   where change_id = 'ac000030-0000-4000-8000-000000000004';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees the history of a retired photograph of an active artwork (RF-609)';
  end if;

  reset role;
  raise notice 'OK: the reader reads the history of what they may see, and nothing else (RF-105, RF-609, RF-1506)';
end $$;

reset role;

-- And neither of them writes: not the reader, and NOT THE CATALOGER EITHER,
-- which is the cell that makes this table different from every other one in this
-- file. Failing by insufficient_privilege and not by an empty row count is the
-- point: PostgREST answers 403 to a POST, a PATCH or a DELETE before it looks at
-- any policy (RF-113, RF-1504).
do $$
declare
  v_usuarios constant text[] := array[
    '00000000-0000-0000-0000-0000000000c1',  -- cataloger
    '00000000-0000-0000-0000-0000000000d1'   -- reader
  ];
  v_sentencias constant text[] := array[
    $q$insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
       values (gen_random_uuid(), 'ARTWORK', 'AR-9001', 'AR-9001', 'CREATE')$q$,
    $q$update public.change_log set new_value = 'reescrito a mano'$q$,
    $q$delete from public.change_log$q$
  ];
  u integer;
  i integer;
begin
  for u in 1 .. array_length(v_usuarios, 1) loop
    for i in 1 .. array_length(v_sentencias, 1) loop
      begin
        execute format('set local request.jwt.claims = %L',
                       '{"sub":"' || v_usuarios[u] || '","role":"authenticated"}');
        set local role authenticated;
        execute v_sentencias[i];
        reset role;
        raise exception 'FAIL: % could write the change log: %', v_usuarios[u], v_sentencias[i];
      exception
        when insufficient_privilege then
          reset role;
      end;
    end loop;
  end loop;
  raise notice 'OK: nobody writes the change log — not the reader and not the cataloger, who is the audited one (RF-1504)';
end $$;

reset role;

-- The anonymous role does not even reach it.
do $$
begin
  set local role anon;
  perform 1 from public.change_log limit 1;
  reset role;
  raise exception 'FAIL: the anonymous role could query the change log (RF-101)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: the anonymous role has no access to the change log (RF-101)';
end $$;

reset role;


-- ── The Superuser: the cell nobody covered ───────────────────
--
-- RF-109, RF-1504. Added on auditing the change log, and the gap belonged to
-- this whole file and not only to the log: the role matrix HAD NO
-- SUPERUSER USER. It was taken for granted that their row is the Cataloguer's because
-- `can_edit()` returns true for both, and that is true for READING and
-- WRITING the catalogue — but in the change log the conclusion being
-- taken for granted is the opposite of the one that has to be demonstrated: that whoever has the most
-- privilege in the application does NOT write in the audit either.
--
-- The Superuser is besides RF-1105's role, that of Supabase's panel. That their
-- application session cannot touch the log is precisely what makes the
-- difference between «coming in through the application» and «coming in through the panel» the
-- deliberate decision change_log.sql describes, and not an oversight.
-- The JWT claim is emptied BY HAND before touching the profile, and it is not
-- ceremony: `reset role` gives back the database role but does NOT clear
-- `request.jwt.claims`, so by this point in the file the session still carries
-- the last block's `sub`. With a user inside, `tg_role_superuser_only()`
-- rejects the role change —«Solo el superusuario puede cambiar el rol»
-- (RF-108)—, which is exactly what it must do. The promotion of the first
-- superuser happens by necessity outside the application, and this `set_config`
-- is the way of saying «this is administrative access» in a test.
select set_config('request.jwt.claims', '', true);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000e9', 'sup-matriz@test.local');
update public.profiles set role = 'SUPERUSER'
 where id = '00000000-0000-0000-0000-0000000000e9';

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}';
  set local role authenticated;

  -- They read like the Cataloguer, wastebasket included: `can_edit()` includes them, so
  -- the anchor's inherited visibility shows them all of it.
  select count(*) into v_n from public.change_log
   where change_id::text like 'ac000030-%';
  reset role;

  if v_n <> 4 then
    raise exception 'FAIL: the superuser should see the four change log rows, trash included, sees % (RF-109, RF-1506)', v_n;
  end if;
  raise notice 'OK: the superuser reads the whole history, trash included (RF-109, RF-1506)';
end $$;

reset role;

-- And they do not write: the three verbs, and failing by PRIVILEGE just like the others.
-- The application's highest role is, in this table, exactly as
-- powerless as the Reader.
do $$
declare
  v_sentencias constant text[] := array[
    $q$insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
       values (gen_random_uuid(), 'ARTWORK', 'AR-9001', 'AR-9001', 'CREATE')$q$,
    $q$update public.change_log set new_value = 'reescrito por el superusuario'$q$,
    $q$delete from public.change_log$q$
  ];
  i integer;
begin
  for i in 1 .. array_length(v_sentencias, 1) loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}';
      set local role authenticated;
      execute v_sentencias[i];
      reset role;
      raise exception 'FAIL: the superuser could write the change log: %', v_sentencias[i];
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: not even the superuser writes the change log, and it fails by privilege (RF-109, RF-1504)';
end $$;

reset role;

-- And the Superuser does write in the CATALOGUE, which is what closes the cell: otherwise,
-- «they cannot touch the log» could simply be saying that their session
-- does not work. Their change also leaves its own line in the log, written by
-- the trigger and with them as author — the pair's other half, checked from the
-- matrix.
do $$
declare v_autor uuid; v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set technique = 'Editada por el superusuario'
   where catalog_id = 'AR-9001';
  reset role;

  select count(*), min(changed_by::text)::uuid into v_n, v_autor
    from public.change_log
   where row_key = 'AR-9001' and column_name = 'technique'
     and new_value = 'Editada por el superusuario';
  if v_n <> 1 then
    raise exception 'FAIL: the superuser''s edit left % change log rows, expected 1 (RF-109)', v_n;
  end if;
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000e9'::uuid then
    raise exception 'FAIL: the superuser''s edit was recorded under % instead of themselves',
      coalesce(v_autor::text, '(null)');
  end if;
  raise notice 'OK: the superuser edits the catalogue and the trigger records it under their name (RF-109, RF-1503)';
end $$;

reset role;


-- ── La papelera de una obra no enseña su expediente ──────────
--
-- RF-105, RF-106, RF-109, RF-511, RF-609, RF-905, RF-910, RF-913, RF-906. The
-- cell this matrix was
-- missing, and it was a personal-data leak, not a presentation detail: with the
-- policies as 20260804150000 left them, the reader saw 0 rows of AR-9002 and 1
-- row of its provenance link, its citation, its exhibition entry, its document
-- and its relationship — and, following the link into `parties`, the name and the
-- CONTACT of the private collector who owned it. The record was hidden and the
-- chain of owners of that hidden record was not.
--
-- The whole cascade, both ends of every bridge and the criterion for a document
-- shared with an active exhibition, are in `documentary_visibility.test.sql`.
-- What belongs in this file is the matrix cell: reader nothing, cataloger
-- everything.

insert into public.parties (id, party_type, name, contact) values
  ('ac000040-0000-4000-8000-000000000001', 'PERSON',
   'Coleccionista particular del expediente', 'telefono-privado@expediente.test');
insert into public.bibliography (id, title) values
  ('ac000040-0000-4000-8000-000000000002', 'Referencia del expediente de la matriz');
insert into public.exhibitions (id, title, year) values
  ('ac000040-0000-4000-8000-000000000003', 'Muestra del expediente de la matriz', 1991);
insert into public.archive_documents (id, title) values
  ('ac000040-0000-4000-8000-000000000004', 'Documento del expediente de la matriz');
insert into public.artwork_relationship_types (id, name, inverse_name, is_symmetric) values
  ('ac000040-0000-4000-8000-000000000005', 'Expediente de la matriz, simétrica de', '', true);

-- The same five documentary rows on both artworks: AR-9001 is active and AR-9002
-- is in the trash. Nothing else differs, so what the reader sees can only come
-- from the state of the anchor.
insert into public.provenance_events (catalog_id, party_id, capacity) values
  ('AR-9001', 'ac000040-0000-4000-8000-000000000001', 'OWNER'),
  ('AR-9002', 'ac000040-0000-4000-8000-000000000001', 'OWNER');
insert into public.artwork_bibliography (catalog_id, bibliography_id, pages) values
  ('AR-9001', 'ac000040-0000-4000-8000-000000000002', 'p. 1'),
  ('AR-9002', 'ac000040-0000-4000-8000-000000000002', 'p. 2');
insert into public.artwork_exhibitions (catalog_id, exhibition_id, catalogue_number) values
  ('AR-9001', 'ac000040-0000-4000-8000-000000000003', 'cat. 1'),
  ('AR-9002', 'ac000040-0000-4000-8000-000000000003', 'cat. 2');
insert into public.artwork_documents (catalog_id, document_id) values
  ('AR-9001', 'ac000040-0000-4000-8000-000000000004'),
  ('AR-9002', 'ac000040-0000-4000-8000-000000000004');
insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id) values
  ('AR-9001', 'AR-9002', 'ac000040-0000-4000-8000-000000000005');

do $$
declare
  -- Table and the column that anchors it to the artwork. The relationship is
  -- reached by either end on purpose: the reader must not see it from the active
  -- side either, because seeing it is learning that AR-9002 exists.
  v_cells constant text[][] := array[
    ['provenance_events',     'catalog_id = ''AR-9002'''],
    ['artwork_bibliography',  'catalog_id = ''AR-9002'''],
    ['artwork_exhibitions',   'catalog_id = ''AR-9002'''],
    ['artwork_documents',     'catalog_id = ''AR-9002'''],
    ['artwork_relationships', 'from_catalog_id = ''AR-9002'' or to_catalog_id = ''AR-9002''']
  ];
  v_i integer;
  v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  for v_i in 1 .. array_length(v_cells, 1) loop
    execute format('select count(*) from public.%I where %s', v_cells[v_i][1], v_cells[v_i][2])
       into v_n;
    if v_n <> 0 then
      raise exception
        'FAIL: the reader sees % row(s) of public.% belonging to an artwork in the trash (RF-609)',
        v_n, v_cells[v_i][1];
    end if;

    -- And the same row of the ACTIVE artwork IS visible: without this the cell
    -- would pass on a policy that hides everything (RF-105).
    execute format('select count(*) from public.%I where %s',
                   v_cells[v_i][1], replace(v_cells[v_i][2], 'AR-9002', 'AR-9001'))
       into v_n;
    if v_n < 1 then
      raise exception 'FAIL: the reader does not see public.% of an active artwork (RF-105)',
        v_cells[v_i][1];
    end if;
  end loop;

  raise notice 'OK: the reader sees the documentary record of an active artwork and none of one in the trash (RF-609)';
end $$;

reset role;

-- The contact of a third party, read with the very query that leaked it. This is
-- the assertion this file exists for: priority 1 of the test plan is the only
-- category whose failure affects people outside the project (RF-511).
do $$
declare v_contact text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  select p.contact into v_contact
    from public.parties p
    join public.provenance_events e on e.party_id = p.id
   where e.catalog_id = 'AR-9002';
  reset role;

  if v_contact is not null then
    raise exception
      'FAIL: the reader read a third party''s contact through the provenance of an artwork in the trash: %',
      v_contact;
  end if;
  raise notice 'OK: the provenance of an artwork in the trash leads to nobody''s contact (RF-511)';
end $$;

reset role;

-- And the cataloger keeps the whole trash: it is how the record is restored, and
-- it is the one thing inherited visibility must not break (RF-906).
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  select (select count(*) from public.provenance_events where catalog_id = 'AR-9002')
       + (select count(*) from public.artwork_bibliography where catalog_id = 'AR-9002')
       + (select count(*) from public.artwork_exhibitions where catalog_id = 'AR-9002')
       + (select count(*) from public.artwork_documents where catalog_id = 'AR-9002')
       + (select count(*) from public.artwork_relationships
           where from_catalog_id = 'AR-9002' or to_catalog_id = 'AR-9002')
    into v_n;
  reset role;

  if v_n <> 5 then
    raise exception
      'FAIL: the cataloger should see the five documentary rows of the artwork in the trash, sees %', v_n;
  end if;
  raise notice 'OK: the cataloger keeps the whole documentary record of the trash (RF-906)';
end $$;

reset role;
rollback;
