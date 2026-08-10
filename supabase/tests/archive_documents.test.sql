-- RF-515: document types are an open vocabulary with a surrogate key, and
--         the archival classification is a tree and not a text with a
--         separator convention. A document may be unclassified, and
--         its physical location points to the place tree that already exists.
-- RF-516: a document relates to any number of artworks and
--         exhibitions, through bridge tables: with one foreign key per side, a
--         clipping mentioning three artworks would force the uploaded PDF to be tripled.
-- RF-408, RF-110: a document admits a single digitised file, half
--         a file description does not exist, and there is no «digitised» flag
--         that could contradict the path next to it.
-- RF-218: «Sin revisar» is not «no», carried from the field to the documentary block, and
--         through both doors — and with the three previous blocks, which this
--         group REPLACES and could have swallowed with nothing warning about it.
-- RF-215, ADR-006: a place with archive documents inside is not withdrawn either.
--         It is the easiest half-applied guardrail of this design to forget.
-- RF-517, RF-903: the links are withdrawn, not deleted, and adding them again
--         restores them instead of clashing against uniqueness.
-- RF-205: what is pending is born pending.
-- RF-901, RF-902: nothing is deleted, and the withdrawal leaves a trace.
-- RF-909: duplicates are resolved by review, not by uniqueness of the title.
-- RF-111, RF-113: the five tables are born closed and nobody has DELETE.
--
-- What is checked is what the `check` can check and the client must not
-- check again: that a document with nothing to name it does not go in, that the
-- shelfmark is unique but optional and editable —unlike an artwork's key—, that
-- the archival tree does not close on itself, that half a
-- file description does not exist and neither does a zero-byte file, that a
-- document hangs from three artworks without duplicating itself, and that the research-state
-- column cannot lie through either of its two doors.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- One cataloguer, one reader, two artworks and one exhibition. The profiles are created by
-- the auth.users trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cat-archivo@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-archivo@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'La del recorte de prensa', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'La que sale al fondo', 'UNCONFIRMED'),
  ('AR-9702', 'ROTILI', 'La tercera de la foto', 'UNCONFIRMED');

insert into public.exhibitions (title, year) values ('Muestra documentada', 1985);

-- ── 1. The vocabulary is born seeded ─────────────────────────
-- An empty master table leaves the selector blank on the first day and forces one to invent
-- the vocabulary while cataloguing. They are the ten values v11 enumerates.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.document_types where active;
  if v_n < 10 then
    raise exception 'FAIL: el vocabulario de tipos de documento no está sembrado (% filas)', v_n;
  end if;
  if not exists (select 1 from public.document_types where name = 'Recorte de prensa') then
    raise exception 'FAIL: falta «Recorte de prensa», que es el caso de uso del enunciado';
  end if;
  raise notice 'OK: los diez tipos de documento de v11 están sembrados (RF-515)';
end $$;

-- ── 2. A type is unique by comparison key ────────────────────
-- «Recorte de prensa» and «recorte de prensa» are the same type, and discovering it
-- when there are already two rows costs going through the whole archive again.
do $$
begin
  begin
    insert into public.document_types (name) values ('recorte de prensa');
    raise exception 'FAIL: ha entrado un tipo de documento duplicado salvo mayúsculas';
  exception when unique_violation then
    raise notice 'OK: el tipo de documento es único por clave de comparación (RF-515)';
  end;

  begin
    insert into public.document_types (name) values ('  ');
    raise exception 'FAIL: ha entrado un tipo de documento en blanco';
  exception when check_violation then
    raise notice 'OK: un tipo en blanco no clasifica nada';
  end;

  begin
    insert into public.document_types (name) values (' Telegrama ');
    raise exception 'FAIL: ha entrado un tipo con espacios alrededor';
  exception when check_violation then
    raise notice 'OK: el nombre del tipo se guarda recortado';
  end;

  -- And extending the list does NOT require a migration: that is the reason it is a
  -- master table and not an enum.
  insert into public.document_types (name) values ('Telegrama');
  raise notice 'OK: la usuaria amplía el vocabulario sin desplegar nada (RF-515)';
end $$;

