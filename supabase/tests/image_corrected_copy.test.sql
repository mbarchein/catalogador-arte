-- RF-420, RF-411: the full-resolution corrected copy, a photograph's fourth
-- file level.
--
-- What is checked is what the `check` can check and the client must not
-- check again on its own: that a size that is not a size does not go in,
-- that half a file description does not exist, that «the copy is there» and «the copy
-- is missing» cannot both be true in the same row, and —the whole file's
-- reason to exist— that **the corrected copy's path is never the master's**. The master
-- is never rewritten (ADR-002), and the realistic way of breaking that rule is not
-- a malicious `update`: it is deriving the copy's path from the master's and having them
-- coincide one day.
--
-- And three things that are not about values: that a row written **with none of the
-- new columns** is still valid —it is what the old frontend does during
-- the seconds in which both versions are in the air, and it is what allows
-- deploying in one phase—, that `corrected_pending` is born false, and that none of
-- the rows that already exist has filled itself in.
--
-- Every rejection is checked **by the name of the constraint that rejects it**, which
-- is the reason the migration wrote one constraint per rule instead of
-- one big `check`: the only thing Postgres says on rejecting is that name.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9602', 'ROTILI', 'Obra que se manda a la imprenta', 'UNCONFIRMED');

-- ── 1. A row with none of the new columns is still valid ─────
-- The single-phase deployment's guarantee: exactly what the frontend that does not know
-- these columns writes is written. And incidentally the only default value of the three
-- is pinned down, which is «no copy is missing».
do $$
declare v_row public.images;
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path)
  values ('AR-9602', 'q/min.webp', 'q/der.webp', 'q/AR-9602_ab12_master.jpg')
  returning * into v_row;

  if v_row.corrected_path is not null or v_row.corrected_bytes is not null then
    raise exception 'FAIL: una foto nueva nace con una copia corregida (% , %)',
      v_row.corrected_path, v_row.corrected_bytes;
  end if;

  -- False and not null, and the reason is that here false IS a fact: it means «no
  -- copy is missing», which is true of a freshly uploaded photograph with no
  -- corrections. Null would leave the question open in the 39 rows and in every
  -- new one, and then «pending» would distinguish nothing, which is precisely the only thing
  -- this column exists to do.
  if v_row.corrected_pending is null then
    raise exception 'FAIL: corrected_pending nace en nulo y tenía que nacer en falso';
  end if;
  if v_row.corrected_pending then
    raise exception 'FAIL: una foto nueva nace con la copia corregida pendiente';
  end if;

  raise notice 'OK: una fila sin las columnas nuevas es válida y nace sin copia y sin deuda';
end $$;

-- And the default value is declared in the table, not only achieved by the
-- shape of this `insert`: the other two have none, because a default
-- value in the path or in the size would be inventing a file.
do $$
declare r record; v_esperado text;
begin
  for r in
    select column_name, column_default, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'images'
       and column_name like 'corrected\_%'
  loop
    v_esperado := case r.column_name when 'corrected_pending' then 'false' else null end;
    if coalesce(r.column_default, '') <> coalesce(v_esperado, '') then
      raise exception 'FAIL: % tiene por omisión % y debía tener %',
        r.column_name, coalesce(r.column_default, 'nulo'), coalesce(v_esperado, 'nulo');
    end if;
  end loop;

  -- And `corrected_pending` is `not null`: a row where it is not known whether the copy
  -- is missing is the same ambiguity the column came to remove.
  select is_nullable into v_esperado
    from information_schema.columns
   where table_schema = 'public' and table_name = 'images'
     and column_name = 'corrected_pending';
  if v_esperado <> 'NO' then
    raise exception 'FAIL: corrected_pending admite nulo';
  end if;

  raise notice 'OK: solo corrected_pending tiene omisión, es falso, y no admite nulo';
end $$;

-- ── 2. A size that is not a size ─────────────────────────────
-- Zero bytes is an empty file and a negative is a badly done sum. Both
-- would reach the record as a download promising something that is not there.
do $$
declare r record; v_constraint text;
begin
  for r in
    select * from (values
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = 0',
       'images_corrected_bytes_positive'),
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = -1',
       'images_corrected_bytes_positive'),
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = -4194304',
       'images_corrected_bytes_positive')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9602_v1'
      );
      raise exception 'FAIL: se admitió «%»', r.asignacion;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: «%» lo rechazó % y no %',
          r.asignacion, v_constraint, r.restriccion;
      end if;
    end;
  end loop;

  -- A single byte goes in: the lower cap is 1 and not an invented minimum. Nobody knows
  -- what the smallest JPEG a strange device can produce is, and putting a
  -- floor by eye would reject a legitimate copy while gaining nothing.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 1
   where image_id = 'AR-9602_v1';

  -- And the real size of the worst of the batch's photographs: 19 MB. The ceiling is set
  -- by `integer`, which reaches 2 GB.
  update public.images set corrected_bytes = 19922944 where image_id = 'AR-9602_v1';

  raise notice 'OK: el tamaño de la copia es positivo, y 1 byte y 19 MB entran';
