-- The artwork that was left outside the tree of places.
--
-- The move of `physical_location` to the tree was done by
-- `20260801150000_artwork_physical_place.sql`, and its test checks over a base
-- loaded with the dump that no location in text was left with no node. That
-- test was red because of **AR-0002**: it carries **exactly the same** location
-- text as AR-0001 and RC-0005 —«museo de arte contemporaneo vicente aguilera
-- cerni macva»—, those two point at the tree and its own was left at null. The
-- consequence for the user is not cosmetic: AR-0002 **does not appear on opening
-- MACVA** in the tree, even though its record says it is there.
--
-- The application **no longer writes** `physical_location` (only comments
-- in `types.ts`, `artworksCache.ts` and `usePhysicalPlaces.ts` name it), so no new
-- orphans are going to appear by that route: this closes a gap, not a tap.
--
-- **Why the move's walk is NOT re-run**, which is the first thing
-- one tries and is wrong: that code splits the text by commas and looks for each
-- level *under the previous level*, starting at the root. But the tree has lived
-- ever since, which is exactly what it exists for (ADR-006): MACVA's node
-- was renamed with its capitals and **was moved under «Villafamés (Catellón)»**. A
-- walk that looks for «museo de arte…» at the root no longer finds it there, so
-- it would create a **second** node with the same name at root level and would leave the
-- catalogue with MACVA duplicated and the artworks split between the two. Checked
-- locally: it created the duplicate.
--
-- **The rule that does hold:** an orphan artwork whose `physical_location` is
-- identical to that of an artwork that **already** points at the tree inherits its same node. It
-- invents no structure, guesses no levels, does not depend on what the node is called today
-- nor on where it is hung, and it survives the renamings and the moves the
-- tree is designed to allow. It is also required that the destination be **unique**:
-- if two artworks with the same text pointed at different nodes, there is no correct
-- answer and the row is left as it is instead of choosing by lottery.
--
-- What this migration deliberately does **not** do: it does not touch the artworks that already
-- point at a node, it does not create a single new place, it does not withdraw `physical_location` —that
-- is the second phase of the deployment the move's migration already explained— and it does not
-- resolve `zzzz`'s orphan, which was a test value and not a site and goes on
-- with no location on purpose (ADR-006).

-- The audit is switched off for the same reason as in the original move: this is not
-- somebody having edited the artwork nor having had it in front (RF-801), so
-- signing it with a null `auth.uid()` would be lying about who touched it.
alter table public.artworks disable trigger artwork_audit_trail;

do $$
declare
  v_artwork record;
  v_node uuid;
  v_matches int;
  v_linked int := 0;
  v_left int := 0;
begin
  for v_artwork in
    select catalog_id, physical_location
      from public.artworks
     where btrim(coalesce(physical_location, '')) <> ''
       and public.place_key(physical_location) <> 'zzzz'
       and physical_place_id is null
     order by catalog_id
  loop
    -- The node the artworks carrying this same text point at, and how many
    -- distinct ones they are: with more than one there is no correct answer.
    -- `array_agg(distinct …)` and not `min(…)`: in PostgreSQL there is no `min(uuid)`, and
    -- ordering uuids would mean nothing anyway. The element is used only
    -- when the count of distinct ones is exactly one.
    select count(distinct physical_place_id), (array_agg(distinct physical_place_id))[1]
      into v_matches, v_node
      from public.artworks
     where physical_place_id is not null
       and public.place_key(coalesce(physical_location, ''))
           = public.place_key(v_artwork.physical_location);

    if v_matches = 1 then
      update public.artworks set physical_place_id = v_node
       where catalog_id = v_artwork.catalog_id;
      v_linked := v_linked + 1;
    else
      -- With no linked twin, or with several that disagree, the row is left as
      -- it is and it is said out loud. Keeping quiet about it would leave the test red without explaining
      -- why, and guessing the node is worse than not touching it.
      v_left := v_left + 1;
      raise notice
        'La obra % no se ha podido enlazar: % destinos posibles para «%».',
        v_artwork.catalog_id, v_matches, v_artwork.physical_location;
    end if;
  end loop;

  raise notice 'Obras huérfanas enlazadas: %. Sin resolver: %.', v_linked, v_left;
end $$;

-- The audit comes back before anybody else can write, and its reactivation is
-- checked by `artwork_physical_place.test.sql`: if it were ever forgotten, the
-- catalogue would lose the trace with nothing failing.
alter table public.artworks enable trigger artwork_audit_trail;
