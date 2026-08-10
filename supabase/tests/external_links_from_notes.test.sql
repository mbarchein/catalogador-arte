-- The move of the addresses that lived inside a note:
-- RF-1401, RF-1402, RF-1405, RF-1407, and RF-801 and RF-802 for what did NOT move.
--
-- This file is different from every other in the folder: it does not create its data
-- for the essential part, because what it verifies is A STATE A MIGRATION ALREADY LEFT
-- IN THE BASE. The fixtures at the end exist only for the idempotence
-- assertion, which needs a new note without touching the real catalogue.
--
-- ── HOW IT IS WRITTEN TO HOLD IN BOTH BASES ─────────────────
--
-- The automatic verification starts the stack over a clean volume and runs
-- `make db-test` WITHOUT having loaded any dump: there AR-0001 does not exist and there is
-- no note. Over a local copy of the dump there are two. So every assertion
-- is written as an invariant that holds in both: the loops walk
-- the notes that ARE THERE —zero or two—, and the count admits 0 and 2 and no other, which is
-- literally the same guard the migration carries. Both age together and
-- not out of step: the day a third note with an address inside appears they
-- both go red at once.
--
-- ── THE TRAIL BY WHICH WHAT THE MIGRATION DID IS RECOGNISED ──
--
-- `created_by is null`. `tg_row_audit` signs with `auth.uid()`, which inside a
-- migration is nobody, so an unsigned link row can only have been
-- written by a migration and a signed one can only have been written by a person. From
-- there comes everything this file can assert without expiring as soon as somebody
-- adds their first link by hand: the assertions speak of THE UNSIGNED LINKS, not
-- of «the links there are».
--
-- The same trail, in reverse, is what proves the migration touched no
-- artwork: if it had written over `artworks`, `tg_artwork_audit_trail` would have
-- set `updated_by` to null. That both artworks still have their `updated_by` signed
-- is exactly RF-801's and RF-802's assertion, and it still holds when somebody
-- edits them tomorrow.
\set ON_ERROR_STOP on
begin;


-- ── 1. The same count as the migration's guard ───────────────
--
-- It goes first because it looks at the data that is there, before the fixtures at the end
-- add theirs. 0 over a freshly migrated base, 2 over the real catalogue.
-- Any other number is a new note with an address inside that nobody has
-- moved, and that is the failure this whole delivery exists to end.
do $$
declare v_notas int;
begin
  select count(*) into v_notas
    from public.artworks
   where inventory_process_notes ilike '%http%';

  if v_notas not in (0, 2) then
    raise exception
      'FAIL: hay % notas de inventario con una dirección dentro y el traslado conoce 2 (RF-1401)',
      v_notas;
  end if;

  if v_notas = 0 then
    raise notice 'OK: base recién migrada, sin notas con dirección dentro: nada que trasladar';
  else
    raise notice 'OK: siguen siendo dos las notas de inventario con una dirección dentro (RF-1401)';
  end if;
end $$;


-- ── 2. No address stayed inside the prose ───────────────────
--
-- For every note with an address, one link anchored to the artwork: exactly one,
-- active, of museum-page type, with the address the note carries inside and with no
-- signature —the migration moved it, not a person—.
--
-- The correspondence is checked with `like '%' || e.url || '%'` and not by extracting the
-- URL from the prose with a regular expression, for the same reason the migration wrote them
-- literal: a `regexp` would take the sentence's full stop stuck to the
-- end of the address and this test would be checking something else.
do $$
declare
  v_obra    record;
  v_enlaces int;
  v_fila    public.external_links;