-- ── 3. The archival tree: siblings and roots ─────────────────
-- It is v11's `fondo_serie`, which was «fund → series → subseries» inside a
-- text. The same mistake as the physical location before ADR-006, avoided before
-- committing it a second time.
do $$
declare v_fondo uuid; v_serie uuid;
begin
  insert into public.archive_series (name) values ('Fondo Alberto Rotili')
  returning id into v_fondo;

  insert into public.archive_series (parent_id, name) values (v_fondo, 'Correspondencia')
  returning id into v_serie;

  -- Two homonymous roots: both partial indexes are needed, because in SQL
  -- one null is not equal to another null and without the roots one this would pass.
  begin
    insert into public.archive_series (name) values ('fondo alberto rotili');
    raise exception 'FAIL: han entrado dos fondos homónimos';
  exception when unique_violation then
    raise notice 'OK: dos raíces no se llaman igual (RF-515)';
  end;

  begin
    insert into public.archive_series (parent_id, name) values (v_fondo, 'CORRESPONDENCIA');
    raise exception 'FAIL: han entrado dos hermanas homónimas';
  exception when unique_violation then
    raise notice 'OK: dos hermanas no se llaman igual (RF-515)';
  end;

  -- But the same series under another fund does: every one has «Correspondencia».
  insert into public.archive_series (name) values ('Fondo María Ruiz Campins');
  insert into public.archive_series (parent_id, name)
  values ((select id from public.archive_series where name = 'Fondo María Ruiz Campins'),
          'Correspondencia');
  raise notice 'OK: la misma serie bajo dos fondos son dos nodos';
end $$;

-- ── 4. The tree does not close on itself ─────────────────────
-- A series inside its own subseries leaves the tree unrecoverable: no
-- recursive query finishes and the node disappears from the hierarchy without having been
-- deleted.
do $$
declare v_fondo uuid; v_serie uuid; v_sub uuid;
begin
  select id into v_fondo from public.archive_series where name = 'Fondo Alberto Rotili';
  select id into v_serie from public.archive_series
   where name = 'Correspondencia' and parent_id = v_fondo;

  insert into public.archive_series (parent_id, name) values (v_serie, 'Cartas a comisarios')
  returning id into v_sub;

  begin
    update public.archive_series set parent_id = v_fondo where id = v_fondo;
    raise exception 'FAIL: una serie se ha metido dentro de sí misma';
  exception when raise_exception then
    raise notice 'OK: una serie no está dentro de sí misma: %', sqlerrm;
  end;

  begin
    update public.archive_series set parent_id = v_sub where id = v_fondo;
    raise exception 'FAIL: el fondo se ha metido dentro de su propia subserie';
  exception when raise_exception then
    raise notice 'OK: el árbol archivístico no admite ciclos: %', sqlerrm;
  end;

  -- And moving it does, which is the reason `parent_id` is mutable.
  update public.archive_series set parent_id = v_fondo where id = v_sub;
  if (select parent_id from public.archive_series where id = v_sub) <> v_fondo then
    raise exception 'FAIL: no se ha podido mover una serie de sitio';
  end if;
  update public.archive_series set parent_id = v_serie where id = v_sub;
  raise notice 'OK: mover una serie es un update de una fila (RF-515, ADR-006)';
end $$;

-- ── 5. A minimal document goes in, and what is pending stays empty ─
-- The title and nothing else: what is known on emptying a folder onto the table.
-- Everything else is optional on purpose, starting with the fund — v11 forced one
-- to choose an artist and a clipping about a group show of the two cannot.
do $$
declare v_fila public.archive_documents%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  insert into public.archive_documents (title)
  values ('Recorte sin más datos');

  select * into v_fila from public.archive_documents where title = 'Recorte sin más datos';

  if v_fila.archive_code is not null then
    raise exception 'FAIL: la signatura no nace nula';
  end if;
  if v_fila.artist_fund is not null then
    raise exception 'FAIL: el fondo no nace nulo, y v11 obligaba a elegir';
  end if;
  if v_fila.document_type_id is not null or v_fila.archive_series_id is not null
     or v_fila.physical_place_id is not null then
    raise exception 'FAIL: alguna relación opcional no nace nula';
  end if;
  if v_fila.file_path is not null then
    raise exception 'FAIL: el fichero digitalizado no nace ausente';
  end if;
  if v_fila.date_text <> '' then
    raise exception 'FAIL: la fecha compuesta no nace vacía (%)', v_fila.date_text;
  end if;
  if not v_fila.active then
    raise exception 'FAIL: un documento nuevo no nace activo';
  end if;
  raise notice 'OK: un documento mínimo entra y todo lo demás es opcional (RF-205)';
end $$;

-- ── 6. With no title there is no document ────────────────────
do $$
begin
  begin
    insert into public.archive_documents (title) values ('   ');
    raise exception 'FAIL: ha entrado un documento sin nada que lo nombre';
  exception when check_violation then
    raise notice 'OK: un documento sin título no se puede volver a encontrar';
  end;
end $$;

