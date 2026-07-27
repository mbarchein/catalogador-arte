-- ============================================================
-- El fondo TEST también fotografía: id_imagen admite el prefijo TS-.
--
-- La migración 20260727030000 dio de alta el fondo de pruebas (TS-) en el
-- formato de `obras`, pero el formato de `id_imagen` no se actualizó y la
-- función Edge de firmas tampoco. Consecuencia en producción: en una ficha
-- TS- ninguna foto podía subirse — la firma del máster devolvía «ruta no
-- válida» y, de haber llegado al insert, esta constraint lo habría rechazado.
--
-- El prefijo vive en tres reglas que deben moverse juntas: obras_id_formato,
-- imagenes_id_formato y RUTA_VALIDA en supabase/functions/firmar-fichero.
-- ============================================================

alter table public.imagenes drop constraint imagenes_id_formato;
alter table public.imagenes add constraint imagenes_id_formato
  check (id_imagen ~ '^(AR|RC|TS)-[0-9]{4}_v[0-9]+$');
