-- ============================================================
-- Las políticas RLS del catálogo razonado documental
-- (RF-101, RF-103, RF-105, RF-106, RF-109, RF-111, RF-113, RF-901, RF-906).
--
-- Los seis grupos anteriores (20260804090000 a 20260804140000) crearon QUINCE
-- tablas con `enable row level security` y CERO políticas. Ese es el estado
-- seguro para quedarse a medias —RLS activado sin política niega a todo el
-- mundo con sesión— pero también significa que hoy la aplicación no puede leer
-- ni escribir una sola fila de ellas. Esta migración es la que las abre, y solo
-- lo que cada papel necesita.
--
-- Va antes de la primera pantalla a propósito, que es lo que dice
-- `docs/plan-de-pruebas.md`: no hay backend, la clave anónima viaja en el
-- cliente y estas políticas son el único perímetro. Un fallo aquí no corrompe
-- datos, los expone — y el dato más expuesto de este grupo es `parties.contact`,
-- el teléfono o el correo de un coleccionista particular, que es de un tercero
-- y no del estudio.
--
-- ── LA FORMA, QUE NO SE INVENTA AQUÍ ────────────────────────
--
-- Se copia la de `artworks` y `images`, que llevan desde la primera migración:
--
--   select  ->  (active and public.can_read()) or public.can_edit()
--   insert  ->  public.can_edit()
--   update  ->  public.can_edit()  (using Y with check)
--   delete  ->  NO EXISTE, en ninguna tabla y para ningún papel
--
-- `can_read()` es «tener perfil», es decir, haber iniciado sesión; `can_edit()`
-- es ser CATALOGER o SUPERUSER. Las dos son SECURITY DEFINER porque consultan
-- `profiles`, que también tiene RLS, y una política que consultara la tabla que
-- está filtrando recursaría para siempre.
--
-- POR QUÉ EL `active` EN EL SELECT, TAMBIÉN EN EL VOCABULARIO. Las tres
-- maestras viejas (`artwork_types`, `series`, `physical_places`) tienen un
-- select de `public.can_read()` a secas, sin filtrar la papelera. Aquí se ha
-- elegido la forma de `artworks` para las quince, y la razón es que la papelera
-- del vocabulario es papelera igual: RF-906 dice que la ve quien puede editar,
-- y un Lector que ve «Recorte de prensa (retirado)» en un desplegable no está
-- leyendo el catálogo, está leyendo el trabajo de otro. Lo que hace que esto no
-- rompa nada es que las seis maestras nuevas nacieron con su trigger de
-- desactivación: no se retira un tipo de publicación que use una referencia
-- activa, ni una sede con exposiciones activas, ni una serie con documentos
-- dentro, ni una parte que sostenga una cadena de procedencia. Es decir, una
-- fila retirada del vocabulario NO puede estar colgando de nada que el Lector
-- vea, así que ocultársela no le deja ningún nombre sin resolver.
--
-- No se toca el select de las tres maestras viejas: cambiar una política que
-- lleva meses en producción no es trabajo de esta migración, y la divergencia
-- queda anotada aquí para que se decida de una vez cuando alguien la unifique.
--
-- POR QUÉ NO HAY POLÍTICA DE DELETE. Porque nada se borra nunca (RF-901,
-- RF-517), y porque `rls_default_deny.test.sql` lanza excepción ante cualquier
-- política DELETE o ALL en `public`. La ausencia de política ya cierra la
-- operación; el privilegio revocado la cierra otra vez, y hacen falta dos
-- errores en vez de uno para abrirla. Las dos barreras se comprueban abajo.
--
-- LA CASCADA HACIA ABAJO DE RF-905 NO VIVE AQUÍ. Ocultar los eslabones de
-- procedencia, las citas o las participaciones de una obra dada de baja es cosa
-- de la consulta, exactamente como se hace hoy con las imágenes: la política de
-- `images` mira `images.active` y no `artworks.active`. La alternativa —una
-- política que exija que el padre también sea visible— es más difícil de
-- saltarse y bastante más cara de evaluar, y es una de las preguntas abiertas
-- del diseño. Mientras no se decida, el perímetro es el perímetro y el filtrado
-- por contexto es de quien consulta.
--
-- CONTRA QUÉ SE COMPRUEBA. `supabase/tests/documentary_policies.test.sql`
-- (el perímetro tabla a tabla) y `supabase/tests/rls_role_matrix.test.sql`
-- (los tres papeles, autenticándose de verdad). Al final de este fichero hay
-- además un bloque `do` que mide lo que ha quedado en el catálogo del sistema
-- y aborta la migración si no cuadra: la plataforma concede por omisión todos
-- los privilegios de cada tabla nueva a `anon` y `authenticated` —incluido
-- `delete`—, y eso no se da por sabido, se mide.
-- ============================================================


