-- De quién es la fotografía y de dónde salió (RF-417, RF-106).
--
-- Dos columnas y no una, y aquí se fija por qué: **cambiar la procedencia no
-- puede fallar**. La tentación era una restricción cruzada que exigiera vacía la
-- columna que no toca; el precio habría sido un error del esquema en mitad de una
-- pantalla de captura, por un dato que no estorba. Lo que se guarda se guarda, y
-- lo que se enseña lo decide la procedencia — eso vive en la aplicación, con sus
-- propios tests.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cat-foto@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'lec-foto@test.local');

update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000f2';

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9700', 'ROTILI', 'Obra con procedencias', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path)
values ('AR-9700', 'm/9700', 'd/9700');

-- ── Nacen vacías, que es lo que hay hoy ─────────────────────

do $$
declare v_row record;
begin
  select photo_credit, provenance_source, provenance into v_row
    from public.images where image_id = 'AR-9700_v1';

  -- Vacías y NO nulas: la diferencia importa porque la pantalla las mete en un
  -- campo de texto, y un nulo ahí se pinta como «null».
  if v_row.photo_credit is null or v_row.photo_credit <> '' then
    raise exception 'FAIL: la autoría no nace vacía (%)', coalesce(v_row.photo_credit, '(nulo)');
  end if;
  if v_row.provenance_source is null or v_row.provenance_source <> '' then
    raise exception 'FAIL: la procedencia detallada no nace vacía (%)',
      coalesce(v_row.provenance_source, '(nulo)');
  end if;
  if v_row.provenance <> 'OWN' then
    raise exception 'FAIL: una fotografía nueva no nace propia (%)', v_row.provenance;
  end if;
  raise notice 'OK: las dos nacen vacías, y la fotografía nace propia';
end $$;

-- ── Cambiar la procedencia NO se lleva por delante lo escrito ──

do $$
declare v_row record;
begin
  update public.images
     set photo_credit = 'Mario J. Barchéin',
         provenance_source = 'Catálogo del MACVA, https://www.macvac.es/obra/x'
   where image_id = 'AR-9700_v1';

  -- Las dos a la vez y con la procedencia propia: es el estado que una
  -- restricción cruzada habría prohibido, y es el que se produce solo al marcar
  -- como propia una fotografía que antes venía de fuera.
  update public.images set provenance = 'OTHER_CATALOG' where image_id = 'AR-9700_v1';
  update public.images set provenance = 'OWN' where image_id = 'AR-9700_v1';

  select photo_credit, provenance_source into v_row
    from public.images where image_id = 'AR-9700_v1';

  if v_row.photo_credit <> 'Mario J. Barchéin' then
    raise exception 'FAIL: cambiar la procedencia ha tocado la autoría (%)', v_row.photo_credit;
  end if;
  if v_row.provenance_source not like 'Catálogo del MACVA%' then
    raise exception 'FAIL: cambiar la procedencia ha tocado el origen (%)', v_row.provenance_source;
  end if;
  raise notice 'OK: la procedencia se cambia de ida y vuelta sin perder lo escrito';
end $$;

-- ── Texto libre de verdad: una procedencia sin dirección vale ──

do $$
begin
  -- «Me la pasó la familia en 2019» es una procedencia legítima y no cabe en una
  -- URL. Si algún día alguien añade aquí una validación de dirección, esto se
  -- pone rojo, que es lo que tiene que pasar.
  update public.images
     set provenance = 'THIRD_PARTY',
         provenance_source = 'Enviada por la familia en 2019, sin más datos'
   where image_id = 'AR-9700_v1';
  raise notice 'OK: la procedencia admite texto libre, no solo direcciones';
end $$;

-- ── Quién puede escribirlas ─────────────────────────────────

do $$
declare v_affected integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
  set local role authenticated;

  update public.images set photo_credit = 'Quien cataloga'
   where image_id = 'AR-9700_v1';
  get diagnostics v_affected = row_count;

  reset role;
  if v_affected <> 1 then
    raise exception 'FAIL: el Catalogador no ha podido escribir la autoría (% filas)', v_affected;
  end if;
  raise notice 'OK: el Catalogador escribe la autoría y la procedencia';
end $$;

reset role;

do $$
declare
  v_affected integer;
  v_after text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;

  update public.images set photo_credit = 'Un lector cualquiera'
   where image_id = 'AR-9700_v1';
  get diagnostics v_affected = row_count;

  reset role;
  select photo_credit into v_after from public.images where image_id = 'AR-9700_v1';

  if v_affected <> 0 then
    raise exception 'FAIL: el Lector ha modificado % fila(s) (RF-106)', v_affected;
  end if;
  -- Y lo que importa de verdad: que no quedara nada escrito. Cero filas con el
  -- dato cambiado sería un `update` que la política dejó pasar a medias.
  if v_after <> 'Quien cataloga' then
    raise exception 'FAIL: el update del Lector dejó algo escrito (%)', v_after;
  end if;
  raise notice 'OK: un Lector no escribe ni la autoría ni la procedencia';
end $$;

reset role;
rollback;
