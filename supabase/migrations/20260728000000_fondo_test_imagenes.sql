-- ============================================================
-- The TEST fund photographs too: id_imagen admits the TS- prefix.
--
-- Migration 20260727030000 registered the test fund (TS-) in
-- `obras`' format, but `id_imagen`'s format was not updated and neither was the
-- signing Edge function. Consequence in production: on a TS-
-- record no photo could be uploaded — the master's signature returned «ruta no
-- válida» and, had it reached the insert, this constraint would have rejected it.
--
-- The prefix lives in three rules that must move together: obras_id_formato,
-- imagenes_id_formato and RUTA_VALIDA in supabase/functions/firmar-fichero.
-- ============================================================

alter table public.imagenes drop constraint imagenes_id_formato;
alter table public.imagenes add constraint imagenes_id_formato
  check (id_imagen ~ '^(AR|RC|TS)-[0-9]{4}_v[0-9]+$');
