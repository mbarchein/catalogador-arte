-- ============================================================
-- View: which image represents each artwork.
--
-- One row per artwork with active images. It implements RF-403's fallback rule
-- in a single place.
--
-- Why in the base and not in the client, where it used to be:
--
--  1. The listing (RF-604) needs the thumbnail of up to 500 artworks. Computing the
--     rule in the client would force fetching ALL the images of all the
--     artworks —thousands of rows— and would besides trip over PostgREST's
--     rows-per-request cap, leaving artworks with no thumbnail in silence.
--  2. The printed catalogue's pipeline will be a Python script. With the rule
--     here it gets it for free; in TypeScript it would have to reimplement it, and two
--     implementations of the same rule diverge: it is a matter of time before the
--     web and the printed catalogue show different photos of the same artwork.
-- ============================================================

create view public.imagen_representativa
with (
  -- CRITICAL. Without security_invoker the view runs with the privileges of its
  -- owner and bypasses the RLS policies of "imagenes": anybody with a session
  -- would see the paths of the withdrawn images. It is exactly the hole this
  -- project cannot afford, because the policies are the only perimeter.
  security_invoker = true
) as
select distinct on (i.id_catalogacion)
  i.id_catalogacion,
  i.id_imagen,
  i.ruta_miniatura,
  i.ruta_derivada,
  i.tipo_toma,
  -- Distinguishing whether a person or the rule chose it matters in the interface: if it was
  -- the rule, uploading another photo may change it on its own, and it is worth warning.
  i.imagen_indice as elegida_a_mano
from public.imagenes i
where i.activo
order by
  i.id_catalogacion,
  -- 1. The one marked by hand always rules (RF-402).
  i.imagen_indice desc,
  -- 2. A general one represents the artwork; a signature detail or a reverse, no.
  (i.tipo_toma = 'GENERAL') desc,
  -- 3. The most recent one, by the photograph's date.
  i.fecha_fotografia desc nulls last,
  -- 4. On a tie, the one uploaded later.
  i.id_imagen desc;

comment on view public.imagen_representativa is
  'Una fila por obra: la imagen que la representa, según la regla de repliegue de RF-403.';

grant select on public.imagen_representativa to authenticated;
