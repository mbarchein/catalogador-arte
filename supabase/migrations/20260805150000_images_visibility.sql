-- ============================================================
-- The photograph of a withdrawn artwork is not visible (RF-609, RF-905, RF-906, RF-105,
-- RF-106, RF-110, RF-111).
--
-- ── THE CASCADE'S LAST HOLE, MEASURED ───────────────────────
--
-- 20260805130000 closed the visibility cascade of the six documentary tables
-- and left the one that was missing written down, out loud: with a logically withdrawn artwork,
-- an authenticated Reader saw
--
--   artworks (the withdrawn artwork) .. 0 rows   ← correct
--   images (its photograph) ........... 1 row    ← LEAK
--
-- and with the row, its three private-store paths: `thumbnail_path`,
-- `derivative_path` and `master_path`. The record was hidden and the photograph
-- of that hidden record was not.
--
-- That the path is not by itself a download —a signed URL is needed
-- (RF-110, RNF-111)— is what made this not the urgency the collector's
-- contact was, and it is also what does not make it acceptable:
-- the path carries the `catalog_id` in its name, so enumerating `images` tells
-- whoever asks WHICH artworks are in the wastebasket and how many shots each one has.
-- That is exactly what RF-609 does not want to be knowable.
--
-- ── WHY NOW ─────────────────────────────────────────────────
--
-- Because the hole was pinned down with an INVERTED assertion in
-- `documentary_visibility.test.sql` §8: a block asserting that the leak
-- was still there and that would go red the day it was closed. A red has to
-- always mean «something has broken»; if it can mean «somebody has fixed
-- something», the colour stops informing. So the assertion is turned round and for that
-- the hole has to be closed, which is besides the way of closing it that the
-- comment itself asked for.
--
-- ── HOW ─────────────────────────────────────────────────────
--
-- Just like the six of 20260805130000, and on purpose: a single criterion written
-- in a single way. The visibility is inherited from the anchor with an `exists` over
-- `artworks`, which goes through `artworks`' policy —`(active and can_read()) or
-- can_edit()`— and therefore
--
--   * it hides the row from the Reader when the artwork is in the wastebasket, and
--   * it always returns it to the Cataloguer, because `can_edit()` is true:
--     restoring an artwork has to give it back with its photographs inside
--     (RF-905), and the wastebasket has to be able to show what is withdrawn (RF-906).
--
-- No new foreign key and no new index are needed: `images.catalog_id` already
-- references `artworks` and is already indexed.
--
-- ONLY THE SELECT IS TOUCHED. `insert` and `update` go on being `can_edit()` on
-- its own: whoever writes sees all the artworks, so inheriting there would not change a
-- single decision and would leave the same criterion in three places.
--
-- ── WHAT IT DRAGS ALONG, AND IT IS WHAT IS WANTED ───────────
--
-- Two already written policies query `images` by its own policy, so they
-- inherit this closure without being touched:
--
--   * `external_links` (20260805100000) for the links that hang from a
--     PHOTOGRAPH — «where this reproduction came from»—, and
--   * `change_log` (20260805120000) for the history lines whose row is a
--     photograph.
--
-- Both stop showing the Reader what hangs from the photograph of a withdrawn
-- artwork, which is RF-609's same rule reaching the end of the chain.
-- And the `representative_image` view carries `security_invoker = true`, so it
-- inherits too: it was the other path by which the same row was reached.
--
-- WHAT IT IS CHECKED AGAINST. `documentary_visibility.test.sql` §8, now the right way round:
-- the Reader does not see the row, the Cataloguer does, and what hangs from it is not
-- visible either. Authenticating for real as each role, which is the only thing that verifies a
-- policy.
-- ============================================================

drop policy images_select on public.images;

create policy images_select on public.images
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = images.catalog_id
    )
  );


-- And that the table still have exactly its three policies: rewriting the select has
-- not added a fourth nor lost one along the way (RF-111, RF-901).
do $$
declare v_cmds text[];
begin
  select coalesce(array_agg(cmd::text order by cmd::text), '{}')
    into v_cmds
    from pg_policies
   where schemaname = 'public' and tablename = 'images';

  if v_cmds <> array['INSERT', 'SELECT', 'UPDATE'] then
    raise exception
      'FAIL: public.images debería seguir con exactamente SELECT, INSERT y UPDATE, tiene [%]',
      array_to_string(v_cmds, ', ');
  end if;

  -- And that the select really look at its anchoring column: with no `catalog_id` in the
  -- expression it inherits nothing, and the block above would pass just the same.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'images' and cmd = 'SELECT'
       and qual like '%catalog_id%'
  ) then
    raise exception
      'FAIL: la política de select de public.images no mira su columna catalog_id, así que no hereda la visibilidad de la obra';
  end if;

  raise notice 'OK: public.images hereda la visibilidad de su obra y sigue con tres políticas';
end $$;
