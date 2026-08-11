-- RF-1600: the dossier — chosen artworks, in a chosen order, and the PDF sent.
--
-- What has to be proven, in the order in which it hurts:
--
--   1. THE PERIMETER, which is the first priority of the whole project: the
--      Reader reads and does not write, the anonymous role reaches nothing, and
--      an issued version cannot be changed by anybody, session or not.
--   2. That the price lives on the LINE and nowhere else. The assertion over
--      `artworks` is what keeps ADR-011's decision from being undone by
--      somebody adding a column in good faith.
--   3. That the order is all or nothing, and that a fixed shot belongs to its
--      artwork: the two mistakes that reach the person receiving the PDF.
--   4. That the inherited visibility hides a withdrawn artwork from the Reader
--      and gives it back to whoever edits (RF-609, RF-1613).
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9670', 'ROTILI', 'Obra del dossier', 'UNCONFIRMED'),
  ('AR-9671', 'ROTILI', 'Otra del dossier', 'UNCONFIRMED'),
  ('AR-9672', 'ROTILI', 'Obra que se retira', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path, shot_type) values
  ('AR-9670', 'm/9670-1', 'd/9670-1', 'GENERAL'),
  ('AR-9670', 'm/9670-2', 'd/9670-2', 'SIGNATURE_DETAIL'),
  ('AR-9671', 'm/9671-1', 'd/9671-1', 'GENERAL');

