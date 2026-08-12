-- ============================================================
-- El cartel de una exposición (RF-518).
--
-- Un listado de exposiciones es una lista de títulos y años, y se recorre leyendo.
-- El cartel es lo que la hace reconocible de un vistazo: quien montó la exposición
-- se acuerda del cartel antes que del año. Así que la exposición lleva una imagen y
-- el listado enseña su miniatura.
--
-- ── DOS NIVELES Y NO TRES ───────────────────────────────────
--
-- Una fotografía de obra guarda tres ficheros (ADR-002): el original tal como salió
-- de la cámara, una derivada de 2000 px para consultar y una miniatura de 400 px.
-- El cartel guarda **dos**, y falta el original a propósito:
--
--   · el original de una fotografía de obra es el documento de conservación —de él
--     sale la copia que se manda a una imprenta (RF-420)— y el cartel no es eso: es
--     una referencia para reconocer la exposición;
--   · subirlo cuesta los megabytes de la foto de un móvil en un almacén con mala
--     cobertura, tres veces, y ése es el motivo por el que las derivadas se generan
--     en el navegador y no en un servidor que este proyecto no tiene (ADR-001).
--
-- Si algún día el cartel hace falta a resolución de imprenta, lo que se añade es una
-- columna más y no un cambio de forma: por eso las dos rutas se guardan con nombre
-- propio y no como un fichero «el cartel».
--
-- ── NO HACE FALTA NINGUNA POLÍTICA DE ALMACENAMIENTO ────────
--
-- Los dos ficheros van al bucket privado `obras` bajo un prefijo propio, y las tres
-- políticas de `storage.objects` de 20260726010000 cubren el bucket entero con
-- `puede_leer()` y `puede_editar()`. Lo que se protege aquí es la fila que lleva las
-- rutas, porque sin ella nadie sabe qué firmar. (`obras` es el identificador de
-- legado del bucket — ver CLAUDE.md.)
-- ============================================================

alter table public.exhibitions
  -- La miniatura de 400 px, que es lo que pinta el listado, y la derivada de 2000 px,
  -- que es lo que se abre al tocarla. Nulas las dos: una exposición sin cartel es el
  -- estado normal de casi todas.
  add column poster_thumbnail_path text,
  add column poster_derivative_path text,
  -- El reloj del cliente, como en `archive_documents`: es el momento en el que se
  -- subió el fichero, y es lo que hace que la respuesta a «¿tiene cartel?» sea la
  -- fila y no una bandera al lado que un día la contradice.
  add column poster_uploaded_at timestamptz;

comment on column public.exhibitions.poster_thumbnail_path is
  'Ruta de la miniatura del cartel en el bucket privado (RF-518). Es lo que pinta el listado de exposiciones.';
comment on column public.exhibitions.poster_derivative_path is
  'Ruta de la copia de consulta del cartel, 2000 px (RF-518). No se guarda el original: el cartel es una referencia, no el documento de conservación de una obra.';
comment on column public.exhibitions.poster_uploaded_at is
  'Cuándo se subió el cartel. Nulo si no hay cartel: la respuesta a «¿tiene cartel?» es la fila y no una bandera.';

alter table public.exhibitions
  -- Las tres o ninguna, con el mismo criterio de todo-o-nada que `archive_documents`
  -- aplica a su fichero digitalizado: una miniatura sin derivada es una imagen que se
  -- ve en el listado y no se puede abrir, y una ruta sin fecha es un cartel que no se
  -- sabe de cuándo es.
  add constraint exhibitions_poster_all_or_nothing check (
    num_nonnulls(poster_thumbnail_path, poster_derivative_path, poster_uploaded_at) in (0, 3)
  ),

  add constraint exhibitions_poster_thumbnail_shape check (
    poster_thumbnail_path is null
    or (poster_thumbnail_path = btrim(poster_thumbnail_path) and poster_thumbnail_path <> '')
  ),
  add constraint exhibitions_poster_derivative_shape check (
    poster_derivative_path is null
    or (poster_derivative_path = btrim(poster_derivative_path) and poster_derivative_path <> '')
  ),

  -- Y no pueden ser la misma: dos columnas con la misma ruta significan que una
  -- escritura se hizo a medias, y lo que se vería es la miniatura de 400 px estirada
  -- a pantalla completa.
  add constraint exhibitions_poster_paths_distinct check (
    poster_thumbnail_path is null or poster_thumbnail_path <> poster_derivative_path
  );


-- ── Medido dentro de esta transacción ───────────────────────
--
-- Las columnas nuevas no pueden llegar con un privilegio para el rol anónimo —un
-- `grant` de tabla cubre las columnas que se añadan después, y los `revoke` también,
-- pero esto no se da por hecho: se mide— y las restricciones tienen que rechazar de
-- verdad lo que dicen rechazar.

do $$
declare
  v_id uuid;
  v_failed boolean;
begin
  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'exhibitions'
                and grantee = 'anon') then
    raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre exhibitions';
  end if;

  insert into public.exhibitions (title, year) values ('Comprobación del cartel', 1985)
  returning id into v_id;

  -- Media escritura: una miniatura sin su derivada.
  v_failed := false;
  begin
    update public.exhibitions set poster_thumbnail_path = 'carteles/x_min.webp' where id = v_id;
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: se admitió media escritura del cartel';
  end if;

  -- Las dos rutas iguales.
  v_failed := false;
  begin
    update public.exhibitions
       set poster_thumbnail_path = 'carteles/x.webp',
           poster_derivative_path = 'carteles/x.webp',
           poster_uploaded_at = now()
     where id = v_id;
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: se admitieron las dos rutas del cartel iguales';
  end if;

  -- Y las tres juntas, que es la única forma válida.
  update public.exhibitions
     set poster_thumbnail_path = 'carteles/x_min.webp',
         poster_derivative_path = 'carteles/x_der.webp',
         poster_uploaded_at = now()
   where id = v_id;

  -- Quitarlo es poner las tres a nulo, y también tiene que pasar.
  update public.exhibitions
     set poster_thumbnail_path = null,
         poster_derivative_path = null,
         poster_uploaded_at = null
   where id = v_id;

  delete from public.exhibitions where id = v_id;

  raise notice 'OK: el cartel de una exposición son dos rutas y una fecha, o ninguna';
end $$;