-- ── 7. The shelfmark: unique, optional and EDITABLE ──────────
-- It is the deliberate difference from `catalog_id`, which is the label stuck to a
-- real artwork and that is why it is not edited (RF-204). This one is not stuck to anything yet,
-- and an archival classification gets reorganised.
do $$
declare v_id uuid;
begin
  insert into public.archive_documents (archive_code, title)
  values ('AR-ARCH-0001', 'Carta de 1985')
  returning id into v_id;

  begin
    insert into public.archive_documents (archive_code, title)
    values ('ar-arch-0001', 'La misma signatura escrita en minúsculas');
    raise exception 'FAIL: han entrado dos signaturas equivalentes';
  exception when unique_violation then
    raise notice 'OK: la signatura es única por clave de comparación';
  end;

  -- Editable, which is what it would not be as a primary key.
  update public.archive_documents set archive_code = 'AR-ARCH-0002' where id = v_id;
  if (select archive_code from public.archive_documents where id = v_id) <> 'AR-ARCH-0002' then
    raise exception 'FAIL: la signatura no se ha podido corregir';
  end if;

  -- And many documents with no shelfmark coexist: `place_key` is `strict`, so
  -- it returns null and the unique index ignores them.
  insert into public.archive_documents (title) values ('Sin signatura 1'), ('Sin signatura 2');
  raise notice 'OK: la signatura es única, opcional y editable (RF-515)';

  begin
    insert into public.archive_documents (archive_code, title) values ('  ', 'Signatura en blanco');
    raise exception 'FAIL: ha entrado una signatura en blanco';
  exception when check_violation then
    raise notice 'OK: una signatura en blanco es un hueco con índice único';
  end;
end $$;

-- ── 8. Two documents can be described alike (RF-909) ─────────
do $$
begin
  insert into public.archive_documents (title) values ('Nota de prensa de la inauguración');
  insert into public.archive_documents (title) values ('Nota de prensa de la inauguración');
  raise notice 'OK: dos documentos se describen igual; los duplicados se revisan (RF-909)';
end $$;

-- ── 9. ADR-004's structured date ─────────────────────────────
-- The same shape as in the provenance links, with the same difference
-- from the artwork: here a range can start and end in the same year, because
-- a 1985 correspondence folder is a real range.
do $$
declare v_id uuid; v_texto text;
begin
  insert into public.archive_documents
         (title, start_year, end_year, approximate_date)
  values ('Correspondencia con la galería', 1985, 1985, true)
  returning id into v_id;

  select date_text into v_texto from public.archive_documents where id = v_id;
  if v_texto <> 'c. 1985-1985' then
    raise exception 'FAIL: la fecha compuesta no es la esperada (%)', v_texto;
  end if;

  -- The note rules over the composition, as in the artwork and in the provenance.
  update public.archive_documents set date_note = 'entre la posguerra y los sesenta' where id = v_id;
  select date_text into v_texto from public.archive_documents where id = v_id;
  if v_texto <> 'entre la posguerra y los sesenta' then
    raise exception 'FAIL: la nota de fecha no manda sobre la compuesta (%)', v_texto;
  end if;

  begin
    update public.archive_documents set date_text = 'a mano' where id = v_id;
    raise exception 'FAIL: se ha escrito directamente en una columna generada';
  exception when generated_always then
    raise notice 'OK: la fecha compuesta no se escribe nunca a mano (ADR-004)';
  end;

  begin
    insert into public.archive_documents (title, start_year) values ('Del año 999', 999);
    raise exception 'FAIL: ha entrado un año implausible';
  exception when check_violation then
    raise notice 'OK: un año fuera de rango es una errata, no una fecha';
  end;

  begin
    insert into public.archive_documents (title, start_year, end_year)
    values ('Rango invertido', 1990, 1985);
    raise exception 'FAIL: ha entrado un rango invertido';
  exception when check_violation then
    raise notice 'OK: un rango invertido se rechaza';
  end;

  begin
    insert into public.archive_documents (title, end_year) values ('Final sin principio', 1985);
    raise exception 'FAIL: ha entrado media fecha: un final sin principio';
  exception when check_violation then
    raise notice 'OK: media fecha no existe';
  end;

  begin
    insert into public.archive_documents (title, unconfirmed_date)
    values ('Dudosa sin año', true);
    raise exception 'FAIL: ha entrado una bandera de duda sin año que poner en duda';
  exception when check_violation then
    raise notice 'OK: las banderas hablan de un año («[?]» a secas no dice nada)';
  end;
end $$;

