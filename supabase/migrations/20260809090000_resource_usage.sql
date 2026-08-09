-- Cuánto ocupa el catálogo, para poder verlo desde la aplicación (RF-1202).
--
-- El catálogo vive repartido en tres sitios con tres límites distintos: la base
-- de datos y el almacén de fotografías de Supabase, y el bucket de másters de
-- Backblaze. Los dos primeros se miden aquí; el tercero lo mide la función Edge,
-- que es donde están sus credenciales.
--
-- ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO UNA VISTA ──────────────
--
-- `pg_database_size` y `storage.objects` no son legibles para el rol de la
-- aplicación: el tamaño de la base es del catálogo del servidor, y las filas del
-- almacén están tras las políticas de `storage`. Una vista `security invoker`
-- devolvería cero o un error. Con `security definer` la lectura la hace el
-- propietario y el permiso se comprueba aquí dentro, que es lo mismo que ya hacen
-- `set_main_image` y las demás.
--
-- ── QUIÉN PUEDE PREGUNTARLO ─────────────────────────────────
--
-- El Catalogador y el Superusuario. Un Lector no administra la capacidad de nada
-- y el dato no le sirve: es una cuenta de solo consulta, y el tamaño del disco no
-- es parte del catálogo que consulta. `security definer` obliga a comprobarlo
-- dentro —el privilegio de ejecución no distingue roles—, y por eso la primera
-- línea del cuerpo es la comprobación.

create function public.resource_usage()
returns table (
  /** Lo que ocupa la base entera, índices y catálogo del servidor incluidos. */
  database_bytes bigint,
  /** Lo que ocupan las fotografías del almacén de Supabase. */
  storage_bytes bigint,
  /** Cuántos ficheros hay en ese almacén. */
  storage_objects bigint
)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para consultar el espacio ocupado';
  end if;

  return query
  select
    pg_database_size(current_database())::bigint,
    -- `metadata->>'size'` es lo que el servicio de almacenamiento apunta al
    -- subir. Un objeto sin metadatos cuenta como cero y no rompe la suma: es
    -- preferible quedarse corto en un fichero a no poder dar ninguna cifra.
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint,
    count(o.*)::bigint
  -- `obras` es el identificador de legado del bucket (fila de `storage.buckets`
  -- con objetos dentro). No se renombra: ver CLAUDE.md.
  from storage.objects o
  where o.bucket_id = 'obras';
end $$;

comment on function public.resource_usage is
  'Espacio ocupado en la base y en el almacén de fotografías. Solo Catalogador y Superusuario.';

-- El privilegio de ejecución se concede a la sesión, no a cualquiera: una función
-- `security definer` ejecutable por PUBLIC es una puerta abierta con la llave del
-- propietario puesta.
revoke all on function public.resource_usage() from public;
grant execute on function public.resource_usage() to authenticated;
