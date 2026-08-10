-- ============================================================
-- The move of the addresses that today live inside a note
-- (RF-1401, RF-1402, RF-1405, RF-1407).
--
-- The previous migration created the table where a web address fits. This one takes out of
-- the prose the ones that have been in the catalogue since the first dump.
--
-- Measured against this base before writing a line: there are EXACTLY TWO inventory
-- notes with an address inside, and there is no other text column
-- of the catalogue that carries one —the fifteen text columns of
-- `artworks` and the seven of `images` were checked, and the only two `http` matches are
-- these:
--
--   AR-0001  «Todos los datos catalográficos, incluida la imagen, han sido
--             tomados de la web del MACVA: https://www.macvac.es/artista/
--             rotili-zampanoli-alberto/»
--   RC-0005  «… https://www.macvac.es/obra/saliente-en-el-espacio/»
--
-- In there that address cannot be clicked, cannot be searched, cannot be
-- checked and cannot be attributed to the photograph that came out of it. It is the case
-- that justifies the table, and it is not hypothetical: it is in the real catalogue.
--
-- ── THE ADDRESSES GO WRITTEN LITERALLY ──────────────────────
--
-- And not extracted with a regular expression over the prose. A `regexp` would
-- take the sentence's full stop stuck to the end of the URL —and a URL with one
-- dot too many is a URL that leads nowhere— or it would break with the
-- next note format. They are two rows that are reviewed at a glance, so
-- the correct way of taking them out is to read them and write them.
--
-- What IS done with the note is CHECKING THAT IT CONTAINS IT: every `insert` carries
-- `inventory_process_notes like '%' || url || '%'`. If somebody rewrote the note
-- between this being written and it being applied, the row is not moved and the guard at
-- the end says so loudly instead of writing an address that is no longer where
-- it said it was.
--
-- ── IT DOES NOT TOUCH A SINGLE LETTER OF THE NOTES ──────────
--
-- The sentence still reads well, it says something the link does not say —that from there
-- came ALL the cataloguing data, not only the image— and rewriting
-- the cataloguer's prose automatically is not a data migration, it is
-- correcting her. The address stays in both places and that is fine: the note
-- tells the story and the link can be clicked.
--
-- ── IT DISABLES NO TRIGGER, AND THAT HAS TO BE SAID ─────────
--
-- It is the exception and that is why it is asserted. The location and vocabulary moves
-- do `alter table public.artworks disable trigger artwork_audit_trail` because
-- they write over `artworks` and inside a migration `auth.uid()` is nobody:
-- signing the artwork with a null author would be lying about who touched it (RF-801).
-- Here it is not needed, and not out of carelessness:
--
--   · Only rows of a new table are INSERTED. `tg_row_audit` leaves `created_by`
--     null inside a migration, which is the truth: that row was created by
--     no person. That empty signature is besides the trail by which the test
--     recognises what this migration moved from what somebody added afterwards.
--   · Two columns of `public.images` are updated, which does NOT have `updated_at`,
--     nor `updated_by`, nor an audit trigger on UPDATE. The only one that fires is
--     `sync_photographed`, which calls `recalculate_photographed`, and that function
--     SKIPS THE WRITE when the value is already correct —checked in its
--     definition, which carries the `and a.photographed is distinct from …`—. Both
--     artworks are already marked as photographed, so no row of `artworks` is
--     rewritten and no date of any artwork moves.
--
-- That last point is not an assumption: `supabase/tests/external_links_from_notes.test.sql`
-- checks it.
--
-- ── IT APPLIES OVER AN EMPTY BASE WITHOUT COMPLAINING ───────
--
-- The automatic verification starts the stack over a clean volume and requires
-- «Migraciones OK» without having loaded any dump: there AR-0001 does not exist, there
-- is no note and there is nothing to move. That is why every `insert` is joined by
-- a `join` to the anchor row and does not take it for granted, and that is why the guard at the end
-- admits two counts and only two: 0 —a freshly migrated base— and 2 —the real catalogue—.
-- Any other number is a new note with an address inside that nobody has
-- looked at, and that has to be seen now and not a year from now.
-- ============================================================