-- ── 10. The digitised file: all or nothing ───────────────────
-- RF-408 and the same criterion as a photograph's corrected copy: half
-- a file description does not exist. And there is NO «digitised» column: the
-- answer is `file_path is not null`, which cannot contradict the file.
do $$
declare v_id uuid; v_digitalizados int;
begin
  select id into v_id from public.archive_documents where title = 'Carta de 1985';

  begin
    update public.archive_documents set file_path = 'documentos/ar-arch-0002.pdf'
     where id = v_id;
    raise exception 'FAIL: ha entrado una ruta de fichero sin tamaño, tipo ni fecha';
  exception when check_violation then
    raise notice 'OK: media descripción de un fichero no existe (RF-408)';
  end;

  begin
    update public.archive_documents set
      file_path = 'documentos/ar-arch-0002.pdf', file_size_bytes = 0,
      mime_type = 'application/pdf', uploaded_at = now()
     where id = v_id;
    raise exception 'FAIL: ha entrado un fichero de cero bytes';
  exception when check_violation then
    raise notice 'OK: un fichero de cero bytes es un fallo de subida disfrazado';
  end;

  update public.archive_documents set
    file_path = 'documentos/ar-arch-0002.pdf', file_size_bytes = 1234567,
    mime_type = 'application/pdf', uploaded_at = now()
   where id = v_id;

  -- The flag that does NOT exist: it is answered with a query and not with a column
  -- that one day says the opposite of the file.
  select count(*) into v_digitalizados
    from public.archive_documents where file_path is not null and active;
  if v_digitalizados <> 1 then
    raise exception 'FAIL: «digitalizado» no se contesta con la ruta (% filas)', v_digitalizados;
  end if;

  -- And removing the file is removing it whole, not leaving the path dangling.
  update public.archive_documents set
    file_path = null, file_size_bytes = null, mime_type = null, uploaded_at = null
   where id = v_id;
  raise notice 'OK: el fichero digitalizado es todo o nada, y no hay bandera que lo contradiga';

  -- It is left in place for the rest of the test file.
  update public.archive_documents set
    file_path = 'documentos/ar-arch-0002.pdf', file_size_bytes = 1234567,
    mime_type = 'application/pdf', uploaded_at = now()
   where id = v_id;
end $$;

-- ── 11. The bucket that stores the file, checked ─────────────
-- RF-110 and RNF-111: no file is readable without a signature, and the digitised
-- document goes to the private bucket that already exists, with no new policy. What
-- this block really checks is that the bucket is still private and that
-- it has a size ceiling: with no ceiling, a scanned half-gigabyte file
-- would go in silently and nobody would find out until the bill.
--
-- The specific value is NOT asserted here and is NOT copied to any constraint of the
-- table: it is a platform setting, and a test demanding the exact 60 MiB
-- would go red the day the owner decides to raise them, which is precisely the
-- decision this group leaves open.
do $$
declare v_publico boolean; v_limite bigint; v_politicas int;
begin
  select public, file_size_limit into v_publico, v_limite
    from storage.buckets where id = 'obras';

  if v_publico is null then
    raise exception 'FAIL: no existe el bucket donde va el documento digitalizado';
  end if;
  if v_publico then
    raise exception 'FAIL: el bucket de los ficheros es legible sin firma (RF-110, RNF-111)';
  end if;
  if v_limite is null then
    raise exception 'FAIL: el bucket no tiene techo de tamaño por fichero';
  end if;

  -- And the storage.objects policies that already exist cover the new prefix
  -- with no added policy: they are written over the whole bucket.
  select count(*) into v_politicas
    from pg_policies where schemaname = 'storage' and tablename = 'objects';
  if v_politicas < 3 then
    raise exception 'FAIL: el bucket de ficheros se ha quedado sin sus políticas (%)', v_politicas;
  end if;

  raise notice 'OK: el fichero digitalizado va a un bucket privado con techo (% bytes) y sin política nueva (RF-408, RF-110)', v_limite;
end $$;

-- ── 12. A type in use is not withdrawn ───────────────────────
do $$
declare v_tipo uuid; v_doc uuid;
begin
  select id into v_tipo from public.document_types where name = 'Carta';
  select id into v_doc from public.archive_documents where title = 'Carta de 1985';

  update public.archive_documents set document_type_id = v_tipo where id = v_doc;

  begin
    update public.document_types set active = false where id = v_tipo;
    raise exception 'FAIL: se ha retirado un tipo que todavía clasifica documentos';
  exception when raise_exception then
    raise notice 'OK: un tipo en uso no se retira: %', sqlerrm;
  end;

  -- A document in the wastebasket does not prevent it, as in the other master tables:
  -- requiring the wastebasket to be emptied before withdrawing a type would make the
  -- wastebasket get in the way.
  update public.archive_documents set active = false where id = v_doc;
  update public.document_types set active = false where id = v_tipo;
  raise notice 'OK: un documento en la papelera no impide retirar su tipo';

  update public.document_types set active = true where id = v_tipo;
  update public.archive_documents set active = true where id = v_doc;
end $$;

