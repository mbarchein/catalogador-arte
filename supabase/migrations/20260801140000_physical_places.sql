-- The physical places as a tree (ADR-006, RF-215).
--
-- It replaces the notation convention over `artworks.physical_location`:
-- lower case, no accents and levels separated by commas. That convention lost the
-- datum —the proper name was stored deformed—, it broke as soon as a level
-- carried a comma (a postal address carries one), and it forced touching all the
-- rows of an artwork in order to rename a site.
--
-- Here the name is stored just as it is written and what is normalised is the
-- comparison key. Renaming and moving are one-row operations.
--
-- This migration creates the tree; the next one moves the data and hangs
-- `artworks.physical_place_id`. They are split in two so that the schema can be
-- reviewed without the conversion in front.

-- ── The comparison key ──────────────────────────────────────
--
-- Lower case and with no accents, except the ñ: it is a letter of the alphabet and not an
-- accent, so «muñeca» does not become «muneca». It is the same rule the
-- frontend already applied in location.ts, now on the base's side and as the
-- single source.
--
-- IMMUTABLE because it has to serve as an index, and that is why it uses `translate` instead
-- of `unaccent`: the extension exists, but its function is not immutable —it depends
-- on a dictionary that can be changed— and PostgreSQL does not admit it in an
-- index.
create function public.place_key(p_name text)
returns text language sql immutable strict
set search_path = public as $$
  select translate(
    lower(btrim(p_name)),
    'áàäâãéèëêíìïîóòöôõúùüûýÿÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÝ',
    'aaaaaeeeeiiiiooooouuuuyyAAAAAEEEEIIIIOOOOOUUUUY'
  )
$$;

comment on function public.place_key is
  'Clave de comparación de un nombre de lugar: minúsculas y sin tildes, conservando la ñ. Inmutable para poder indexarla.';

-- ── The tree ────────────────────────────────────────────────

create table public.physical_places (
  -- Surrogate key, not the name (ADR-006): it is what makes renaming
  -- a one-row operation and not a data migration.
  id uuid primary key default gen_random_uuid(),

  -- Null is a root. MUTABLE on purpose: the studio's reorganisation is going to
  -- hang from elsewhere places that today are roots, and that must be an update, not
  -- a redoing. `restrict` because a parent with children is not withdrawn: it is emptied
  -- first.
  parent_id uuid references public.physical_places (id) on delete restrict,

  -- Just as it is written, with its capitals and its accents.
  name text not null,

  -- RF-901: nothing is really deleted.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  constraint physical_places_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.physical_places is
  'Árbol de lugares físicos (ADR-006). El nombre se guarda como se escribe; place_key(name) es la clave de comparación. parent_id es mutable: reorganizar el árbol es una operación normal.';

-- Two siblings cannot be called the same, compared with no accents and no capitals.
-- They are two indexes because in SQL one null is not equal to another null: without the
-- partial one, two homonymous roots would pass.
create unique index physical_places_raiz_unica
  on public.physical_places (public.place_key(name))
  where parent_id is null;

create unique index physical_places_hermanos_unicos
  on public.physical_places (parent_id, public.place_key(name))
  where parent_id is not null;

create index physical_places_parent_idx on public.physical_places (parent_id);

-- ── No cycles ───────────────────────────────────────────────
-- A building inside its own shelf leaves the tree unrecoverable: no
-- recursive query terminates and the node disappears from the hierarchy without having been
-- deleted. It is cheap to check and expensive to discover.

create function public.tg_physical_place_no_cycle()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_ancestro uuid := new.parent_id;
  v_saltos int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un lugar no puede estar dentro de sí mismo';
  end if;

  while v_ancestro is not null loop
    if v_ancestro = new.id then
      raise exception 'Ese movimiento metería el lugar dentro de uno de sus descendientes';
    end if;
    -- Belt: if the tree were already corrupt, this stops instead of hanging.
    v_saltos := v_saltos + 1;
    if v_saltos > 100 then
      raise exception 'La jerarquía de lugares tiene un ciclo';
    end if;
    select parent_id into v_ancestro from public.physical_places where id = v_ancestro;
  end loop;

  return new;
end $$;

create trigger physical_place_no_cycle
  before insert or update of parent_id on public.physical_places
  for each row execute function public.tg_physical_place_no_cycle();

-- ── Authorship and withdrawal, stamped by the base ──────────
-- As in obras and imagenes: the client is not trusted to send who.

create function public.tg_physical_place_authorship()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.active = false and old.active = true then
    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
  elsif new.active = true and old.active = false then
    new.deactivated_at := null;
    new.deactivated_by := null;
  end if;
  return new;
end $$;

create trigger physical_place_authorship
  before insert or update on public.physical_places
  for each row execute function public.tg_physical_place_authorship();

-- A place with content is not withdrawn: it is emptied first. It holds for the children and
-- for the artworks, and the artworks check is added in the migration that creates
-- the column, because until then it does not exist.
create function public.tg_physical_place_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.physical_places
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía contiene otros lugares'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;
  end if;
  return new;
end $$;

create trigger physical_place_deactivation
  before update of active on public.physical_places
  for each row execute function public.tg_physical_place_deactivation();

-- ── RLS and privileges ──────────────────────────────────────
-- A table with no RLS is open, not closed. It is revoked and granted one by one,
-- because the platform grants by default the privileges of every new table.

alter table public.physical_places enable row level security;

revoke all on public.physical_places from anon, authenticated;

-- No DELETE: neither privilege nor policy (RF-901). Withdrawing is an update of
-- `active`. And yes UPDATE, unlike in series and artwork types: renaming
-- and moving are the reason for this table (ADR-006), not a future feature.
grant select, insert, update on public.physical_places to authenticated;

-- Whoever reads the catalogue needs the places: they label the record and feed the
-- listing's filter, which the Reader also uses.
create policy physical_places_select on public.physical_places
  for select using (public.can_read());

create policy physical_places_insert on public.physical_places
  for insert with check (public.can_edit());

create policy physical_places_update on public.physical_places
  for update using (public.can_edit()) with check (public.can_edit());

-- ── The functions' privileges ───────────────────────────────
-- Explicit and not entrusted to the default privileges: migration
-- 20260801120000 added `alter default privileges ... revoke all on functions
-- from public` and, checked on this platform, it does NOT suppress the implicit
-- grant — a function created afterwards is still born with EXECUTE for
-- PUBLIC. That line stays because it does not get in the way, but what prevents this
-- from repeating is function_privileges.test.sql's assertion, which is exactly what
-- caught these four.
revoke all on function public.place_key(text) from public;
revoke all on function public.tg_physical_place_no_cycle() from public;
revoke all on function public.tg_physical_place_authorship() from public;
revoke all on function public.tg_physical_place_deactivation() from public;

-- place_key is used inside the indexes and the selector itself: the planner
-- resolves it, the API does not call it. Granted to whoever queries so as to be able
-- to compare names from the client without duplicating the rule.
grant execute on function public.place_key(text) to authenticated;