end $$;

-- ── 3. The path and the size are one file, not two data ──────
do $$
declare r record; v_constraint text;
begin
  update public.images set corrected_path = null, corrected_bytes = null
   where image_id = 'AR-9602_v1';

  for r in
    select * from (values
      -- Path with no size: it forces whoever reads it to ask the store for the size,
      -- which is the trip the column exists to save.
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = null',
       'images_corrected_copy_pair'),
      -- Size with no path: a number that describes no file.
      ('corrected_path = null, corrected_bytes = 3145728',
       'images_corrected_copy_pair')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9602_v1'
      );
      raise exception 'FAIL: se admitió «%»', r.asignacion;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: «%» lo rechazó % y no %',
          r.asignacion, v_constraint, r.restriccion;
      end if;
    end;
  end loop;

  -- Both together go in, and neither of the two too: «there is no corrected copy»
  -- is the normal state of a photograph with no corrections, and not a gap that has
  -- to be filled.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
   where image_id = 'AR-9602_v1';
  update public.images set corrected_path = null, corrected_bytes = null
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la copia son ruta y tamaño juntos, o ninguno de los dos';
end $$;

-- ── 4. Pending and present are mutually exclusive ────────────
-- If the copy is there, it is not pending. A row saying both things would force
-- whoever reads it to choose which to believe, and the interface would show at once the button
-- for downloading the copy and the warning that it is missing.
do $$
declare v_constraint text; v_pendiente boolean; v_ruta text;
begin
  -- Pending on its own: the state the column exists to be able to write. This is
  -- the device that could not cope with the canvas, and it is recorded.
  update public.images set corrected_pending = true where image_id = 'AR-9602_v1';

  -- And from there, adding a path to it is rejected.
  begin
    update public.images
       set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 2097152
     where image_id = 'AR-9602_v1';
    raise exception 'FAIL: una copia presente y pendiente a la vez ha entrado';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_pending_exclusive' then
      raise exception 'FAIL: presente y pendiente lo rechazó % y no images_corrected_pending_exclusive',
        v_constraint;
    end if;
  end;

  -- The rejected `update` leaves nothing written: the row is still pending and with no
  -- path, which is what has to happen when the generation fails again.
  select corrected_pending, corrected_path into v_pendiente, v_ruta
    from public.images where image_id = 'AR-9602_v1';
  if not v_pendiente or v_ruta is not null then
    raise exception 'FAIL: el rechazo ha dejado la fila en (pendiente %, ruta %)',
      v_pendiente, v_ruta;
  end if;

  -- And from the other side: marking as pending a row that already has a copy is also
  -- rejected. It is the order a badly written retry would do it in.
  update public.images
     set corrected_pending = false,
         corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 2097152
   where image_id = 'AR-9602_v1';

  begin
    update public.images set corrected_pending = true where image_id = 'AR-9602_v1';
    raise exception 'FAIL: se ha marcado pendiente una copia que está';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_pending_exclusive' then
      raise exception 'FAIL: marcar pendiente lo rechazó % y no images_corrected_pending_exclusive',
        v_constraint;
    end if;
  end;

  -- The legitimate transition from «pending» to «done» is a single write, and it goes in:
  -- it is the one the computer that did manage to generate the copy makes.
  update public.images set corrected_path = null, corrected_bytes = null,
                           corrected_pending = true
   where image_id = 'AR-9602_v1';
  update public.images
     set corrected_pending = false,
         corrected_path = 'q/AR-9602_cd34_corr.jpg', corrected_bytes = 4194304
   where image_id = 'AR-9602_v1';

  raise notice 'OK: pendiente y presente se excluyen, y la transición entre los dos entra';
end $$;