-- ── 13. A series with content is not withdrawn ───────────────
do $$
declare v_fondo uuid; v_hoja uuid; v_doc uuid;
begin
  select id into v_fondo from public.archive_series where name = 'Fondo Alberto Rotili';
  -- A leaf of the tree, so the documents check is really
  -- exercised: over a series with subseries the children one would fire first and this
  -- block would pass without ever reaching the one this group adds.
  select id into v_hoja from public.archive_series where name = 'Cartas a comisarios';
  select id into v_doc from public.archive_documents where title = 'Carta de 1985';

  begin
    update public.archive_series set active = false where id = v_fondo;
    raise exception 'FAIL: se ha retirado un fondo que todavía contiene series';
  exception when raise_exception then
    raise notice 'OK: una serie con subseries dentro no se retira: %', sqlerrm;
  end;

  -- The leaf, empty, is withdrawn and restored.
  update public.archive_series set active = false where id = v_hoja;
  update public.archive_series set active = true where id = v_hoja;

  update public.archive_documents set archive_series_id = v_hoja where id = v_doc;

  begin
    update public.archive_series set active = false where id = v_hoja;
    raise exception 'FAIL: se ha retirado una serie que todavía tiene documentos dentro';
  exception when raise_exception then
    if position('documentos' in sqlerrm) = 0 then
      raise exception 'FAIL: ha saltado otra comprobación, no la de documentos: %', sqlerrm;
    end if;
    raise notice 'OK: una serie con documentos dentro no se retira: %', sqlerrm;
  end;

  -- And with the document in the wastebasket it is, as in the other master tables.
  update public.archive_documents set active = false where id = v_doc;
  update public.archive_series set active = false where id = v_hoja;
  update public.archive_series set active = true where id = v_hoja;
  update public.archive_documents set active = true where id = v_doc;
  raise notice 'OK: un documento en la papelera no impide retirar su serie';
end $$;

-- ── 14. A place with documents inside is not either ──────────
-- The easiest half-applied guardrail of this whole design to forget: the
-- function that prevents it is REPLACED in this migration, and a replacement that
-- swallows one of the two previous blocks breaks nothing visible. That is why all
-- three are checked.
do $$
declare v_edificio uuid; v_balda uuid; v_doc uuid; v_obra text;
begin
  insert into public.physical_places (name) values ('Edificio del archivo de prueba')
  returning id into v_edificio;
  insert into public.physical_places (parent_id, name) values (v_edificio, 'Balda de prueba')
  returning id into v_balda;

  -- First block, the usual one: a place with places inside.
  begin
    update public.physical_places set active = false where id = v_edificio;
    raise exception 'FAIL: se ha retirado un lugar que todavía contiene otros lugares';
  exception when raise_exception then
    raise notice 'OK: primer bloque en pie — un lugar con lugares dentro no se retira';
  end;

  -- Second block: a place with artworks inside.
  update public.artworks set physical_place_id = v_balda where catalog_id = 'AR-9700';
  begin
    update public.physical_places set active = false where id = v_balda;
    raise exception 'FAIL: se ha retirado un lugar que todavía tiene obras dentro';
  exception when raise_exception then
    raise notice 'OK: segundo bloque en pie — un lugar con obras dentro no se retira';
  end;
  update public.artworks set physical_place_id = null where catalog_id = 'AR-9700';

  -- Third block, the one this group adds: a place with documents inside.
  select id into v_doc from public.archive_documents where title = 'Carta de 1985';
  update public.archive_documents set physical_place_id = v_balda where id = v_doc;

  begin
    update public.physical_places set active = false where id = v_balda;
    raise exception 'FAIL: se ha retirado el lugar donde está el archivo entero';
  exception when raise_exception then
    if position('documentos' in sqlerrm) = 0 then
      raise exception 'FAIL: ha saltado otra comprobación, no la de documentos: %', sqlerrm;
    end if;
    raise notice 'OK: tercer bloque — un lugar con documentos de archivo dentro no se retira: %', sqlerrm;
  end;

  -- And with the document in the wastebasket it is, as with the artworks.
  update public.archive_documents set active = false where id = v_doc;
  update public.physical_places set active = false where id = v_balda;
  update public.physical_places set active = true where id = v_balda;
  update public.archive_documents set active = true where id = v_doc;
  raise notice 'OK: un documento en la papelera no impide retirar su lugar (RF-215, ADR-006)';
end $$;

-- ── 15. A document hangs from several artworks (RF-516) ──────
-- It is the case that justifies the bridge table: with v11's foreign key, this
-- clipping would be three rows and three uploaded PDFs.
do $$
declare v_doc uuid; v_n int;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  insert into public.archive_documents (title, document_type_id)
  values ('Recorte que menciona tres obras',
          (select id from public.document_types where name = 'Recorte de prensa'))
  returning id into v_doc;

  perform public.document_artwork('AR-9700', v_doc, 'reproducida en la página 3');
  perform public.document_artwork('AR-9701', v_doc);
  perform public.document_artwork('AR-9702', v_doc, 'aparece al fondo de la fotografía');

  select count(*) into v_n from public.artwork_documents
   where document_id = v_doc and active;
  if v_n <> 3 then
    raise exception 'FAIL: el documento no se ha vinculado con las tres obras (%)', v_n;
  end if;

  select count(*) into v_n from public.archive_documents
   where title = 'Recorte que menciona tres obras';
  if v_n <> 1 then
    raise exception 'FAIL: el documento se ha duplicado, que es lo que la puente evita (%)', v_n;
  end if;

  -- And with an exhibition as well, which is the show's poster or leaflet.
  perform public.document_exhibition(
    (select id from public.exhibitions where title = 'Muestra documentada'),
    v_doc, 'la muestra de la que habla el recorte');

  raise notice 'OK: un documento, tres obras y una exposición, una sola fila y un solo PDF (RF-516)';
