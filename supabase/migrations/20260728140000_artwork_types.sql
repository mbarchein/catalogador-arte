-- ============================================================
-- Controlled vocabulary of artwork types (RF-213, field schema v11).
--
-- Until now `artworks.artwork_type` was free text with a hardcoded suggestion
-- list in the frontend. That list now lives in the database, where every
-- client reads the same one and a cataloger can extend it from the capture
-- flow — the whole point of an open list is that adding "Acuarela" does not
-- require a deploy.
--
-- Integrity with artworks.artwork_type is enforced by a TRIGGER, not a foreign
-- key, on purpose: '' means "type not recorded yet" and must stay valid (the
-- schema convention is `text not null default ''`, never NULL). A foreign key
-- would demand either a '' row in the vocabulary — a fake type that every
-- dropdown would then have to hide — or switching the column to NULL
-- semantics, which the rest of the schema deliberately avoids. The trigger
-- checks membership only when a non-empty value is written.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────

create table public.artwork_types (
  -- The name is the key: the vocabulary is the value itself, there is nothing
  -- to look up behind an id. It also makes artworks.artwork_type readable in
  -- any query without a join.
  name text primary key,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- '' means "no type" and lives only in artworks; the vocabulary must not
  -- contain it. Stored trimmed so that 'Pintura' and 'Pintura ' cannot
  -- coexist as two entries.
  constraint artwork_types_name_not_blank check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.artwork_types is
  'Controlled vocabulary of artwork types (RF-213). Open list: catalogers add entries; nothing is ever deleted (renaming or retiring a type is a future superuser task).';

-- Authorship stamped by trigger, like the other tables: the client is not
-- trusted to send who created the row.
create function public.tg_artwork_type_authorship()
returns trigger language plpgsql as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;

create trigger artwork_type_authorship
  before insert on public.artwork_types
  for each row execute function public.tg_artwork_type_authorship();

-- ── Populate from the existing data ──────────────────────────
-- Every type already written in an artwork is, by definition, part of the
-- vocabulary: the integrity trigger below must not invalidate a single
-- existing row.

insert into public.artwork_types (name)
select distinct btrim(artwork_type)
  from public.artworks
 where btrim(artwork_type) <> ''
on conflict (name) do nothing;

-- ── Integrity of artworks.artwork_type ───────────────────────
-- See the header for why this is a trigger and not a foreign key. Membership
-- is checked on the trimmed value: the forms trim before saving, and a
-- trailing space must not turn a valid type into a rejected one.

create function public.tg_artwork_type_in_vocabulary()
returns trigger language plpgsql
-- SECURITY DEFINER so the check does not depend on the caller being able to
-- read artwork_types: it is an integrity rule of artworks, not a query.
security definer set search_path = public as $$
begin
  if btrim(new.artwork_type) <> ''
     and not exists (select 1 from public.artwork_types where name = btrim(new.artwork_type))
  then
    -- Users see this message as is: Spanish, like the other data errors.
    raise exception 'El tipo de obra «%» no está en el catálogo de tipos', new.artwork_type
      using hint = 'Añádelo primero al catálogo de tipos o elige uno existente.';
  end if;
  return new;
end $$;

create trigger artwork_type_in_vocabulary
  before insert or update of artwork_type on public.artworks
  for each row execute function public.tg_artwork_type_in_vocabulary();

-- ── RLS and privileges ───────────────────────────────────────
-- A table without RLS is open, not closed. The default privileges were already
-- revoked by the initial migration, but the revoke is repeated explicitly: the
-- default-deny test warns about RLS, not about grants, and this table must be
-- correct even if that global default ever changes.

alter table public.artwork_types enable row level security;

revoke all on public.artwork_types from anon, authenticated;

-- Granted one by one. No UPDATE and no DELETE, neither grant nor policy:
-- nothing is ever really deleted (RF-901), and renaming or retiring a type is
-- a future superuser feature — until it exists, the operations stay closed.
grant select, insert on public.artwork_types to authenticated;

-- Whoever reads the catalog needs the vocabulary: it feeds the type filter of
-- the list, which the Reader also uses.
create policy artwork_types_select on public.artwork_types
  for select using (public.can_read());

-- Whoever can edit artworks can extend the vocabulary: adding a type is part
-- of cataloging, not of administering.
create policy artwork_types_insert on public.artwork_types
  for insert with check (public.can_edit());