insert into public.parties (party_type, name) values ('INSTITUTION', 'Galería de prueba');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d001', 'cat-dossier@test.local'),
  ('00000000-0000-0000-0000-00000000d002', 'lec-dossier@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000d001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000d002';

insert into public.dossiers (id, title, purpose, recipient_party_id) values
  ('00000000-0000-0000-0000-00000000e001', 'Selección para galería', 'Galería de prueba',
   (select id from public.parties where name = 'Galería de prueba')),
  ('00000000-0000-0000-0000-00000000e002', 'Dossier retirado', '', null);


-- ── 1. The price is on the line and nowhere else (RF-1604) ───
-- ADR-011's decision, asserted against the catalogue and not against a comment.
-- A price in `artworks` would be the catalogue affirming what an artwork is
-- worth, with one figure for every interlocutor.
do $$
declare v_columns text[];
begin
  select coalesce(array_agg(column_name order by column_name), '{}')
    into v_columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'artworks'
     and (column_name like '%price%' or column_name like '%precio%'
          or column_name like '%valuation%' or column_name like '%currency%');

  if array_length(v_columns, 1) > 0 then
    raise exception
      'FAIL: la ficha de obra tiene columnas de precio (%), y el precio es del dossier (ADR-011)',
      array_to_string(v_columns, ', ');
  end if;
  raise notice 'OK: el catálogo no afirma ningún precio; el precio vive en la línea del dossier';
end $$;

-- Zero is not a price and a negative one is a typo. Null IS a price datum: «sin
-- precio», which is the normal state of most lines.
do $$
begin
  insert into public.dossier_items (dossier_id, catalog_id, price)
  values ('00000000-0000-0000-0000-00000000e001', 'AR-9670', 0);
  raise exception 'FAIL: se admitió un precio de cero';
exception
  when check_violation then
    raise notice 'OK: cero no es un precio';
end $$;

do $$
begin
  insert into public.dossier_items (dossier_id, catalog_id, currency)
  values ('00000000-0000-0000-0000-00000000e001', 'AR-9670', 'euros');
  raise exception 'FAIL: se admitió una moneda que no es un código ISO';
exception
  when check_violation then
    raise notice 'OK: la moneda es un código de tres letras';
end $$;


-- ── 2. Adding, the order, and the fixed shot ────────────────
do $$
declare v_order text[]; v_currency text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  perform public.add_artwork_to_dossier(
    '00000000-0000-0000-0000-00000000e001', 'AR-9670', 'La grande', 4500);
  perform public.add_artwork_to_dossier(
    '00000000-0000-0000-0000-00000000e001', 'AR-9671');
  perform public.add_artwork_to_dossier(
    '00000000-0000-0000-0000-00000000e001', 'AR-9672');

  select array_agg(catalog_id order by sort_order) into v_order
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;

  if v_order <> array['AR-9670', 'AR-9671', 'AR-9672'] then
    raise exception 'FAIL: las obras no se numeraron por orden de entrada: %', v_order;
  end if;

  -- The currency has a default so that the client does not have to send it.
  select currency into v_currency
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9670';
  if v_currency <> 'EUR' then
    raise exception 'FAIL: la moneda por omisión no es EUR: %', v_currency;
  end if;

  raise notice 'OK: cada obra añadida va al final del dossier (%)', v_order;
end $$;

reset role;

-- Null is «the representative one» (RF-1605), and a fixed shot has to be of that
-- artwork: another one would put a different painting into the PDF, which is the
-- kind of mistake that is discovered by whoever receives it.
do $$
begin
  update public.dossier_items set image_id = 'AR-9671_v1'
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9670';
  raise exception 'FAIL: se fijó en una línea la fotografía de otra obra';
exception
  when raise_exception then
    if position('no es de la obra' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la toma fijada tiene que ser de esa obra';
end $$;

do $$
begin
  update public.dossier_items set image_id = 'AR-9670_v2'
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9670';
  if (select count(*) from public.dossier_items
       where dossier_id = '00000000-0000-0000-0000-00000000e001'
         and catalog_id = 'AR-9670' and image_id = 'AR-9670_v2') <> 1 then
    raise exception 'FAIL: no se pudo fijar una toma de la propia obra';
  end if;
  raise notice 'OK: se fija una toma de la obra, y nulo es la representativa';
end $$;


-- ── 3. Rearranging is all or nothing (RF-1603) ──────────────
do $$
declare v_lines uuid[]; v_before text[]; v_after text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  select array_agg(id order by sort_order) into v_lines
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;

  perform public.reorder_dossier_items(
    '00000000-0000-0000-0000-00000000e001',
    array[v_lines[3], v_lines[1], v_lines[2]]);

  select array_agg(catalog_id order by sort_order) into v_after
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;
  if v_after <> array['AR-9672', 'AR-9670', 'AR-9671'] then
    raise exception 'FAIL: el orden guardado no es el pedido: %', v_after;
  end if;

  v_before := v_lines;

  -- An incomplete list: an order that leaves artworks out is not an order.
  begin
    perform public.reorder_dossier_items(
      '00000000-0000-0000-0000-00000000e001', array[v_lines[1], v_lines[2]]);
    raise exception 'FAIL: se admitió una lista incompleta';
  exception
    when raise_exception then
      if position('no coincide' in sqlerrm) = 0 then raise; end if;
  end;

  -- Repeated identifiers would leave two lines fighting for one position.
  begin
    perform public.reorder_dossier_items(
      '00000000-0000-0000-0000-00000000e001',
      array[v_lines[1], v_lines[1], v_lines[2]]);
    raise exception 'FAIL: se admitieron identificadores repetidos';
  exception
    when raise_exception then
      if position('repetidos' in sqlerrm) = 0 then raise; end if;
  end;

  select array_agg(catalog_id order by sort_order) into v_before
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;
  if v_before <> array['AR-9672', 'AR-9670', 'AR-9671'] then
    raise exception 'FAIL: una lista rechazada dejó el orden a medias: %', v_before;
  end if;

  raise notice 'OK: el orden se reescribe entero o no se toca';
end $$;

reset role;

-- A line of another dossier does not enter this dossier's order.
do $$
declare v_lines uuid[]; v_other uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  select id into v_other from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' limit 1;

  perform public.add_artwork_to_dossier(
    '00000000-0000-0000-0000-00000000e002', 'AR-9670');
  select array_agg(id) into v_lines from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e002' and active;

  perform public.reorder_dossier_items(
    '00000000-0000-0000-0000-00000000e002', array[v_other]);
  raise exception 'FAIL: se admitió en el orden una línea de otro dossier';
exception
  when raise_exception then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'OK: una línea de otro dossier no entra en el orden: %', sqlerrm;
end $$;

reset role;

-- The Reader does not rearrange.
do $$
declare v_lines uuid[];
begin
  select array_agg(id order by sort_order) into v_lines
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
  set local role authenticated;

  perform public.reorder_dossier_items(
    '00000000-0000-0000-0000-00000000e001',
    array[v_lines[2], v_lines[1], v_lines[3]]);
  raise exception 'FAIL: un lector pudo reordenar el dossier';
exception
  when others then
    if position('permiso' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: el lector no reordena: %', sqlerrm;
end $$;

reset role;


-- ── 3 bis. The free texts, in the same list (RF-1614) ───────
-- A paragraph goes BETWEEN two artworks, which is the whole reason the middle
-- table is one list and not two.
do $$
declare v_kinds text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  perform public.add_text_to_dossier(
    '00000000-0000-0000-0000-00000000e001', 'Óleos, 1962-1968',
    'Las tres primeras están sin enmarcar.');

  select array_agg(kind::text order by sort_order) into v_kinds
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;
  if v_kinds <> array['ARTWORK', 'ARTWORK', 'ARTWORK', 'TEXT'] then
    raise exception 'FAIL: el texto no entró en la misma lista que las obras: %', v_kinds;
  end if;

  -- A text with neither heading nor paragraph is a blank space, and nobody meant
  -- to add a blank space. It is said as a sentence and not as the name of a
  -- constraint.
  begin
    perform public.add_text_to_dossier('00000000-0000-0000-0000-00000000e001', '  ', '');
    raise exception 'FAIL: se admitió un texto vacío';
  exception
    when raise_exception then
      if position('no dice nada' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK: los textos y las obras comparten una sola lista y un solo orden';
end $$;

reset role;

-- The two kinds have their own shape, and what cannot be saved cannot be a bug
-- later: an artwork with a paragraph inside, or a text with a price, would be
-- data the PDF does not know how to draw.
do $$
begin
  insert into public.dossier_items (dossier_id, kind, catalog_id, body)
  values ('00000000-0000-0000-0000-00000000e001', 'ARTWORK', 'AR-9671', 'Un párrafo');
  raise exception 'FAIL: se admitió una obra con párrafo dentro';
exception
  when check_violation then
    raise notice 'OK: una obra no lleva texto libre dentro';
end $$;

do $$
begin
  insert into public.dossier_items (dossier_id, kind, body, price)
  values ('00000000-0000-0000-0000-00000000e001', 'TEXT', 'Un párrafo', 900);
  raise exception 'FAIL: se admitió un texto con precio';
exception
  when check_violation then
    raise notice 'OK: un texto no lleva precio ni obra';
end $$;

-- And a text is visible: it hangs from the dossier and from no artwork, so the
-- inherited visibility must not swallow it. This is the way that closure fails if
-- it is copied without thinking.
do $$
declare v_seen integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_seen from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and kind = 'TEXT';
  if v_seen <> 1 then
    raise exception 'FAIL: el texto libre no se ve (% filas)', v_seen;
  end if;
  raise notice 'OK: un texto libre se ve, y no lo tapa la visibilidad heredada de la obra';
end $$;

reset role;


-- ── 4. Withdrawing a line, and adding it again RESTORES it ──
do $$
declare v_price numeric; v_note text; v_order integer; v_count integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  update public.dossier_items set active = false
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9670';

  -- The blank «Añadir» form must not empty the note and the price somebody
  -- wrote: what is not sent is not deleted.
  perform public.add_artwork_to_dossier(
    '00000000-0000-0000-0000-00000000e001', 'AR-9670');

  select count(*) into v_count from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9670';
  if v_count <> 1 then
    raise exception 'FAIL: volver a añadir la obra creó una segunda línea (% líneas)', v_count;
  end if;

  select price, note, sort_order into v_price, v_note, v_order
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9670';

  if v_price <> 4500 or v_note <> 'La grande' then
    raise exception 'FAIL: la línea restaurada perdió su nota o su precio: % / %', v_note, v_price;
  end if;

  -- And it comes back at the end, which is where the artwork was just added and
  -- not where it was a month ago.
  if v_order <> (select max(sort_order) from public.dossier_items
                  where dossier_id = '00000000-0000-0000-0000-00000000e001') then
    raise exception 'FAIL: la línea restaurada no volvió al final: %', v_order;
  end if;

  if (select deactivated_at from public.dossier_items
       where dossier_id = '00000000-0000-0000-0000-00000000e001'
         and catalog_id = 'AR-9670') is not null then
    raise exception 'FAIL: la línea restaurada conserva el sello de retirada';
  end if;

  raise notice 'OK: volver a añadir una obra restaura su línea con su nota y su precio';
end $$;

reset role;


-- ── 5. Each issue, with its version, put by the base ────────
do $$
declare v_versions integer[]; v_author uuid; v_at timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  insert into public.dossier_issues (dossier_id, file_path, file_bytes)
  values ('00000000-0000-0000-0000-00000000e001', 'dossiers/e001-v1.pdf', 2048);

  -- The client sends a version and a date of its own, and both are ignored: two
  -- people issuing at the same time would both compute «the next one».
  insert into public.dossier_issues (dossier_id, version, issued_at, issued_by, file_path)
  values ('00000000-0000-0000-0000-00000000e001', 99, '2001-01-01T00:00:00Z',
          '00000000-0000-0000-0000-00000000d002', 'dossiers/e001-v2.pdf')
  returning issued_by, issued_at into v_author, v_at;

  if v_author <> '00000000-0000-0000-0000-00000000d001' then
    raise exception 'FAIL: el autor de la emisión lo puso el cliente: %', v_author;
  end if;
  if v_at < '2020-01-01T00:00:00Z' then
    raise exception 'FAIL: la fecha de la emisión la puso el cliente: %', v_at;
  end if;

  select array_agg(version order by version) into v_versions
    from public.dossier_issues where dossier_id = '00000000-0000-0000-0000-00000000e001';
  if v_versions <> array[1, 2] then
    raise exception 'FAIL: las versiones no son consecutivas: %', v_versions;
  end if;

  -- Per dossier, not global: another dossier's first issue is version 1.
  insert into public.dossier_issues (dossier_id, file_path)
  values ('00000000-0000-0000-0000-00000000e002', 'dossiers/e002-v1.pdf');
  if (select version from public.dossier_issues
       where dossier_id = '00000000-0000-0000-0000-00000000e002') <> 1 then
    raise exception 'FAIL: la versión no es por dossier';
  end if;

  raise notice 'OK: la versión, la fecha y el autor de una emisión los pone la base';
end $$;

reset role;

-- The path is part of the perimeter: a row pointing at a master would turn a
-- dossier into a way of getting a signature for one.
do $$
begin
  insert into public.dossier_issues (dossier_id, file_path)
  values ('00000000-0000-0000-0000-00000000e001', 'AR-9670/x_master.jpg');
  raise exception 'FAIL: se admitió una emisión con la ruta de un máster';
exception
  when check_violation then
    raise notice 'OK: la emisión solo apunta a un PDF bajo dossiers/';
end $$;

-- An issued version is not changed nor deleted BY ANYBODY: this runs as the
-- table's owner, which is precisely the path the RLS does not close (RF-1607).
do $$
begin
  update public.dossier_issues set note = 'retocada'
   where dossier_id = '00000000-0000-0000-0000-00000000e001';
  raise exception 'FAIL: se pudo cambiar una versión ya emitida';
exception
  when raise_exception then
    if position('ya está mandado' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una versión emitida no se cambia';
end $$;

do $$
begin
  delete from public.dossier_issues
   where dossier_id = '00000000-0000-0000-0000-00000000e001';
  raise exception 'FAIL: se pudo borrar una versión ya emitida';
exception
  when raise_exception then
    if position('ya está mandado' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una versión emitida no se borra';
end $$;

-- And the session does not even have the privilege to try (RF-113: two barriers
-- in series, the padlock above and this one).
do $$
begin
  if has_table_privilege('authenticated', 'public.dossier_issues', 'update')
     or has_table_privilege('authenticated', 'public.dossier_issues', 'delete') then
    raise exception 'FAIL: la sesión tiene privilegio de update o delete sobre las emisiones';
  end if;
  raise notice 'OK: la sesión no puede ni intentar cambiar una emisión';
end $$;


-- ── 6. The perimeter by role (RF-1610, RF-101) ──────────────
do $$
declare v_seen integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
  set local role authenticated;

  -- The Reader reads the team's dossiers.
  select count(*) into v_seen from public.dossiers
   where id = '00000000-0000-0000-0000-00000000e001';
  if v_seen <> 1 then
    raise exception 'FAIL: el lector no ve un dossier activo';
  end if;

  -- And does not write.
  begin
    insert into public.dossiers (title) values ('El del lector');
    raise exception 'FAIL: el lector creó un dossier';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.dossiers set title = 'Otro título'
     where id = '00000000-0000-0000-0000-00000000e001';
    if found then
      raise exception 'FAIL: el lector cambió el título de un dossier';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  raise notice 'OK: el lector lee los dossieres del equipo y no los escribe';
end $$;

reset role;

do $$
begin
  set local role anon;
  begin
    perform 1 from public.dossiers limit 1;
    raise exception 'FAIL: el rol anónimo alcanza los dossieres (RF-101)';
  exception
    when insufficient_privilege then
      raise notice 'OK: el rol anónimo no alcanza ni la tabla';
  end;
end $$;

reset role;


-- ── 7. The inherited visibility (RF-609, RF-1613) ───────────
-- An artwork withdrawn from the catalogue does not silently disappear from the
-- dossiers that carried it: whoever edits sees the line, whoever only consults
-- does not, and it is not removed — it was in the document that was sent.
do $$
declare v_reader integer; v_editor integer;
begin
  update public.artworks set active = false where catalog_id = 'AR-9672';
  update public.dossiers set active = false
   where id = '00000000-0000-0000-0000-00000000e002';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_reader from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9672';
  if v_reader <> 0 then
    raise exception 'FAIL: el lector ve la línea de una obra retirada (RF-609)';
  end if;

  -- The withdrawn dossier, its lines and its issues do not exist for the Reader.
  if (select count(*) from public.dossiers
       where id = '00000000-0000-0000-0000-00000000e002') <> 0 then
    raise exception 'FAIL: el lector ve un dossier retirado';
  end if;
  if (select count(*) from public.dossier_items
       where dossier_id = '00000000-0000-0000-0000-00000000e002') <> 0 then
    raise exception 'FAIL: el lector ve las líneas de un dossier retirado';
  end if;
  if (select count(*) from public.dossier_issues
       where dossier_id = '00000000-0000-0000-0000-00000000e002') <> 0 then
    raise exception 'FAIL: el lector ve las emisiones de un dossier retirado';
  end if;

  reset role;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_editor from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and catalog_id = 'AR-9672';
  if v_editor <> 1 then
    raise exception 'FAIL: quien edita perdió la línea de una obra retirada (RF-1613)';
  end if;
  if (select count(*) from public.dossiers
       where id = '00000000-0000-0000-0000-00000000e002') <> 1 then
    raise exception 'FAIL: quien edita no ve el dossier retirado en la papelera (RF-906)';
  end if;

  raise notice 'OK: la obra retirada sigue en la línea, dicha a quien edita y oculta a quien consulta';
end $$;

reset role;


-- ── 7 bis. The biography is the third kind (RF-1616) ────────
-- The text lives in the fund and is read live: what the item carries is WHICH
-- fund's it is. Copying the prose in here would be a second biography, wrong from
-- the first time the two stopped matching.
do $$
declare v_kind text; v_bio text;
begin
  update public.artist_funds
     set biography = 'Nació en Badajoz y se formó en Madrid.',
         cv = '1985 · Sala del Perímetro, Badajoz (individual)'
   where code = 'ROTILI';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  perform public.add_biography_to_dossier(
    '00000000-0000-0000-0000-00000000e001', 'ROTILI', 'Alberto Rotili, 1928-2009');

  select kind::text into v_kind from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001'
     and artist_fund = 'ROTILI';
  if v_kind <> 'BIOGRAPHY' then
    raise exception 'FAIL: la biografía no entró como tal: %', v_kind;
  end if;

  -- Read live from the fund, joining by the same key the whole schema uses.
  select f.biography into v_bio
    from public.dossier_items i
    join public.artist_funds f on f.code = i.artist_fund
   where i.dossier_id = '00000000-0000-0000-0000-00000000e001'
     and i.kind = 'BIOGRAPHY';
  if v_bio <> 'Nació en Badajoz y se formó en Madrid.' then
    raise exception 'FAIL: la biografía no se lee del fondo: %', v_bio;
  end if;

  -- Two of the same fund would print the same text twice.
  begin
    perform public.add_biography_to_dossier(
      '00000000-0000-0000-0000-00000000e001', 'ROTILI');
    raise exception 'FAIL: se admitió dos veces la biografía del mismo fondo';
  exception
    when raise_exception then
      if position('ya lleva la biografía' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK: la biografía es un elemento del dossier y su texto vive en el fondo';
end $$;

reset role;

-- Its shape, through both doors: a biography carries no prose, no artwork and no
-- price, and the two new columns mean nothing on the other two kinds.
do $$
begin
  insert into public.dossier_items (dossier_id, kind, artist_fund, with_cv, body)
  values ('00000000-0000-0000-0000-00000000e001', 'BIOGRAPHY', 'RUIZ_CAMPINS', true,
          'Una prosa que debería vivir en el fondo');
  raise exception 'FAIL: se admitió una biografía con la prosa dentro';
exception
  when check_violation then
    raise notice 'OK: la prosa de una biografía no se copia en el dossier';
end $$;

do $$
begin
  insert into public.dossier_items (dossier_id, kind, catalog_id, artist_fund)
  values ('00000000-0000-0000-0000-00000000e001', 'ARTWORK', 'AR-9671', 'ROTILI');
  raise exception 'FAIL: una obra pudo llevar fondo de biografía';
exception
  when check_violation then
    raise notice 'OK: las columnas de la biografía no significan nada en una obra';
end $$;

do $$
begin
  insert into public.dossier_items (dossier_id, kind, artist_fund)
  values ('00000000-0000-0000-0000-00000000e001', 'BIOGRAPHY', 'ROTILI');
  raise exception 'FAIL: se admitió una biografía sin decir si lleva currículum';
exception
  when check_violation then
    raise notice 'OK: una biografía dice siempre si lleva currículum o no';
end $$;

-- And it is rearranged along with everything else, which is what the single list
-- is for: a gallery's biography goes in front and a catalogue's goes at the back.
do $$
declare v_lines uuid[]; v_kinds text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  select array_agg(id order by sort_order) into v_lines
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;

  -- The last one becomes the first: it is the real move, «biography to the front».
  perform public.reorder_dossier_items(
    '00000000-0000-0000-0000-00000000e001',
    array[v_lines[array_length(v_lines, 1)]] ||
      v_lines[1 : array_length(v_lines, 1) - 1]);

  select array_agg(kind::text order by sort_order) into v_kinds
    from public.dossier_items
   where dossier_id = '00000000-0000-0000-0000-00000000e001' and active;
  if v_kinds[1] <> 'BIOGRAPHY' then
    raise exception 'FAIL: la biografía no se pudo mover al principio: %', v_kinds;
  end if;

  raise notice 'OK: la biografía se coloca donde haga falta, como cualquier elemento (%)', v_kinds;
end $$;

reset role;


-- ── 8. A recipient is not withdrawn while it is one ─────────
-- The fourth check of `tg_party_deactivation`, with the reason of the other
-- three: withdrawing it leaves the catalogue pointing at something the interface
-- no longer offers.
do $$
begin
  update public.parties set active = false where name = 'Galería de prueba';
  raise exception 'FAIL: se retiró una parte que es destinataria de un dossier activo';
exception
  when raise_exception then
    if position('destinatario de un dossier' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una parte destinataria de un dossier activo no se retira';
end $$;

rollback;
