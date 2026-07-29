-- ============================================================
-- Explicit order of the photos of an artwork (RF-401, RF-404).
--
-- Until now the gallery showed them by image_id, that is, by upload order.
-- That is an accident of how the record was made, not how the artwork reads:
-- the general view first, then the signature detail, then the back. The
-- cataloger orders them by hand and that order is the documentation's.
--
-- A separate column instead of renumbering image_id: the identifier is a
-- reference used in notes and emails and DP-02 forbids recycling it, so the
-- order cannot live in it.
--
-- The order does NOT decide which image represents the artwork: that is
-- index_image plus the fallback rule of the representative_image view
-- (RF-403), untouched here on purpose — the printed catalog reads the same
-- view and one rule must have one meaning.
-- ============================================================

alter table public.images add column sort_order integer;

comment on column public.images.sort_order is
  'Position of the photo within its artwork, 1..n. Assigned on insert and rearranged by reorder_images.';

-- Existing rows keep exactly what was on screen: the ordinal of image_id.
update public.images
   set sort_order = substring(image_id from '_v([0-9]+)$')::integer;

-- A new photo goes LAST, never in the middle of an order someone arranged.
create function public.tg_assign_image_sort_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1
      into new.sort_order
      from images
     where catalog_id = new.catalog_id;
  end if;
  return new;
end $$;

create trigger assign_image_sort_order
  before insert on public.images
  for each row execute function public.tg_assign_image_sort_order();

alter table public.images alter column sort_order set not null;

-- ── Rearranging ──────────────────────────────────────────────
-- RF-401. No SECURITY DEFINER, like set_main_image: the RLS policies stay in
-- force, so a reader cannot write here; the explicit check only turns the
-- silent "nothing changed" into a readable error, in Spanish because the user
-- reads it.
create function public.reorder_images(p_catalog_id text, p_image_ids text[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_active integer;
  v_given integer := coalesce(array_length(p_image_ids, 1), 0);
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para reordenar las fotografías';
  end if;

  -- A repeated identifier would pass the count check below and leave two rows
  -- fighting for one position, so it is rejected first.
  if v_given <> (select count(distinct id) from unnest(p_image_ids) as id) then
    raise exception 'La lista de fotografías tiene identificadores repetidos';
  end if;

  -- The list must be EXACTLY the active photos of the artwork. A stale client
  -- — someone else added or retired a photo meanwhile — would otherwise leave
  -- images out of the order or drag in another artwork's, and a half-applied
  -- order is worse than a rejected one.
  select count(*) into v_active
    from images
   where catalog_id = p_catalog_id and active;

  if v_active <> v_given then
    raise exception 'La lista de fotografías no coincide con las de la obra %', p_catalog_id;
  end if;

  if exists (
    select 1 from unnest(p_image_ids) as id
    where not exists (
      select 1 from images
       where image_id = id and catalog_id = p_catalog_id and active
    )
  ) then
    raise exception 'Alguna fotografía no pertenece a la obra %', p_catalog_id;
  end if;

  update images i
     set sort_order = p.position
    from (
      select id, ordinality as position
        from unnest(p_image_ids) with ordinality as t(id, ordinality)
    ) p
   where i.image_id = p.id
     and i.sort_order is distinct from p.position;
end $$;

comment on function public.reorder_images is
  'Rearranges the photos of an artwork to the given order, all or nothing (RF-401).';

revoke all on function public.reorder_images(text, text[]) from public, anon;
grant execute on function public.reorder_images(text, text[]) to authenticated;