-- ── 5. The copy NEVER shares a path with the master (RF-411) ──
-- It is the rule that protects the archive document. The master is uploaded once with
-- the original bytes and is never written again (ADR-002); what is sent to
-- a print shop or to a curator is the corrected copy, and they are two different
-- files because they answer two different questions.
--
-- It is checked by construction and by constraint, in both directions: moving the
-- copy over the master and moving the master over the copy.
do $$
declare v_master text; v_copia text; v_constraint text;
begin
  update public.images
     set master_path    = 'q/AR-9602_ab12_master.jpg',
         corrected_path = 'q/AR-9602_ab12_corr.jpg',
         corrected_bytes = 3145728
   where image_id = 'AR-9602_v1';

  select master_path, corrected_path into v_master, v_copia
    from public.images where image_id = 'AR-9602_v1';
  if v_master is null or v_copia is null then
    raise exception 'FAIL: el máster y la copia corregida no conviven en la misma fila';
  end if;
  if v_master = v_copia then
    raise exception 'FAIL: la copia corregida ha quedado en la ruta del máster (%)', v_master;
  end if;

  -- Direction 1: taking the copy to the master's path. It is what would happen the day
  -- somebody derived the copy's path from the master's reusing its base
  -- and its extension.
  begin
    update public.images set corrected_path = v_master where image_id = 'AR-9602_v1';
    raise exception 'FAIL: la copia corregida ha podido apuntar al máster';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_not_master' then
      raise exception 'FAIL: la colisión con el máster la rechazó % y no images_corrected_not_master',
        v_constraint;
    end if;
  end;

  -- Direction 2: taking the master to the copy's path. The constraint is symmetric
  -- on purpose: what matters is that the two columns do not coincide, and it does not matter
  -- which of the two is moved to make them coincide.
  begin
    update public.images set master_path = v_copia where image_id = 'AR-9602_v1';
    raise exception 'FAIL: el máster ha podido apuntar a la copia corregida';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_not_master' then
      raise exception 'FAIL: mover el máster sobre la copia lo rechazó % y no images_corrected_not_master',
        v_constraint;
    end if;
  end;

  -- And the degraded path: taking the master away from a row that already has a copy does not
  -- fail and does not take the copy with it. It is the case of a photograph whose
  -- master is relocated when the copy is already uploaded.
  --
  -- This assertion does **not** distinguish `is distinct from` from a `<>` in the constraint, and
  -- it is said so nobody counts it as if it did: with the `corrected_path is
  -- null` guard in front, both forms admit the same rows —with a null master,
  -- `<>` gives null and the `check` passes all the same—. What is verified here is the behaviour
  -- the record needs, not the syntax it is written with.
  update public.images set master_path = null where image_id = 'AR-9602_v1';
  select master_path, corrected_path into v_master, v_copia
    from public.images where image_id = 'AR-9602_v1';
  if v_copia is null then
    raise exception 'FAIL: quitar el máster ha borrado la copia corregida';
  end if;
  update public.images set master_path = 'q/AR-9602_ab12_master.jpg'
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la ruta de la copia corregida nunca es la del máster, en las dos direcciones';
end $$;

-- And the same over every row of the base, which is where the rule has to
-- really hold: no row has the copy at its master's path.
do $$
declare v_malas int;
begin
  select count(*) into v_malas
    from public.images
   where corrected_path is not null and corrected_path = master_path;
  if v_malas > 0 then
    raise exception 'FAIL: % filas tienen la copia corregida en la ruta del máster', v_malas;
  end if;
  raise notice 'OK: ninguna fila de la base tiene la copia sobre su máster';
end $$;

-- ── 6. Nothing has been filled backwards ─────────────────────
-- The rows that already existed are left with no copy and no debt: there is no copy because
-- nobody has applied a correction since this level exists, and none is missing
-- because none was needed either. Marking them pending in the migration would have created
-- 39 tasks nobody asked for; giving them a path would have invented 39 files that are not
-- in the store, and the record would offer to download a 404.
--
-- ALL the rows are counted and not only the active ones: the withdrawn ones are still there
-- —never a real delete— and a logical deletion with an invented corrected copy
-- would still be an invented datum, besides a ghost file nobody
-- would look at again.
--
-- Over a freshly migrated base there are no rows and the assertion says nothing, and it is
-- right that it says nothing: this test measures the base loaded with the dump, where
-- they are 39 active out of 44.
do $$
declare v_total int; v_con_copia int; v_pendientes int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9602_v1';

  select count(*) into v_con_copia
    from public.images
   where image_id <> 'AR-9602_v1'
     and num_nonnulls(corrected_path, corrected_bytes) > 0;
  if v_con_copia > 0 then
    raise exception 'FAIL: % de las % filas heredadas tienen una copia corregida inventada',
      v_con_copia, v_total;
  end if;

  select count(*) into v_pendientes
    from public.images where image_id <> 'AR-9602_v1' and corrected_pending;
  if v_pendientes > 0 then
    raise exception 'FAIL: % de las % filas heredadas han nacido con una copia pendiente',
      v_pendientes, v_total;
  end if;

  raise notice 'OK: las % filas heredadas siguen sin copia corregida y sin deuda', v_total;