-- ── 1. One link per artwork, anchored to the record ─────────
--
-- `MUSEUM_PAGE` for both, even though one of the two pages is the artist's inside
-- the museum's site: the type says WHAT CLASS OF SITE it is, and both are the MACVA's
-- site. `ARTIST_SITE` would be the artist's own site, which this is not.
--
-- The titles are not interchangeable and they are assigned by what there is on the other side, not
-- by the order in which they were written: `/obra/saliente-en-el-espacio/` is the artwork's
-- record and `/artista/rotili-zampanoli-alberto/` is the artist's page.
-- Putting them the wrong way round would leave the user clicking «Ficha en el MACVA» to
-- land on a biography.
--
-- `check_status`, `checked_at` and `checked_by` are NOT sent, and even if they were
-- the `external_link_check_freeze` trigger would set them to null: nobody has opened
-- those two pages today and a migration is in no position to assert that they
-- work (RF-1405). They are born UNCHECKED, which is not «broken» and is not «works».
--
-- The `not exists` is what makes running this body twice not duplicate
-- anything, and it goes BEFORE the unique index on purpose: the index is the safety
-- net and not the mechanism, because an `insert` that clashes against an index
-- aborts the whole transaction and here what is wanted is for the second pass
-- to do nothing and carry on.
insert into public.external_links (artwork_id, url, title, link_type, note)
select v.catalog_id, v.url, v.title, 'MUSEUM_PAGE', v.note
  from (values
    ('AR-0001',
     'https://www.macvac.es/artista/rotili-zampanoli-alberto/',
     'Página del artista en el MACVA',
     'De aquí salen todos los datos catalográficos de la ficha, incluida la fotografía. La nota de inventario lo cuenta con más palabras y se conserva tal cual.'),
    ('RC-0005',
     'https://www.macvac.es/obra/saliente-en-el-espacio/',
     'Ficha en el MACVA',
     'De aquí salen todos los datos catalográficos de la ficha, incluida la fotografía. La nota de inventario lo cuenta con más palabras y se conserva tal cual.')
  ) as v (catalog_id, url, title, note)
  join public.artworks a on a.catalog_id = v.catalog_id
 where a.inventory_process_notes like '%' || v.url || '%'
   and not exists (
     select 1 from public.external_links e
      where e.artwork_id = v.catalog_id and e.url = v.url
   );


-- ── 2. One link per photograph, anchored to the shot ────────
--
-- It is what RF-417 was missing. Until now `provenance` could say that a
-- photograph came from another catalogue, but not FROM WHICH: a provenance with no origin
-- is half an answer, and the missing half is exactly the one needed to go back
-- to the source or to ask for reproduction permission.
--
-- The link is repeated —the same address hangs from the artwork and from its photograph— and
-- that is not a duplication that has to be normalised, they are two different facts:
-- «this record is documented here» and «this image was downloaded from here». Each one
-- has its own note and its own check state, and the day the museum moves
-- the page the one that matters to fix first is the second. That is why the unique
-- indexes are (artwork, url) and (photo, url) separately and not one alone over the url.
insert into public.external_links (image_id, url, title, link_type, note)
select v.image_id, v.url, 'De dónde salió esta reproducción', 'PHOTO_SOURCE', v.note
  from (values
    ('AR-0001_v1', 'AR-0001',
     'https://www.macvac.es/artista/rotili-zampanoli-alberto/',
     'La reproducción se descargó de esta página del MACVA. No es una toma propia: no se le ofrece ajuste de color, porque sería retocar el revelado de otra persona sobre una obra que no se ha visto con esa luz.'),
    ('RC-0005_v1', 'RC-0005',
     'https://www.macvac.es/obra/saliente-en-el-espacio/',
     'La reproducción se descargó de esta página del MACVA. No es una toma propia: no se le ofrece ajuste de color, porque sería retocar el revelado de otra persona sobre una obra que no se ha visto con esa luz.')
  ) as v (image_id, catalog_id, url, note)
  join public.images   i on i.image_id   = v.image_id
  join public.artworks a on a.catalog_id = v.catalog_id
 where a.inventory_process_notes like '%' || v.url || '%'
   and not exists (
     select 1 from public.external_links e
      where e.image_id = v.image_id and e.url = v.url
   );


-- ── 3. And now it can be said that they are not our own ─────
--
-- The evidence is written in the record itself —«incluida la imagen»— and both
-- are besides the two already-cropped reproductions that the edge measurement
-- identified by their file name, `AR-0001_nmjb8v5w` and `RC-0005_xkq1cncq`:
-- «escaneos o descargas sin marco ni pared, con el contenido a 4-12 px del borde»
-- (docs/revision/deteccion-de-bordes-medicion.md, decision 6).
--
-- THE OTHER TWO ARE NOT TOUCHED. The batch's count speaks of four reproductions
-- taken from other catalogues; of two of them there is no evidence of which they are, and
-- marking on a hunch is inventing the datum in precisely the column that exists so as not to
-- invent it. They stay as `OWN` and the cataloguer will identify them with the artwork
-- in front; meanwhile the screen reads them as our own, which is what is on record
-- today, and not as «somebody else's, we do not know from where», which would be an assertion
-- nobody has made.
--
-- The `and provenance = 'OWN'` and the link's `exists` are not ornament:
--
--   · `provenance = 'OWN'` makes the statement idempotent and, above all, prevents
--     a second pass from treading on the classification a person may have made afterwards.
--   · The `exists` TIES THE MARK TO ITS EVIDENCE. Only the photograph whose
--     origin link has just landed is marked: if step 2 inserted nothing —because the
--     note changed, or because the base is empty— this statement marks nothing either.
--     No photograph is left said to be somebody else's without saying where it came from.
update public.images i
   set provenance = 'OTHER_CATALOG'
 where i.image_id in ('AR-0001_v1', 'RC-0005_v1')
   and i.provenance = 'OWN'
   and exists (
     select 1 from public.external_links e
      where e.image_id = i.image_id
        and e.link_type = 'PHOTO_SOURCE'
        and e.active
   );