-- ── 1. Personas e instituciones (RF-508) ────────────────────
--
-- La fila que más importa de toda la matriz. RF-105 decide expresamente que el
-- Lector ve `contact`: no hay recorte por columnas, y por eso el aserto de la
-- matriz sobre esta tabla es el que hay que mirar dos veces. Que sea una
-- decisión escrita es lo que la separa de un descuido.

revoke all on public.parties from anon, authenticated;
grant select, insert, update on public.parties to authenticated;

create policy parties_select on public.parties
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy parties_insert on public.parties
  for insert with check (public.can_edit());

create policy parties_update on public.parties
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 2. La cadena de procedencia (RF-509, RF-510, RF-511) ────
--
-- `reorder_provenance_events` es SECURITY INVOKER a propósito: reordenar sigue
-- sujeto a estas políticas, y sin la de select la función no encontraría la
-- cadena. Con ella puesta, el Catalogador la reordena y el Lector recibe el
-- mensaje en español que la propia función lanza, en vez del silencio de un
-- update que no afecta a ninguna fila.

revoke all on public.provenance_events from anon, authenticated;
grant select, insert, update on public.provenance_events to authenticated;

create policy provenance_events_select on public.provenance_events
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy provenance_events_insert on public.provenance_events
  for insert with check (public.can_edit());

create policy provenance_events_update on public.provenance_events
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 3. Bibliografía (RF-504, RF-506, RF-514) ────────────────
--
-- `cite_artwork` hace `insert ... on conflict do update ... returning`, así que
-- necesita las tres políticas de la puente a la vez: sin la de update no
-- restaura una cita retirada, y sin la de select no puede devolver la fila.

revoke all on public.publication_types from anon, authenticated;
grant select, insert, update on public.publication_types to authenticated;

create policy publication_types_select on public.publication_types
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy publication_types_insert on public.publication_types
  for insert with check (public.can_edit());

create policy publication_types_update on public.publication_types
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.bibliography from anon, authenticated;
grant select, insert, update on public.bibliography to authenticated;

create policy bibliography_select on public.bibliography
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy bibliography_insert on public.bibliography
  for insert with check (public.can_edit());

create policy bibliography_update on public.bibliography
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_bibliography from anon, authenticated;
grant select, insert, update on public.artwork_bibliography to authenticated;

create policy artwork_bibliography_select on public.artwork_bibliography
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_bibliography_insert on public.artwork_bibliography
  for insert with check (public.can_edit());

create policy artwork_bibliography_update on public.artwork_bibliography
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 4. Exposiciones (RF-501, RF-502, RF-503, RF-512, RF-513) ─

revoke all on public.exhibition_venues from anon, authenticated;
grant select, insert, update on public.exhibition_venues to authenticated;

create policy exhibition_venues_select on public.exhibition_venues
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy exhibition_venues_insert on public.exhibition_venues
  for insert with check (public.can_edit());

create policy exhibition_venues_update on public.exhibition_venues
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.exhibitions from anon, authenticated;
grant select, insert, update on public.exhibitions to authenticated;

create policy exhibitions_select on public.exhibitions
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy exhibitions_insert on public.exhibitions
  for insert with check (public.can_edit());

create policy exhibitions_update on public.exhibitions
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_exhibitions from anon, authenticated;
grant select, insert, update on public.artwork_exhibitions to authenticated;

create policy artwork_exhibitions_select on public.artwork_exhibitions
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_exhibitions_insert on public.artwork_exhibitions
  for insert with check (public.can_edit());

create policy artwork_exhibitions_update on public.artwork_exhibitions
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 5. Archivo y documentación (RF-310, RF-515, RF-516) ─────
--
-- El fichero digitalizado NO necesita política nueva de almacenamiento: vive en
-- el bucket `obras`, que es privado, y las tres políticas de `storage.objects`
-- que escribió 20260726010000 están puestas sobre el bucket entero
-- (`bucket_id = 'obras'` y `can_read()` / `can_edit()`), de modo que cubren el
-- prefijo del documento tal cual. Lo que aquí se protege es la FICHA del
-- documento, que es donde está la ruta: sin ella nadie sabe qué firmar.

revoke all on public.document_types from anon, authenticated;
grant select, insert, update on public.document_types to authenticated;

create policy document_types_select on public.document_types
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy document_types_insert on public.document_types
  for insert with check (public.can_edit());

create policy document_types_update on public.document_types
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.archive_series from anon, authenticated;
grant select, insert, update on public.archive_series to authenticated;

create policy archive_series_select on public.archive_series
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy archive_series_insert on public.archive_series
  for insert with check (public.can_edit());

create policy archive_series_update on public.archive_series
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.archive_documents from anon, authenticated;
grant select, insert, update on public.archive_documents to authenticated;