begin
  for v_obra in
    select catalog_id, inventory_process_notes
      from public.artworks
     where inventory_process_notes ilike '%http%'
     order by catalog_id
  loop
    select count(*) into v_enlaces
      from public.external_links
     where artwork_id = v_obra.catalog_id
       and link_type = 'MUSEUM_PAGE'
       and created_by is null
       and active;

    if v_enlaces <> 1 then
      raise exception
        'FAIL: la obra % tiene % enlaces de museo trasladados y debería tener uno (RF-1401)',
        v_obra.catalog_id, v_enlaces;
    end if;

    select * into v_fila
      from public.external_links
     where artwork_id = v_obra.catalog_id and link_type = 'MUSEUM_PAGE' and created_by is null;

    if v_obra.inventory_process_notes not like '%' || v_fila.url || '%' then
      raise exception
        'FAIL: el enlace de % lleva una dirección que no está en su nota: [%]',
        v_obra.catalog_id, v_fila.url;
    end if;

    if not public.is_web_url(v_fila.url) then
      raise exception
        'FAIL: la dirección trasladada de % no pasa la validación del esquema (RF-1403): [%]',
        v_obra.catalog_id, v_fila.url;
    end if;

    -- It is born UNCHECKED, which is not «it works» and is not «broken» (RF-1405). Nobody has
    -- opened that page, and a migration is in no position to state that it
    -- loads. The freezing trigger guarantees it even if the insert asked for something
    -- else, and this measures it in the real row.
    if v_fila.check_status is not null
       or v_fila.checked_at is not null
       or v_fila.checked_by is not null then
      raise exception
        'FAIL: el enlace trasladado de % nace comprobado, y nadie lo ha comprobado (RF-1405)',
        v_obra.catalog_id;
    end if;

    -- And with a title that reads, not with the bare address: when the title
    -- is missing the interface shows the domain, but here it was known what was on the other
    -- side and it was written (RF-1402).
    if btrim(coalesce(v_fila.title, '')) = '' then
      raise exception
        'FAIL: el enlace trasladado de % se quedó sin título y aquí sí se sabía (RF-1402)',
        v_obra.catalog_id;
    end if;
  end loop;

  raise notice 'OK: cada nota con una dirección dentro tiene su enlace pulsable, sin comprobar y con título (RF-1401, RF-1402, RF-1405)';
end $$;


-- ── 3. The notes' text is identical to what was there ───────
--
-- The migration does not rewrite the cataloguer's prose: the sentence says something the
-- link does not say —that ALL the cataloguing data came from there, not only the
-- image— and correcting it automatically is not migrating data, it is correcting a
-- person. It is compared against the literal string, byte by byte, and not against a
-- pattern: a pattern would let through precisely the trim that is feared.
--
-- It is skipped when this base does NOT have the dump, and the discriminant matters. The
-- first version looked at whether the note was null, and it was wrong for two reasons:
-- `inventory_process_notes` is `not null default ''`, so it is never null
-- while the artwork exists, and the artwork exists also in a freshly migrated base
-- because the seed creates it. Result: continuous integration red comparing
-- production's note against an empty string.
--
-- And the discriminant CANNOT be «the note is empty», which is the first thing one
-- writes: emptying the note is exactly the failure this block watches, so
-- skipping it for that would hide it. The discriminant is **the link the
-- migration created**: if it does not exist, this catalogue did not go through the move and there is
-- nothing to compare; if it exists and the note is no longer there, the block fails, which is what
-- is wanted.
do $$
declare v_texto text; v_esperado record; v_trasladada boolean;
begin
  for v_esperado in
    select * from (values
      ('AR-0001', 'Todos los datos catalográficos, incluida la imagen, han sido tomados de la web del MACVA: https://www.macvac.es/artista/rotili-zampanoli-alberto/'),
      ('RC-0005', 'Todos los datos catalográficos, incluida la imagen, han sido tomados de la web del MACVA: https://www.macvac.es/obra/saliente-en-el-espacio/')
    ) as v (catalog_id, nota)
  loop
    select exists (
      select 1 from public.external_links
       where artwork_id = v_esperado.catalog_id
    ) into v_trasladada;

    if not v_trasladada then
      continue;  -- Este catálogo no pasó por el traslado: no hay nota que preservar.
    end if;

    select inventory_process_notes into v_texto
      from public.artworks where catalog_id = v_esperado.catalog_id;

    if v_texto is null then
      continue;  -- La obra no existe en esta base.
    end if;

    if v_texto <> v_esperado.nota then
      raise exception
        'FAIL: la nota de inventario de % ha cambiado. Esperada [%], encontrada [%]',
        v_esperado.catalog_id, v_esperado.nota, v_texto;
    end if;
  end loop;

  raise notice 'OK: el traslado no ha tocado ni una letra de las notas de inventario';
