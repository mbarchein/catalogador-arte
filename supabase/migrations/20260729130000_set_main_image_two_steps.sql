-- ============================================================
-- Fix: changing the main image failed with «duplicate key value violates
-- unique constraint "images_single_index_idx"».
--
-- The previous version marked the chosen image and unmarked the rest in ONE
-- statement, on the belief that the partial unique index is checked at the end
-- of the statement. It is not: only DEFERRABLE constraints are, and a partial
-- unique index cannot be deferred. Within a single UPDATE, Postgres writes row
-- by row, so if the row being marked is written BEFORE the row that was marked
-- gets unmarked, both are true at once and the index rejects it.
--
-- That is why it worked sometimes: the outcome depended on the physical order
-- of the rows. Marking a photo stored after the current main one happened to
-- succeed; marking one stored before it failed. Nothing to do with the framing
-- editor, whose report surfaced the bug.
--
-- Two statements now, unmark first: there is an instant with no image marked,
-- which is a state the catalog already knows how to read — the fallback rule of
-- the representative_image view (RF-403) covers exactly that. And both run in
-- the same transaction, so nobody ever sees it.
-- ============================================================

create or replace function public.set_main_image(p_image_id text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_artwork text;
  v_active boolean;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para cambiar la imagen principal';
  end if;

  select catalog_id, active into v_artwork, v_active
    from public.images
   where image_id = p_image_id;

  if v_artwork is null then
    raise exception 'No existe la imagen %', p_image_id;
  end if;

  -- A deactivated image cannot represent the artwork: the visual index would
  -- show a photo that does not appear in the record.
  if not v_active then
    raise exception 'La imagen % está dada de baja y no puede ser la principal', p_image_id;
  end if;

  -- 1. Clear the previous one. Doing this first is what keeps the partial
  --    unique index satisfied at every single row write.
  update public.images
     set index_image = false
   where catalog_id = v_artwork
     and active
     and index_image
     and image_id <> p_image_id;

  -- 2. Mark the chosen one.
  update public.images
     set index_image = true
   where image_id = p_image_id
     and not index_image;

  return p_image_id;
end $$;

comment on function public.set_main_image is
  'Marks an image as representative of its artwork and unmarks the rest, unmarking first so the partial unique index holds at every row (RF-405).';