create policy archive_documents_select on public.archive_documents
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy archive_documents_insert on public.archive_documents
  for insert with check (public.can_edit());

create policy archive_documents_update on public.archive_documents
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_documents from anon, authenticated;
grant select, insert, update on public.artwork_documents to authenticated;

create policy artwork_documents_select on public.artwork_documents
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_documents_insert on public.artwork_documents
  for insert with check (public.can_edit());

create policy artwork_documents_update on public.artwork_documents
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.exhibition_documents from anon, authenticated;
grant select, insert, update on public.exhibition_documents to authenticated;

create policy exhibition_documents_select on public.exhibition_documents
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy exhibition_documents_insert on public.exhibition_documents
  for insert with check (public.can_edit());

create policy exhibition_documents_update on public.exhibition_documents
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 6. Obras relacionadas entre sí (RF-212, RF-217) ─────────

revoke all on public.artwork_relationship_types from anon, authenticated;
grant select, insert, update on public.artwork_relationship_types to authenticated;

create policy artwork_relationship_types_select on public.artwork_relationship_types
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_relationship_types_insert on public.artwork_relationship_types
  for insert with check (public.can_edit());

create policy artwork_relationship_types_update on public.artwork_relationship_types
  for update using (public.can_edit()) with check (public.can_edit());

revoke all on public.artwork_relationships from anon, authenticated;
grant select, insert, update on public.artwork_relationships to authenticated;

create policy artwork_relationships_select on public.artwork_relationships
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy artwork_relationships_insert on public.artwork_relationships
  for insert with check (public.can_edit());

create policy artwork_relationships_update on public.artwork_relationships
  for update using (public.can_edit()) with check (public.can_edit());


-- ── 7. La migración se mide a sí misma ──────────────────────
--
-- No es adorno ni es lo mismo que el test: esto corre DENTRO de la transacción
-- que aplica la migración, así que si algo no cuadra la migración no se aplica
-- a medias — y una tabla a medias de perímetro es exactamente el estado que hay
-- que evitar. El test de al lado vuelve a medirlo desde fuera y además ataca la
-- base con la sesión de cada papel, que es lo único que verifica de verdad.

do $$
declare
  v_tables constant text[] := array[
    'parties', 'provenance_events',
    'publication_types', 'bibliography', 'artwork_bibliography',
    'exhibition_venues', 'exhibitions', 'artwork_exhibitions',
    'document_types', 'archive_series', 'archive_documents',
    'artwork_documents', 'exhibition_documents',
    'artwork_relationship_types', 'artwork_relationships'
  ];
  v_table text;
  v_found text[];
  v_privs text;
begin
  if array_length(v_tables, 1) <> 15 then
    raise exception 'FAIL: la lista de tablas de este grupo debería tener 15 entradas, tiene %',
      array_length(v_tables, 1);
  end if;

  foreach v_table in array v_tables loop
    -- RLS activado. Sin esto, las políticas de abajo son decoración.
    if not (select c.relrowsecurity
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = v_table) then
      raise exception 'FAIL: public.% no tiene RLS activado', v_table;
    end if;

    -- Las tres políticas, ni una más ni una menos.
    select coalesce(array_agg(cmd::text order by cmd::text), '{}')
      into v_found
      from pg_policies
     where schemaname = 'public' and tablename = v_table;

    if v_found <> array['INSERT', 'SELECT', 'UPDATE'] then
      raise exception 'FAIL: public.% debería tener exactamente SELECT, INSERT y UPDATE, tiene [%]',
        v_table, array_to_string(v_found, ', ');
    end if;

    -- El rol anónimo, ni un privilegio. Se mira `column_privileges` y no solo
    -- `role_table_grants` porque un `grant update (columna)` no aparece en la
    -- segunda: sería un agujero de una columna, invisible desde donde se suele
    -- mirar.
    if exists (select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = v_table
                  and grantee = 'anon') then
      raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre public.%', v_table;
    end if;

    -- Y el autenticado, exactamente tres. Nótese la ausencia de DELETE: sin el
    -- privilegio no hay ni forma de intentarlo (RF-901).
    select string_agg(distinct privilege_type, ',' order by privilege_type)
      into v_privs
      from information_schema.column_privileges
     where table_schema = 'public' and table_name = v_table
       and grantee = 'authenticated';

    if v_privs is distinct from 'INSERT,SELECT,UPDATE' then
      raise exception 'FAIL: el rol autenticado debería tener INSERT, SELECT y UPDATE sobre public.%, tiene [%]',
        v_table, coalesce(v_privs, '(ninguno)');
    end if;
  end loop;

  raise notice 'OK: las 15 tablas del catálogo documental tienen RLS, tres políticas y los privilegios justos';
end $$;