end $$;

-- ── 16. A document is linked once to each artwork ────────────
do $$
declare v_doc uuid;
begin
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';

  begin
    insert into public.artwork_documents (catalog_id, document_id)
    values ('AR-9700', v_doc);
    raise exception 'FAIL: ha entrado un vínculo duplicado';
  exception when unique_violation then
    raise notice 'OK: un documento se vincula una vez con cada obra';
  end;

  begin
    insert into public.exhibition_documents (exhibition_id, document_id)
    values ((select id from public.exhibitions where title = 'Muestra documentada'), v_doc);
    raise exception 'FAIL: ha entrado un vínculo con la exposición duplicado';
  exception when unique_violation then
    raise notice 'OK: un documento se vincula una vez con cada exposición';
  end;
end $$;

-- ── 17. Linking a document again RESTORES it ─────────────────
-- RF-517, which revises RF-903. With uniqueness also covering the withdrawn
-- links, an `insert` of a pair that is in the wastebasket clashes against the
-- index and the interface would turn an «Añadir» into an incomprehensible error.
do $$
declare v_doc uuid; v_fila public.artwork_documents%rowtype; v_expo uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';

  update public.artwork_documents set active = false
   where catalog_id = 'AR-9700' and document_id = v_doc;

  v_fila := public.document_artwork('AR-9700', v_doc);

  if not v_fila.active then
    raise exception 'FAIL: volver a vincular no ha restaurado el vínculo (RF-517)';
  end if;
  -- What is not sent is not erased: the «Añadir» form comes in blank and
  -- cannot empty the note somebody wrote.
  if v_fila.note <> 'reproducida en la página 3' then
    raise exception 'FAIL: la nota investigada se ha perdido al restaurar (%)', v_fila.note;
  end if;
  if (select count(*) from public.artwork_documents
       where catalog_id = 'AR-9700' and document_id = v_doc) <> 1 then
    raise exception 'FAIL: restaurar ha dejado dos filas';
  end if;

  -- And a new note does rule.
  v_fila := public.document_artwork('AR-9700', v_doc, 'reproducida en la página 3, a color');
  if v_fila.note <> 'reproducida en la página 3, a color' then
    raise exception 'FAIL: la nota nueva no ha entrado (%)', v_fila.note;
  end if;

  -- The same on the exhibition's side.
  select id into v_expo from public.exhibitions where title = 'Muestra documentada';
  update public.exhibition_documents set active = false
   where exhibition_id = v_expo and document_id = v_doc;
  if not (public.document_exhibition(v_expo, v_doc)).active then
    raise exception 'FAIL: volver a vincular con la exposición no ha restaurado';
  end if;

  raise notice 'OK: volver a añadir un vínculo retirado lo restaura y conserva su nota (RF-517)';
end $$;

-- ── 18. Un lector no archiva ─────────────────────────────────
do $$
declare v_doc uuid; v_fila public.artwork_documents%rowtype;
begin
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

  v_fila := public.document_artwork('AR-9701', v_doc);
  raise exception 'FAIL: un lector ha podido vincular un documento con una obra';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no archiva: %', sqlerrm;
end $$;

do $$
declare v_doc uuid; v_expo uuid; v_fila public.exhibition_documents%rowtype;
begin
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';
  select id into v_expo from public.exhibitions where title = 'Muestra documentada';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

  v_fila := public.document_exhibition(v_expo, v_doc);
  raise exception 'FAIL: un lector ha podido vincular un documento con una exposición';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector tampoco vincula con exposiciones: %', sqlerrm;
end $$;

