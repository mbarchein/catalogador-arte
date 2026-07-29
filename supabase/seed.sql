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
-- before the artworks, because the integrity trigger checks membership.
insert into public.series (name) values
  ('Paisajes de la sierra'),
  ('Retratos del taller')
on conflict (name) do nothing;

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
  conservation_status, physical_location, existence_status,
  measurements_verified, inventory_phase_completed
) values
  (
    'AR-0001', 'ROTILI', 'Paisaje de invierno', 'NO', 'Pintura', 'Paisajes de la sierra',
    1975, 1978, false, 'Óleo sobre lienzo', 'Lienzo',
    73, 60, 'YES', 'ángulo inferior derecho',
    'GOOD', 'edificio a, habitacion amarilla, bloque 3', 'PRESERVED',
    true, true
  ),
  (
    'AR-0002', 'ROTILI', '', 'NOT_APPLICABLE', 'Dibujo', '',
    1980, null, true, 'Carboncillo sobre papel', 'Papel',
    42, 29.7, 'NO', '',
    'FAIR', 'edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1', 'PRESERVED',
    false, false
  ),
  (
    'RC-0001', 'RUIZ_CAMPINS', 'El jarrón azul', 'YES', 'Pintura', 'Retratos del taller',
    1968, null, false, 'Acrílico sobre tabla', 'Tabla',
    50, 40, 'UNREVIEWED', '',
    'UNREVIEWED', '', 'UNREVIEWED',
    false, false
  )
on conflict (catalog_id) do nothing;