end $$;


-- ── 4. The reproduction now says where it came from (RF-1407) ──
--
-- It is the half RF-417 was missing: `provenance` could say that a photograph
-- came from another catalogue, but not which one. A provenance with no source is half
-- an answer, and the missing half is the one needed to go back to the source.
do $$
declare
  v_obra    record;
  v_enlaces int;
  v_fila    public.external_links;
  v_proc    public.photo_provenance;
begin
  for v_obra in
    select catalog_id, inventory_process_notes
      from public.artworks
     where inventory_process_notes ilike '%http%'
     order by catalog_id
  loop
    select count(*) into v_enlaces
      from public.external_links
     where image_id = v_obra.catalog_id || '_v1'
       and link_type = 'PHOTO_SOURCE'
       and created_by is null
       and active;

    if v_enlaces <> 1 then
      raise exception
        'FAIL: la fotografía %_v1 tiene % enlaces de origen trasladados y debería tener uno (RF-1407)',
        v_obra.catalog_id, v_enlaces;
    end if;

    select * into v_fila
      from public.external_links
     where image_id = v_obra.catalog_id || '_v1'
       and link_type = 'PHOTO_SOURCE' and created_by is null;

    if v_obra.inventory_process_notes not like '%' || v_fila.url || '%' then
      raise exception
        'FAIL: el enlace de origen de %_v1 no lleva la dirección de la nota de su obra',
        v_obra.catalog_id;
    end if;

    if v_fila.check_status is not null or v_fila.checked_at is not null then
      raise exception
        'FAIL: el enlace de origen de %_v1 nace comprobado (RF-1405)', v_obra.catalog_id;
    end if;

    -- And the mark: with the source written, saying it is not our own is no longer a
    -- hunch. The evidence is in the note —«incluida la imagen»— and in the
    -- link that has just been checked.
    select provenance into v_proc
      from public.images where image_id = v_obra.catalog_id || '_v1';

    if v_proc <> 'OTHER_CATALOG' then
      raise exception
        'FAIL: %_v1 tiene su enlace de origen y sigue contando como propia (procedencia %) (RF-417, RF-1407)',
        v_obra.catalog_id, v_proc;
    end if;
  end loop;

  raise notice 'OK: cada reproducción trasladada dice de dónde salió y consta como tomada de otro catálogo (RF-417, RF-1407)';
end $$;


-- ── 5. And it did not over-mark, which is as serious as under-marking ──
--
-- The assertion's two halves. The first —«not under»— is the loop above.
-- This is the second, and it is written over THE MIGRATION'S TRAIL and not over a
-- frozen count, for a reason this repository has already learnt: the assertion
-- «no row with a crop also has provenance» in `image_perspective` expired
-- through legitimate use, and a test that goes red because the tool has been used
-- stops warning about the new failure. An «exactly 42 of our own» would expire the same: the
-- batch's count speaks of FOUR reproductions and RF-1407 expects the
-- cataloguer to identify the other two with the artwork in front.
--
-- What is invariant: NO UNSIGNED LINK HANGS FROM WHERE IT DID NOT COME FROM. Its
-- address has to still be inside an inventory note. With that plus
-- the `exists` the migration's `update` carries written —it only marks the
-- photograph whose source link landed— it is proved that it marked exactly
-- as many as there are notes and no more, without freezing any number.
do $$
declare v_sueltos int; v_de_foto int; v_notas int;
begin
  select count(*) into v_notas
    from public.artworks where inventory_process_notes ilike '%http%';

  select count(*) into v_sueltos
    from public.external_links e
   where e.created_by is null
     and not exists (
       select 1 from public.artworks a
        where a.inventory_process_notes like '%' || e.url || '%'
     );

  if v_sueltos > 0 then
    raise exception
      'FAIL: % enlaces sin firma llevan una dirección que no está en ninguna nota: o se ancló mal o se reescribió una nota',
      v_sueltos;
  end if;

  -- And no more hanging from a photograph: two notes, two source links.
  select count(*) into v_de_foto
    from public.external_links
   where image_id is not null and created_by is null;

  if v_de_foto <> v_notas then
    raise exception
      'FAIL: hay % enlaces sin firma colgando de una fotografía para % notas con dirección',
      v_de_foto, v_notas;
  end if;

  raise notice 'OK: el traslado no ha anclado ni un enlace donde no salió, ni ha marcado ninguna fotografía de más';