-- ── 19. «Sin revisar» is not «no», through both doors ────────
--
-- RF-218. An artwork with no linked documents is not an artwork of which nothing
-- survives: it is an artwork whose archive nobody has looked at. The column is only worth
-- something if it cannot lie, and for that both doors are needed.
do $$
declare v_doc uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  if (select documentation_status from public.artworks where catalog_id = 'AR-9700')
     <> 'UNREVIEWED' then
    raise exception 'FAIL: la documentación no nace «Sin revisar» (RF-205)';
  end if;

  -- What IS allowed, and it is intentional: links with the state on «Sin
  -- revisar». Having a datum is not having done the research.
  if not exists (select 1 from public.artwork_documents
                  where catalog_id = 'AR-9700' and active) then
    raise exception 'FAIL: el fixture de este bloque no tiene el vínculo que necesita';
  end if;

  begin
    update public.artworks set documentation_status = 'NONE_FOUND'
     where catalog_id = 'AR-9700';
    raise exception 'FAIL: se ha declarado la documentación investigada sin resultado con vínculos debajo';
  exception when raise_exception then
    raise notice 'OK: primera puerta — la columna no puede contradecir a los vínculos: %', sqlerrm;
  end;

  -- With the links withdrawn, it can be declared.
  update public.artwork_documents set active = false where catalog_id = 'AR-9700';
  update public.artworks set documentation_status = 'NONE_FOUND' where catalog_id = 'AR-9700';

  -- And then the second door closes from the other side. With a NEW
  -- document, so that what rejects the operation is the check and not the
  -- uniqueness of a pair that already exists: without this precaution, removing the
  -- guardrail would leave the test red for another reason and the assertion would not verify
  -- what it says.
  insert into public.archive_documents (title) values ('Cartel de la muestra')
  returning id into v_doc;
  begin
    insert into public.artwork_documents (catalog_id, document_id)
    values ('AR-9700', v_doc);
    raise exception 'FAIL: se ha vinculado un documento a una obra declarada sin documentación';
  exception when raise_exception then
    if position('contradice' in sqlerrm) = 0 then
      raise exception 'FAIL: ha fallado por otro motivo, no por la segunda puerta: %', sqlerrm;
    end if;
    raise notice 'OK: segunda puerta — no se archiva una obra declarada sin documentación: %', sqlerrm;
  end;

  -- And restoring a withdrawn link does not slip through the back door either.
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';
  begin
    perform public.document_artwork('AR-9700', v_doc);
    raise exception 'FAIL: restaurar un vínculo ha esquivado la comprobación';
  exception when raise_exception then
    if position('contradice' in sqlerrm) = 0 then
      raise exception 'FAIL: restaurar ha fallado por otro motivo: %', sqlerrm;
    end if;
    raise notice 'OK: restaurar tampoco esquiva la segunda puerta';
  end;

  update public.artworks set documentation_status = 'UNREVIEWED' where catalog_id = 'AR-9700';
  update public.artwork_documents set active = true where catalog_id = 'AR-9700';
end $$;

-- ── 20. And the three previous blocks still stand ────────────
-- This migration REPLACES `tg_artwork_research_status_coherent` for the fourth time,
-- and a replacement that swallows a previous block breaks nothing visible: the
-- migration that wrote it was applied a while ago and its test still passes, because
-- it checks the function that is there and not the one that was.
do $$
declare v_expo uuid; v_ref uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  -- Procedencia.
  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9701', 'Colección privada, España');
  begin
    update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el bloque de procedencia se ha perdido en el reemplazo';
  exception when raise_exception then
    raise notice 'OK: el bloque de procedencia sigue en pie';
  end;

  -- Bibliografía.
  insert into public.bibliography (title) values ('Referencia de prueba del archivo')
  returning id into v_ref;
  perform public.cite_artwork('AR-9701', v_ref, '34');
  begin
    update public.artworks set bibliography_status = 'NONE_FOUND' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el bloque de bibliografía se ha perdido en el reemplazo';
  exception when raise_exception then
    raise notice 'OK: el bloque de bibliografía sigue en pie';
  end;

  -- Historial expositivo.
  select id into v_expo from public.exhibitions where title = 'Muestra documentada';
  perform public.exhibit_artwork('AR-9701', v_expo, '12 bis');
  begin
    update public.artworks set exhibition_history_status = 'NONE_FOUND' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el bloque de historial expositivo se ha perdido en el reemplazo';
  exception when raise_exception then
    raise notice 'OK: el bloque de historial expositivo sigue en pie';
  end;
end $$;

-- ── 21. The research state is a closed enum ──────────────────
do $$
begin
  begin
    update public.artworks set documentation_status = 'PENDIENTE' where catalog_id = 'AR-9702';
    raise exception 'FAIL: ha entrado un estado de investigación inventado';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de investigación no admite texto libre (RF-218)';
  end;

  begin
    insert into public.archive_documents (title, artist_fund) values ('De un tercer artista', 'PICASSO');
    raise exception 'FAIL: ha entrado un fondo que no existe';
  exception when invalid_text_representation then
    raise notice 'OK: el fondo del documento es un enumerado cerrado';
  end;
end $$;