end $$;

-- And they still admit a write that ignores the new columns, which is
-- literally what the old frontend does during the deployment: if any of
-- the new constraints rejected an inherited row, that row would be left unable
-- to be stored until somebody fixed it by hand.
do $$
declare v_total int; v_tocadas int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9602_v1';

  update public.images set photo_author = photo_author where image_id <> 'AR-9602_v1';
  get diagnostics v_tocadas = row_count;

  if v_tocadas <> v_total then
    raise exception 'FAIL: solo % de % filas heredadas admiten una escritura del frontend viejo',
      v_tocadas, v_total;
  end if;
  raise notice 'OK: las % filas heredadas se siguen escribiendo sin las columnas nuevas', v_total;
end $$;

-- ── 7. What the base does NOT forbid, on purpose ─────────────
-- It is here so that the absence of these two constraints reads as a
-- decision and not as an oversight: whoever adds them tomorrow will break this test and will read
-- why.
do $$
begin
  -- A corrected copy with no master in the row. Today it cannot be reached because
  -- with no master the colour is forbidden in the client, but the rule is about rendering
  -- and lives there: writing it in the base would prevent storing the case of a copy already
  -- generated whose master gets relocated, and it would prevent it when there is nothing left to
  -- do.
  update public.images
     set master_path = null,
         corrected_path = 'q/AR-9602_ef56_corr.jpg', corrected_bytes = 1048576
   where image_id = 'AR-9602_v1';

  -- And a row marked pending with no correction to apply. It is harmless
  -- —whoever reads it will retry and will leave the work done— and a `check` requiring
  -- «there is something to apply» would have to repeat here the definition of the four
  -- corrections and would fall out of step the first time there was a fifth.
  update public.images
     set corrected_path = null, corrected_bytes = null, corrected_pending = true,
         rotation = 0, crop_x = null, crop_y = null, crop_width = null, crop_height = null,
         color_temperature = null, color_gamma = null
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la base no exige máster para la copia ni correcciones para la deuda';
end $$;

-- ── 8. Who writes the copy and who only downloads it ─────────
-- RF-106, RF-411, RF-420.
--
-- The three columns are new write surface, and CLAUDE.md puts the RLS
-- policies ahead of everything else: there is no backend, the anonymous key
-- travels in the client and these policies are the only perimeter there is. No
-- new policy has been written for them, and it is deliberate —whoever can edit
-- a photograph can edit its corrected copy—, so what has to be
-- demonstrated is that the `images_update` that already exists (`can_edit()`) reaches all
-- three. Reading the migration demonstrates nothing: this authenticates for real.
--
-- The coverage is here and not in `rls_role_matrix.test.sql` because that file
-- belongs to other work in progress and today covers the colour columns and not
-- these. It works in either of the two places; what does not work is in neither.
--
-- And here RF-411's asymmetry is checked, which is the one that can be broken without
-- anybody finding out: the Reader **downloads** the corrected copy —that is what it
-- exists for— and therefore has to be able to READ `corrected_path` and
-- `corrected_bytes`, but cannot write any of the three. A policy
-- denying them the read would give no error: it would leave the download button
-- with no path to sign, and the record would hand over the uncorrected master believing that
-- there was no copy.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000096c1', 'cat-corr@test.local'),
  ('00000000-0000-0000-0000-0000000096d1', 'lec-corr@test.local');

update public.profiles set role = 'CATALOGER'
 where id = '00000000-0000-0000-0000-0000000096c1';
update public.profiles set role = 'READER'
 where id = '00000000-0000-0000-0000-0000000096d1';

-- A clean and explicit starting state: the previous block left the row with no
-- master and with debt on purpose, and what is measured now is something else.
update public.images
   set master_path = 'q/AR-9602_ab12_master.jpg',
       corrected_path = null, corrected_bytes = null, corrected_pending = false
 where image_id = 'AR-9602_v1';

