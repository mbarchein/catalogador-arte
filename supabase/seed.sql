-- Local development seed. Never runs in production.
-- In production, promoting the superuser is done once by hand:
--   update profiles set role = 'SUPERUSER' where email = 'tu@correo.es';

-- Promote the local admin (idempotent; the profile is created by the trigger
-- when the account signs up via make seed-users).
update public.profiles
set role = 'SUPERUSER'
where email = 'admin@local.test';

update public.profiles set role = 'CATALOGER' where email = 'catalogador@local.test';
update public.profiles set role = 'READER' where email = 'lector@local.test';

-- Starting vocabulary of artwork types. BEFORE the artworks: the integrity
-- trigger rejects any artwork whose type is not in the vocabulary, so on a
-- fresh database these rows must exist first. Idempotent, like the rest.
insert into public.artwork_types (name) values
  ('Pintura'),
  ('Dibujo')
on conflict (name) do nothing;

-- Starting vocabulary of series, for the same reason and with the same rule:
-- before the artworks, because the integrity trigger checks membership. Each
-- series belongs to a fund, and the fund here matches the artworks below.
--
-- The TEST fund gets its own two entries even though no seeded artwork uses
-- them: TEST is where one rehearses, and without series of its own neither the
-- combo nor the list filter can be tried out from that fund.
insert into public.series (artist, name) values
  ('ROTILI', 'Paisajes de la sierra'),
  ('RUIZ_CAMPINS', 'Retratos del taller'),
  ('TEST', 'Serie de ensayo A'),
  ('TEST', 'Serie de ensayo B')
on conflict (artist, name) do nothing;

-- The places of the sample artworks (ADR-006). Before the artworks and for the
-- same reason as the vocabularies: the artwork points at a node and the foreign
-- key demands that it exist.
--
-- Identifiers are explicit, like the cataloging ones and for the same reason: so
-- the seed can be run again without duplicating anything. The names are written
-- as they read, with capitals and accents — that is what the decision is about;
-- what gets normalized is only the comparison key. The `physical_location` of
-- each artwork keeps the text of the old convention while the column exists: it
-- is retired in a later deployment.
insert into public.physical_places (id, parent_id, name) values
  ('00000000-0000-0000-0000-00000000a001', null,                                   'Edificio A'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a001', 'Habitación amarilla'),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a002', 'Bloque 3'),
  ('00000000-0000-0000-0000-00000000b001', null,                                   'Edificio B'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b001', 'Habitación 4'),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000b002', 'Estantería 3'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-00000000b003', 'Balda 2'),
  ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000b004', 'Carpeta 1')
on conflict do nothing;

-- A few sample artworks so the list does not start empty and the chronological
-- ordering can be checked with dates of different shapes.
-- Identifiers are provided explicitly so the seed is idempotent; in the
-- application the trigger assigns them.
-- The date lives in structured fields (ADR-004): execution_date is a generated
-- column and cannot be written. The three cases cover exact year, approximate
-- year and range, to verify chronological ordering.
insert into public.artworks (
  catalog_id, artist, title, attributed_title, artwork_type, series,
  start_year, end_year, approximate_date, technique, support,
  height_cm, width_cm, signed, signature_description,
  conservation_status, physical_location, physical_place_id, existence_status,
  measurements_verified, inventory_phase_completed
) values
  (
    'AR-0001', 'ROTILI', 'Paisaje de invierno', 'NO', 'Pintura', 'Paisajes de la sierra',
    1975, 1978, false, 'Óleo sobre lienzo', 'Lienzo',
    73, 60, 'YES', 'ángulo inferior derecho',
    'GOOD', 'edificio a, habitacion amarilla, bloque 3',
    '00000000-0000-0000-0000-00000000a003', 'PRESERVED',
    true, true
  ),
  (
    'AR-0002', 'ROTILI', '', 'NOT_APPLICABLE', 'Dibujo', '',
    1980, null, true, 'Carboncillo sobre papel', 'Papel',
    42, 29.7, 'NO', '',
    'FAIR', 'edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1',
    '00000000-0000-0000-0000-00000000b005', 'PRESERVED',
    false, false
  ),
  -- No place, on purpose: an artwork with nowhere recorded is legitimate
  -- (RF-215) and the list has to show it without a hole.
  (
    'RC-0001', 'RUIZ_CAMPINS', 'El jarrón azul', 'YES', 'Pintura', 'Retratos del taller',
    1968, null, false, 'Acrílico sobre tabla', 'Tabla',
    50, 40, 'UNREVIEWED', '',
    'UNREVIEWED', '', null, 'UNREVIEWED',
    false, false
  )
on conflict (catalog_id) do nothing;
