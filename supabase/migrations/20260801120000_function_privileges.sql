-- Privilegios y search_path de las funciones: lo que el linter de Supabase
-- señala, y que es la misma clase de fallo que este esquema ya conocía en las
-- tablas — con un matiz que lo hizo pasar desapercibido.
--
-- La migración inicial cerró las tablas con:
--
--   revoke all on all functions in schema public from anon, authenticated;
--   alter default privileges in schema public revoke all on functions from anon, authenticated;
--
-- y esas dos líneas NO cierran nada, porque quien tiene el privilegio no es
-- `anon` ni `authenticated`: es **PUBLIC**. PostgreSQL concede EXECUTE a PUBLIC
-- en cada función que se crea, y anon y authenticated lo heredan por ser
-- miembros de PUBLIC. Revocar de un rol no quita lo que PUBLIC concede. En las
-- tablas la misma frase sí bastaba, porque ahí no hay concesión por omisión: de
-- ahí que el error sobreviviera a una revisión que estaba mirando.
--
-- Nada de esto exponía datos: las funciones de trigger devuelven `trigger` y no
-- se pueden invocar de forma útil por la API, y can_read/can_edit/my_role
-- contestan sobre quien llama. La excepción, y el motivo de que esto no espere,
-- es `recalculate_photographed(text)`: una escritura invocable sin sesión.

-- ── 1. search_path fijo en las siete que faltaban ────────────
-- Todas las SECURITY DEFINER ya lo llevaban; estas son de trigger y `invoker`,
-- así que el riesgo es menor, pero una función que resuelve sus nombres contra
-- un search_path que controla quien la invoca es una función que no sabes qué
-- ejecuta.

alter function public.tg_artwork_authorship() set search_path = public;
alter function public.tg_artwork_audit_trail() set search_path = public;
alter function public.tg_artwork_type_authorship() set search_path = public;
alter function public.tg_catalog_id_immutable() set search_path = public;
alter function public.tg_image_authorship() set search_path = public;
alter function public.tg_image_deactivation() set search_path = public;
alter function public.tg_series_authorship() set search_path = public;

-- ── 2. Ninguna función es de PUBLIC ──────────────────────────

revoke all on all functions in schema public from public;

-- Y las que se creen a partir de ahora tampoco. Es la línea que faltaba en la
-- migración inicial, y la que evita que esto se repita con la próxima función.
alter default privileges in schema public revoke all on functions from public;

-- ── 3. Devolver el EXECUTE, una a una ────────────────────────

-- Las tres que evalúan las POLÍTICAS. Van con el privilegio de quien consulta y
-- no con el de quien las escribió, así que sin EXECUTE las consultas de un
-- usuario legítimo fallarían con «permission denied» en vez de aplicar la
-- política.
--
-- A `anon` no se le conceden, y no hace falta: no tiene privilegio sobre
-- ninguna tabla, así que ninguna política suya llega a evaluarse.
grant execute on function public.can_read() to authenticated;
grant execute on function public.can_edit() to authenticated;
grant execute on function public.my_role() to authenticated;

-- Las que la aplicación llama por RPC, solo con sesión.
grant execute on function public.next_catalog_id(public.artist_fund) to authenticated;
grant execute on function public.platform_info() to authenticated;
grant execute on function public.recalculate_photographed(text) to authenticated;
grant execute on function public.reorder_images(text, text[]) to authenticated;
grant execute on function public.set_main_image(text) to authenticated;

-- Las de trigger no se conceden a nadie: PostgreSQL no comprueba EXECUTE al
-- dispararlas, solo al invocarlas. Lo verifica function_privileges.test.sql,
-- que inserta una obra y comprueba que el identificador y la traza se han
-- asignado igual.
