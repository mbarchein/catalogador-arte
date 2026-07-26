-- ============================================================
-- Vista: qué imagen representa a cada obra.
--
-- Una fila por obra con imágenes activas. Implementa la regla de repliegue de
-- RF-403 en un único sitio.
--
-- Por qué en la base y no en el cliente, donde estaba antes:
--
--  1. El listado (RF-604) necesita la miniatura de hasta 500 obras. Calcular la
--     regla en el cliente obligaría a traerse TODAS las imágenes de todas las
--     obras —miles de filas— y encima tropezaría con el tope de filas por
--     petición de PostgREST, dejando obras sin miniatura en silencio.
--  2. El pipeline del catálogo impreso será un script de Python. Con la regla
--     aquí la obtiene gratis; en TypeScript tendría que reimplementarla, y dos
--     implementaciones de la misma regla divergen: es cuestión de tiempo que la
--     web y el catálogo impreso muestren fotos distintas de la misma obra.
-- ============================================================

create view public.imagen_representativa
with (
  -- CRÍTICO. Sin security_invoker la vista se ejecuta con los privilegios de su
  -- propietario y se salta las políticas RLS de "imagenes": cualquiera con sesión
  -- vería las rutas de las imágenes retiradas. Es exactamente el agujero que este
  -- proyecto no se puede permitir, porque las políticas son el único perímetro.
  security_invoker = true
) as
select distinct on (i.id_catalogacion)
  i.id_catalogacion,
  i.id_imagen,
  i.ruta_miniatura,
  i.ruta_derivada,
  i.tipo_toma,
  -- Distinguir si la eligió una persona o la regla importa en la interfaz: si fue
  -- la regla, subir otra foto puede cambiarla sola, y conviene avisar.
  i.imagen_indice as elegida_a_mano
from public.imagenes i
where i.activo
order by
  i.id_catalogacion,
  -- 1. La marcada a mano manda siempre (RF-402).
  i.imagen_indice desc,
  -- 2. Una general representa la obra; un detalle de firma o un reverso, no.
  (i.tipo_toma = 'GENERAL') desc,
  -- 3. La más reciente, por fecha de la fotografía.
  i.fecha_fotografia desc nulls last,
  -- 4. A igualdad, la subida más tarde.
  i.id_imagen desc;

comment on view public.imagen_representativa is
  'Una fila por obra: la imagen que la representa, según la regla de repliegue de RF-403.';

grant select on public.imagen_representativa to authenticated;