end $$;


-- ── 6. No artwork has moved its trace (RF-801, RF-802) ─────
--
-- The migration inserts links and writes two columns of `images`, and states in its
-- heading that this is why it does NOT need to disable `artwork_audit_trail`. This
-- checks it instead of believing it, and by the trail and not by a frozen value: if
-- it had written over `artworks` —directly, or by rebound through
-- `recalculate_photographed`—, the trigger would have set `updated_by` to null,
-- because inside a migration `auth.uid()` is nobody.
--
-- That the move's two artworks still have their authorship signed is the assertion, and
-- it survives somebody editing them tomorrow: a person's edit signs them
-- again.
do $$
declare v_obra record; v_n int := 0;
begin
  for v_obra in
    select catalog_id, updated_by, updated_at, basic_updated_at, photographed
      from public.artworks
     where inventory_process_notes ilike '%http%'
     order by catalog_id
  loop
    if v_obra.updated_by is null then
      raise exception
        'FAIL: la obra % ha perdido la firma de quién la actualizó: algo escribió sobre artworks sin sesión (RF-801)',
        v_obra.catalog_id;
    end if;

    -- And its photographed indicator has not been recalculated falsely: it is still true,
    -- which is what it was, because it has active photographs.
    if not v_obra.photographed then
      raise exception
        'FAIL: la obra % ha dejado de constar como fotografiada', v_obra.catalog_id;
    end if;

    -- The date of the last physical review is not touched on moving an address:
    -- an address is not checked with the artwork in front (RF-802).
    if v_obra.basic_updated_at > v_obra.updated_at then
      raise exception
        'FAIL: la obra % tiene la revisión física más reciente que su última actualización (RF-802)',
        v_obra.catalog_id;
    end if;

    v_n := v_n + 1;
  end loop;

  raise notice 'OK: las % obras del traslado conservan su traza: nadie escribió sobre ellas sin sesión (RF-801, RF-802)', v_n;
end $$;


-- ── 7. Idempotence: the move's body, again ─────────────────
--
-- Running this twice must not duplicate anything, and it must not duplicate it BY THE
-- `not exists` AND NOT BY THE UNIQUE INDEX: an `insert` that clashes against an index
-- aborts the whole transaction, so a re-run migration's second pass
-- would take with it everything that came behind. What is asserted
-- is that it inserts no row and throws no exception.
--
-- They are the migration's two statements, copied as is.
do $$
declare v_filas int;
begin
  insert into public.external_links (artwork_id, url, title, link_type, note)
  select v.catalog_id, v.url, v.title, 'MUSEUM_PAGE', v.note
    from (values
      ('AR-0001', 'https://www.macvac.es/artista/rotili-zampanoli-alberto/', 'Página del artista en el MACVA', 'Segunda pasada'),
      ('RC-0005', 'https://www.macvac.es/obra/saliente-en-el-espacio/',      'Ficha en el MACVA',              'Segunda pasada')
    ) as v (catalog_id, url, title, note)
    join public.artworks a on a.catalog_id = v.catalog_id
   where a.inventory_process_notes like '%' || v.url || '%'
     and not exists (
       select 1 from public.external_links e
        where e.artwork_id = v.catalog_id and e.url = v.url
     );
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FAIL: la segunda pasada del traslado ha insertado % enlaces de ficha', v_filas;
  end if;

  insert into public.external_links (image_id, url, title, link_type, note)
  select v.image_id, v.url, 'De dónde salió esta reproducción', 'PHOTO_SOURCE', v.note
    from (values
      ('AR-0001_v1', 'AR-0001', 'https://www.macvac.es/artista/rotili-zampanoli-alberto/', 'Segunda pasada'),
      ('RC-0005_v1', 'RC-0005', 'https://www.macvac.es/obra/saliente-en-el-espacio/',      'Segunda pasada')
    ) as v (image_id, catalog_id, url, note)
    join public.images   i on i.image_id   = v.image_id
    join public.artworks a on a.catalog_id = v.catalog_id
   where a.inventory_process_notes like '%' || v.url || '%'
     and not exists (
       select 1 from public.external_links e
        where e.image_id = v.image_id and e.url = v.url
     );
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FAIL: la segunda pasada del traslado ha insertado % enlaces de fotografía', v_filas;
  end if;

  update public.images i
     set provenance = 'OTHER_CATALOG'
   where i.image_id in ('AR-0001_v1', 'RC-0005_v1')
     and i.provenance = 'OWN'
     and exists (
       select 1 from public.external_links e
        where e.image_id = i.image_id and e.link_type = 'PHOTO_SOURCE' and e.active
     );
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FAIL: la segunda pasada del traslado ha vuelto a marcar % fotografías', v_filas;
  end if;

  raise notice 'OK: el cuerpo del traslado es idempotente, y lo es por el not exists y no por el índice único';
