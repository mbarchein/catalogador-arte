-- Local development seed. Never runs in production.
-- In production, promoting the superuser is done once by hand:
--   update profiles set role = 'SUPERUSUARIO' where email = 'tu@correo.es';

-- Promote the local admin (idempotent; the profile is created by the trigger
-- when the account signs up via make seed-users).
update public.profiles
set role = 'SUPERUSUARIO'
where email = 'admin@local.test';

update public.profiles set role = 'CATALOGADOR' where email = 'catalogador@local.test';
update public.profiles set role = 'LECTOR' where email = 'lector@local.test';

-- A few sample artworks so the list does not start empty and the chronological
-- ordering can be checked with dates of different shapes.
-- Identifiers are provided explicitly so the seed is idempotent; in the
-- application the trigger assigns them.
-- The date lives in structured fields (ADR-004): execution_date is a generated
-- column and cannot be written. The three cases cover exact year, approximate
-- year and range, to verify chronological ordering.
insert into public.artworks (
  catalog_id, artist, title, attributed_title, artwork_type,
  start_year, end_year, approximate_date, technique, support,
  height_cm, width_cm, signed, signature_description,
  conservation_status, physical_location, existence_status,
  measurements_verified, inventory_phase_completed
) values
  (
    'AR-0001', 'ROTILI', 'Paisaje de invierno', 'NO', 'Pintura',
    1975, 1978, false, 'Óleo sobre lienzo', 'Lienzo',
    73, 60, 'SI', 'ángulo inferior derecho',
    'BUENO', 'edificio a, habitacion amarilla, bloque 3', 'CONSERVADA',
    true, true
  ),
  (
    'AR-0002', 'ROTILI', '', 'NO_APLICA', 'Dibujo',
    1980, null, true, 'Carboncillo sobre papel', 'Papel',
    42, 29.7, 'NO', '',
    'REGULAR', 'edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1', 'CONSERVADA',
    false, false
  ),
  (
    'RC-0001', 'RUIZ_CAMPINS', 'El jarrón azul', 'SI', 'Pintura',
    1968, null, false, 'Acrílico sobre tabla', 'Tabla',
    50, 40, 'SIN_REVISAR', '',
    'SIN_REVISAR', '', 'SIN_REVISAR',
    false, false
  )
on conflict (catalog_id) do nothing;