-- ── 22. Each one's wastebasket ───────────────────────────────
--
-- The document is a record with a name of its own and one of those RF-901 enumerates: it carries
-- a complete wastebasket and restoring does NOT erase the trace of the previous withdrawal (RF-902).
-- The type, the series and the two links hang from something else and have no
-- wastebasket screen of their own, so restoring them leaves them as if they had never been
-- withdrawn — and that is why it is checked, so the difference is deliberate and not
-- an oversight.
do $$
declare
  v_doc uuid; v_tipo uuid; v_serie uuid; v_vinculo uuid;
  v_baja timestamptz; v_quien uuid; v_restaurado timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select id into v_doc from public.archive_documents where title = 'Sin signatura 1';

  update public.archive_documents set active = false where id = v_doc;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.archive_documents where id = v_doc;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del documento no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.archive_documents where id = v_doc) then
    raise exception 'FAIL: el documento ha desaparecido al retirarlo (RF-901)';
  end if;

  update public.archive_documents set active = true where id = v_doc;
  select deactivated_at, restored_at into v_baja, v_restaurado
    from public.archive_documents where id = v_doc;
  if v_restaurado is null or v_baja is null then
    raise exception 'FAIL: restaurar el documento no ha dejado traza, o ha borrado la de la baja (RF-902)';
  end if;

  select id into v_tipo from public.document_types where name = 'Telegrama';
  update public.document_types set active = false where id = v_tipo;
  if (select deactivated_by from public.document_types where id = v_tipo)
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del tipo no ha quedado sellada';
  end if;
  update public.document_types set active = true where id = v_tipo;
  if (select deactivated_at from public.document_types where id = v_tipo) is not null then
    raise exception 'FAIL: el tipo restaurado arrastra la traza de una baja que ya no existe';
  end if;

  -- A series that is empty and with no subseries, so that what is checked here is the
  -- wastebasket and not the rule of «what has something inside is not withdrawn».
  insert into public.archive_series (name) values ('Fondo de prueba de la papelera')
  returning id into v_serie;
  update public.archive_series set active = false where id = v_serie;
  if (select deactivated_by from public.archive_series where id = v_serie)
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja de la serie no ha quedado sellada';
  end if;
  update public.archive_series set active = true where id = v_serie;
  if (select deactivated_at from public.archive_series where id = v_serie) is not null then
    raise exception 'FAIL: la serie restaurada arrastra la traza de una baja que ya no existe';
  end if;

  select id into v_vinculo from public.artwork_documents where catalog_id = 'AR-9702';
  update public.artwork_documents set active = false where id = v_vinculo;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.artwork_documents where id = v_vinculo;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del vínculo no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.artwork_documents where id = v_vinculo) then
    raise exception 'FAIL: el vínculo ha desaparecido al retirarlo (RF-517 revisa RF-903)';
  end if;
  update public.artwork_documents set active = true where id = v_vinculo;
  if (select deactivated_at from public.artwork_documents where id = v_vinculo) is not null then
    raise exception 'FAIL: el vínculo restaurado arrastra la traza de una baja que ya no existe';
  end if;

  raise notice 'OK: el documento guarda las dos trazas; el vocabulario y los vínculos vuelven limpios';
end $$;

-- ── 23. The authorship is stamped by the base ────────────────
-- RF-803 and RF-804 with the generic function: who and when come from the session, not
-- from what the client sends. It is checked by sending a false date and seeing that
-- the trigger overrides it; comparing two instants would not do, because inside a
-- transaction `now()` does not advance.
do $$
declare v_id uuid; v_creado uuid; v_actualizado uuid; v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  insert into public.archive_documents (title, created_by, updated_by)
  values ('Documento con autoría mentida',
          '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2')
  returning id, created_by into v_id, v_creado;

  if v_creado is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (%)', v_creado;
  end if;

  update public.archive_documents
     set note = 'Localizado en la caja 4',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000d2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado
    from public.archive_documents where id = v_id;
  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado;
  end if;

  -- And in the series and in the type, which have no update columns: the
  -- generic function touches only the columns the row has (RF-804).
  insert into public.archive_series (name, created_by)
  values ('Fondo con autoría mentida', '00000000-0000-0000-0000-0000000000d2');
  if (select created_by from public.archive_series where name = 'Fondo con autoría mentida')
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la autoría de la serie no la ha sellado la sesión';
  end if;

  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 24. Nobody really deletes, and all five are born closed ──
-- RF-901, RF-111, RF-113. The policies are written by the next migration; with
-- RLS enabled and no policy, the table is closed, which is the safe state
-- to wait in. What can never happen is the opposite: privileges
-- granted with no RLS.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['document_types', 'archive_series', 'archive_documents',
                                 'artwork_documents', 'exhibition_documents']
  loop
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = v_tabla
                  and cmd in ('DELETE', 'ALL')) then
      raise exception 'FAIL: hay una política que permite DELETE sobre %', v_tabla;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_tabla, 'delete')
       or has_table_privilege('anon', 'public.' || v_tabla, 'delete') then
      raise exception 'FAIL: alguien tiene privilegio de DELETE sobre %', v_tabla;
    end if;
    if not (select relrowsecurity from pg_class
             where oid = ('public.' || v_tabla)::regclass) then
      raise exception 'FAIL: la tabla % no tiene RLS activado', v_tabla;
    end if;
  end loop;
  raise notice 'OK: RLS activado en las cinco, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.document_types limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los tipos de documento';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los tipos de documento';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.archive_series limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar la clasificación archivística';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a la clasificación archivística';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.archive_documents limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los documentos de archivo';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los documentos de archivo';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.artwork_documents limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los vínculos con obras';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los vínculos con obras';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.exhibition_documents limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los vínculos con exposiciones';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los vínculos con exposiciones';
end $$;

reset role;

rollback;
