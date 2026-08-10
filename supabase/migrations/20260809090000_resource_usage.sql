-- How much the catalogue takes up, so that it can be seen from the application (RF-1202).
--
-- The catalogue lives split across three places with three different limits: Supabase's
-- database and photograph store, and Backblaze's master
-- bucket. The first two are measured here; the third is measured by the Edge function,
-- which is where its credentials are.
--
-- ── WHY THIS IS A FUNCTION AND NOT A VIEW ───────────────────
--
-- `pg_database_size` and `storage.objects` are not readable for the application's
-- role: the base's size belongs to the server's catalogue, and the store's
-- rows are behind `storage`'s policies. A `security invoker` view
-- would return zero or an error. With `security definer` the read is done by the
-- owner and the permission is checked in here, which is the same thing
-- `set_main_image` and the others already do.
--
-- ── WHO CAN ASK FOR IT ──────────────────────────────────────
--
-- The Cataloguer and the Superuser. A Reader administers nobody's capacity
-- and the datum is of no use to them: it is a consultation-only account, and the disk's size is
-- not part of the catalogue they consult. `security definer` forces checking it
-- inside —the execution privilege does not distinguish roles—, and that is why the first
-- line of the body is the check.

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
    -- `metadata->>'size'` is what the storage service notes down on
    -- uploading. An object with no metadata counts as zero and does not break the sum: it is
    -- preferable to fall short on one file than not to be able to give any figure.
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint,
    count(o.*)::bigint
  -- `obras` is the bucket's legacy identifier (a row of `storage.buckets`
  -- with objects inside). It is not renamed: see CLAUDE.md.
  from storage.objects o
  where o.bucket_id = 'obras';
end $$;

comment on function public.resource_usage is
  'Espacio ocupado en la base y en el almacén de fotografías. Solo Catalogador y Superusuario.';

-- The execution privilege is granted to the session, not to anybody: a
-- `security definer` function executable by PUBLIC is an open door with the owner's
-- key left in it.
revoke all on function public.resource_usage() from public;
grant execute on function public.resource_usage() to authenticated;
