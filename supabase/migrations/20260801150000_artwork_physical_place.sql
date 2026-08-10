-- The artwork points at the tree of places (ADR-006, RF-215).
--
-- Second half of the decision. The previous migration created `physical_places`;
-- this one hangs `artworks.physical_place_id`, moves the texts that were there and
-- closes the check that was left pending there because the column did not yet
-- exist: a place with artworks inside is not withdrawn either.
--
-- `physical_location` is NOT withdrawn here. The deployment is in two phases because the
-- old frontend runs for a few seconds against the new schema (see the comment
-- in .github/workflows/desplegar.yml): the column goes in a later
-- migration, when nobody reads it any more.

-- ── The column ──────────────────────────────────────────────
--
-- Null is a legitimate answer and not a missing datum: capture with the piece
-- in front cannot require deciding where it is, just as today it admits the empty
-- string. `restrict` is coherent with nobody being granted DELETE over
-- the places (RF-901); if one were ever deleted by hand, this warns instead
-- of leaving artworks pointing at nothing.

alter table public.artworks
  add column physical_place_id uuid references public.physical_places (id) on delete restrict;

comment on column public.artworks.physical_place_id is
  'Nodo del árbol de lugares donde está la obra (ADR-006). Nulo es legítimo: una obra puede no tener ubicación registrada.';

-- The listing's filter asks «everything there is in the yellow room», and
-- resolves it by climbing the tree down to the artworks of each node.
create index artworks_physical_place_idx on public.artworks (physical_place_id);

-- ── RF-802: moving the artwork IS having had the piece in front ──
--
-- `basic_updated_at` changes the field it watches: what it records is when the
-- artwork was physically examined, and that is now said by the node it points at, not by the
-- text. Renaming or moving a PLACE does not touch a single row of artworks, so it stops
-- moving the date by construction, which is exactly what the ADR says: it is not
-- having had the piece in front. Moving an artwork elsewhere is.
--
-- `physical_location` leaves the tuple, with one bounded consequence: during
-- the seconds the two phases last, a location written from the old frontend
-- will not move the basic date. It is one field and it is seconds; the alternative
-- —watching both— would force redoing this function again on withdrawing the
-- column, and that is the class of debt that gets forgotten.
--
-- `set search_path = public` is here because `create or replace` replaces the
-- WHOLE definition, and with it the configuration 20260801120000 set with an
-- `alter function`: without repeating it, this function would be left without it and
-- function_privileges.test.sql's assertion would catch it.
create or replace function public.tg_artwork_audit_trail()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  -- RF-802: basic_updated_at only moves when a phase-1 field changes, i.e. one
  -- that requires standing in front of the artwork. It records when the piece
  -- was last physically examined — a datum that would be lost if any fix to a
  -- bibliographic note refreshed it.
  if (new.artwork_type, new.technique, new.support, new.height_cm, new.width_cm,
      new.depth_cm, new.signed, new.signature_description, new.dated_on_artwork,
      new.conservation_status, new.physical_place_id)
     is distinct from
     (old.artwork_type, old.technique, old.support, old.height_cm, old.width_cm,
      old.depth_cm, old.signed, old.signature_description, old.dated_on_artwork,
      old.conservation_status, old.physical_place_id)
  then
    new.basic_updated_at := now();
  end if;

  -- Stamp who and when on every trash transition, without trusting the client
  -- to send it.
  if new.active = false and old.active = true then
    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
  elsif new.active = true and old.active = false then
    new.restored_at := now();
    new.restored_by := auth.uid();
  end if;

  return new;
end $$;

-- ── A place with artworks inside is not withdrawn ───────────
--
-- The other half of the check 20260801140000 left half done. An artwork in
-- the wastebasket does not count: it is logically withdrawn, and requiring it to be emptied before withdrawing
-- a shelf would be making the wastebasket get in the way.
create or replace function public.tg_physical_place_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.physical_places
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía contiene otros lugares'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;

    if exists (select 1 from public.artworks
                where physical_place_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía tiene obras dentro'
        using hint = 'Mueve antes las obras a otro sitio.';
    end if;
  end if;
  return new;
end $$;

-- ── The data move ───────────────────────────────────────────
--
-- The texts are split by commas, which is what the previous convention used as a
-- separator, and each level is looked up or created under the previous level. What comes out is a
-- tree in lower case and with no accents, because that is how the text is stored: the
-- names are cured afterwards from the interface, once per place and not once per
-- artwork, which is half the value of the decision.
--
-- Two texts differing only in capitals or accents fall into the same
-- node, because the node is looked up by `place_key`. It is the same rule that prevents
-- two homonymous siblings from existing.
--
-- `created_by` is left null on purpose: inside a migration `auth.uid()`
-- is nobody, and signing these eight nodes with a person would be inventing a
-- trace.

alter table public.artworks disable trigger artwork_audit_trail;

do $$
declare
  v_artwork record;
  v_level text;
  v_parent uuid;
  v_node uuid;
  v_places int := 0;
  v_artworks int := 0;
begin
  for v_artwork in
    select catalog_id, physical_location
      from public.artworks
     where btrim(coalesce(physical_location, '')) <> ''
       -- `zzzz` was a test value and not a site: the artwork carrying it is left
       -- with no location (ADR-006). Naming the exception is more honest than a
       -- heuristic that tomorrow discards a real place.
       and public.place_key(physical_location) <> 'zzzz'
     order by catalog_id
  loop
    v_parent := null;
    v_node := null;

    foreach v_level in array string_to_array(v_artwork.physical_location, ',')
    loop
      v_level := btrim(v_level);
      continue when v_level = '';

      select id into v_node
        from public.physical_places
       where parent_id is not distinct from v_parent
         and public.place_key(name) = public.place_key(v_level);

      if v_node is null then
        insert into public.physical_places (parent_id, name)
        values (v_parent, v_level)
        returning id into v_node;
        v_places := v_places + 1;
      end if;

      v_parent := v_node;
    end loop;

    if v_node is not null then
      update public.artworks set physical_place_id = v_node
       where catalog_id = v_artwork.catalog_id;
      v_artworks := v_artworks + 1;
    end if;
  end loop;

  raise notice 'Lugares creados: %. Obras apuntando al árbol: %.', v_places, v_artworks;
end $$;

-- The audit comes back before anybody else can write: the move is not
-- somebody having edited the artworks (RF-801) nor having had them in front
-- (RF-802), and with `auth.uid()` null the trigger would have erased `updated_by` from
-- all of them.
alter table public.artworks enable trigger artwork_audit_trail;