do $$
declare v_row public.images;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096c1","role":"authenticated"}';
  set local role authenticated;

  -- The two states a cataloguer really writes. First the copy
  -- done, which is what happens when the device has managed to generate it.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
   where image_id = 'AR-9602_v1'
  returning * into v_row;

  if v_row.corrected_path is null or v_row.corrected_bytes <> 3145728 then
    raise exception 'FAIL: el catalogador no ha podido escribir la copia corregida';
  end if;

  -- And then the debt, which is what happens when it has not: if can_edit()
  -- did not reach this third column, the phone could not even leave a record
  -- that the copy is missing, which is precisely what it exists for.
  update public.images
     set corrected_path = null, corrected_bytes = null, corrected_pending = true
   where image_id = 'AR-9602_v1'
  returning * into v_row;

  if not v_row.corrected_pending or v_row.corrected_path is not null then
    raise exception 'FAIL: el catalogador no ha podido anotar la copia como pendiente';
  end if;

  raise notice 'OK: el catalogador escribe la copia corregida y su deuda';
end $$;

reset role;

-- The row is left with a copy, which is the state the Reader downloads it in.
update public.images
   set corrected_pending = false,
       corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
 where image_id = 'AR-9602_v1';

do $$
declare v_afectadas integer; v_row public.images; v_ruta text; v_bytes integer;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  -- RF-411: the Reader READS the path and the size. It is what the record needs in order to
  -- ask for the signed URL and to announce the weight of what is going to be downloaded.
  select corrected_path, corrected_bytes into v_ruta, v_bytes
    from public.images where image_id = 'AR-9602_v1';
  if v_ruta is null or v_bytes is null then
    raise exception 'FAIL: el Lector no ve la copia corregida y no puede descargarla (RF-411)';
  end if;

  -- RF-106: and does not write the path or the size. An `update` the USING policy
  -- hides does not fail: it affects no row. That silence is what has to be
  -- asserted, because without asserting it the test would pass all the same over a table with
  -- no policy at all.
  --
  -- The values chosen are valid for the four constraints on purpose
  -- —complete pair, positive size and a path different from the master's—, and that is
  -- part of the test and not an oversight: if the Reader's write also broke a
  -- `check`, the rejection could come from the `check` instead of the policy and this
  -- block would stop measuring the policy, which is the only thing measured here. With the
  -- policy open this write would go in without a complaint.
  update public.images
     set corrected_path = 'q/robada_corr.jpg', corrected_bytes = 1
   where image_id = 'AR-9602_v1';
  get diagnostics v_afectadas = row_count;

  reset role;
  if v_afectadas <> 0 then
    raise exception 'FAIL: el Lector ha modificado la copia corregida de % fila(s)', v_afectadas;
  end if;

  -- And the row still has what the cataloguer wrote, checked from outside the
  -- Reader's session: `row_count` on its own would not catch a policy that let
  -- the write through and hid the row afterwards.
  select * into v_row from public.images where image_id = 'AR-9602_v1';
  if v_row.corrected_path <> 'q/AR-9602_ab12_corr.jpg'
     or v_row.corrected_bytes <> 3145728 or v_row.corrected_pending then
    raise exception 'FAIL: la escritura del Lector ha dejado algo puesto';
  end if;

  raise notice 'OK: el Lector descarga la copia corregida y no la escribe (RF-411)';
end $$;

reset role;

-- The third column apart, and for the same reason: for `corrected_pending`
-- to be attackable without breaking `images_corrected_pending_exclusive`, the row has
-- to be left with no copy first. This way the only possible reason for the write
-- not going in is the policy.
update public.images
   set corrected_path = null, corrected_bytes = null, corrected_pending = false
 where image_id = 'AR-9602_v1';

do $$
declare v_afectadas integer; v_pendiente boolean;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  update public.images set corrected_pending = true where image_id = 'AR-9602_v1';
  get diagnostics v_afectadas = row_count;

  reset role;
  if v_afectadas <> 0 then
    raise exception 'FAIL: el Lector ha marcado pendiente % fila(s)', v_afectadas;
  end if;

  select corrected_pending into v_pendiente
    from public.images where image_id = 'AR-9602_v1';
  if v_pendiente then
    raise exception 'FAIL: el Lector ha podido inventar una deuda de copia corregida';
  end if;

  raise notice 'OK: el Lector tampoco escribe corrected_pending';
end $$;

reset role;

-- And a copy does not slip through via a new photograph either, which is the path left
-- when the `update` is of no use to them.
do $$
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path,
                             corrected_path, corrected_bytes)
  values ('AR-9602', 'q/min2.webp', 'q/der2.webp', 'q/AR-9602_gh78_master.jpg',
          'q/AR-9602_gh78_corr.jpg', 1048576);
  raise exception 'FAIL: el Lector ha podido añadir una fotografía con copia corregida';
exception
  when insufficient_privilege then
    raise notice 'OK: el Lector no añade fotografías, con copia corregida ni sin ella';
end $$;

reset role;
rollback;