-- ── 4. The count, which is what turns this into a
--       migration and not an attempt ──────────────────────────
do $$
declare
  v_notas        int;
  v_de_obra      int;
  v_de_foto      int;
  v_marcadas     int;
  v_sin_origen   int;
  v_propias      int;
  v_sin_firma    int;
begin
  -- How many inventory notes carry an address inside. 0 over a freshly
  -- migrated base; 2 over the real catalogue. Any other number means that
  -- a new note with an address has appeared and that it has to be moved by
  -- hand: it is exactly the failure this migration exists to end, and
  -- letting it pass in silence would be starting over.
  select count(*) into v_notas
    from public.artworks
   where inventory_process_notes ilike '%http%';

  if v_notas not in (0, 2) then
    raise exception
      'Hay % notas de inventario con una dirección dentro y esta migración conoce 2: traslada la nueva a mano antes de seguir',
      v_notas;
  end if;

  -- The unsigned links are those a migration moved: `tg_row_audit` leaves
  -- `created_by` null when there is no session, and that distinguishes what this
  -- migration moved from what a person added. They have to be two per note —the one for the
  -- record and the one for the photograph— and none more.
  select count(*) into v_de_obra
    from public.external_links
   where artwork_id is not null and link_type = 'MUSEUM_PAGE' and created_by is null;

  select count(*) into v_de_foto
    from public.external_links
   where image_id is not null and link_type = 'PHOTO_SOURCE' and created_by is null;

  if v_de_obra <> v_notas or v_de_foto <> v_notas then
    raise exception
      'El traslado ha dejado % enlaces de ficha y % de fotografía para % notas con dirección: algo no ha emparejado',
      v_de_obra, v_de_foto, v_notas;
  end if;

  -- And none hanging from a place it did not come from: the address of every unsigned
  -- link has to still be inside the note it was taken from. This
  -- catches at once a badly anchored `insert` and a rewritten note.
  select count(*) into v_sin_firma
    from public.external_links e
   where e.created_by is null
     and not exists (
       select 1 from public.artworks a
        where a.inventory_process_notes like '%' || e.url || '%'
     );

  if v_sin_firma > 0 then
    raise exception
      '% enlaces trasladados llevan una dirección que ya no está en ninguna nota de inventario',
      v_sin_firma;
  end if;

  -- The marked photographs have to be as many as the notes, and not one more: the
  -- other way of failing is marking too many, and it is as serious as marking too few.
  select count(*) into v_marcadas
    from public.images
   where provenance = 'OTHER_CATALOG'
     and exists (
       select 1 from public.external_links e
        where e.image_id = images.image_id and e.link_type = 'PHOTO_SOURCE'
     );

  if v_marcadas <> v_notas then
    raise exception
      '% fotografías han quedado como tomadas de otro catálogo con su enlace de origen, y las notas con dirección son %',
      v_marcadas, v_notas;
  end if;

  -- And the other half of the same assertion, the one that closes the `update`: at the moment of
  -- applying this the catalogue's 44 photographs are worth `OWN`, so NONE
  -- can be left said to be somebody else's without its origin link. A badly written `where` in
  -- step 3 would be caught here and not six months later. It is a guard for the moment of
  -- the move and not a schema invariant: RF-1407 later allows a
  -- person to mark a reproduction as somebody else's and leave the origin pending.
  select count(*) into v_sin_origen
    from public.images
   where provenance <> 'OWN'
     and not exists (
       select 1 from public.external_links e
        where e.image_id = images.image_id and e.link_type = 'PHOTO_SOURCE'
     );

  if v_sin_origen > 0 then
    raise exception
      '% fotografías han quedado dichas ajenas sin decir de dónde salieron: el traslado ha marcado de más',
      v_sin_origen;
  end if;

  select count(*) into v_propias
    from public.images where provenance = 'OWN';

  -- Out loud and not as an exception, because it is not a failure of the migration but
  -- work left for a person: the batch's count speaks of four
  -- reproductions taken from other catalogues and here there is written evidence of only
  -- two. The other two go on counting as our own until somebody
  -- recognises them with the artwork in front.
  raise notice
    'Trasladadas % direcciones de nota: % enlaces de ficha y % de fotografía. % fotografías marcadas como tomadas de otro catálogo; quedan % como propias, y de las cuatro reproducciones del lote faltan por identificar las que no tienen evidencia escrita.',
    v_notas, v_de_obra, v_de_foto, v_marcadas, v_propias;
end $$;