end $$;


-- ── 8. And the not exists guard comes before the index ──────
--
-- The previous assertion does not distinguish «it did not insert» from «there was nothing to insert», so
-- here the case is set up on purpose over test data: an artwork with a
-- note carrying an address inside, the link already moved, and the same
-- statement again. If the `not exists` were not there, this would blow up with a uniqueness
-- violation and the following block would not get to run.
--
-- The identifiers carry a test mark so as not to clash with the real catalogue
-- when this suite runs over a copy of the dump.
insert into public.artworks (catalog_id, artist, title, attributed_title, inventory_process_notes)
values ('AR-9800', 'ROTILI', 'Obra con dirección en la nota', 'UNCONFIRMED',
        'Ficha tomada de https://prueba-traslado.example/obra/9800/ el día del volcado.');

do $$
declare v_filas int; v_veces int;
begin
  for v_veces in 1..2 loop
    insert into public.external_links (artwork_id, url, title, link_type)
    select v.catalog_id, v.url, 'Ficha de prueba', 'MUSEUM_PAGE'
      from (values ('AR-9800', 'https://prueba-traslado.example/obra/9800/'))
             as v (catalog_id, url)
      join public.artworks a on a.catalog_id = v.catalog_id
     where a.inventory_process_notes like '%' || v.url || '%'
       and not exists (
         select 1 from public.external_links e
          where e.artwork_id = v.catalog_id and e.url = v.url
       );
    get diagnostics v_filas = row_count;

    if v_veces = 1 and v_filas <> 1 then
      raise exception 'FAIL: la primera pasada no ha trasladado la dirección de la nota de prueba';
    end if;
    if v_veces = 2 and v_filas <> 0 then
      raise exception 'FAIL: la segunda pasada ha duplicado el enlace de la nota de prueba';
    end if;
  end loop;

  raise notice 'OK: la guarda del not exists corta la segunda pasada antes del índice único, sin abortar la transacción';
exception
  when unique_violation then
    raise exception 'FAIL: la segunda pasada ha llegado al índice único: sin not exists, una migración reejecutada abortaría entera';
end $$;

-- And the opposite, which is what makes the assertion above mean something: an
-- address that is NOT in the note is not moved, even if it is written in the list.
-- It is the protection against a note rewritten between the migration being written and
-- being applied: rather than writing an address that is no longer where it said it was, nothing
-- is written and the count's guard denounces it.
do $$
declare v_filas int;
begin
  insert into public.external_links (artwork_id, url, title, link_type)
  select v.catalog_id, v.url, 'Dirección que no estaba en la nota', 'MUSEUM_PAGE'
    from (values ('AR-9800', 'https://prueba-traslado.example/otra-cosa/'))
           as v (catalog_id, url)
    join public.artworks a on a.catalog_id = v.catalog_id
   where a.inventory_process_notes like '%' || v.url || '%'
     and not exists (
       select 1 from public.external_links e
        where e.artwork_id = v.catalog_id and e.url = v.url
     );
  get diagnostics v_filas = row_count;

  if v_filas <> 0 then
    raise exception
      'FAIL: se ha trasladado una dirección que no está dentro de la nota de la obra';
  end if;
  raise notice 'OK: solo se traslada la dirección que la nota lleva de verdad dentro';
end $$;


rollback;
