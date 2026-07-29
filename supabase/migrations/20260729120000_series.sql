-- ============================================================
-- Series of the artwork: a normalized name, from a controlled vocabulary.
--
-- An artist works in series ("Paisajes de la sierra", "Retratos del taller")
-- and the catalog groups by them, so the name must be written the same way
-- every time: two spellings of one series are two series that nobody can group.
-- Hence a vocabulary and not free text, exactly like artwork_type (RF-213):
-- an OPEN list the cataloger extends from the capture flow, because adding a
-- series must not require a deploy.
--
-- The series may be empty: not every piece belongs to one, and «no series» is
-- a legitimate answer — not a pending datum.
--
-- Integrity by TRIGGER and not a foreign key, same reasoning as artwork_type:
-- '' must stay valid, and a foreign key would demand either a fake '' row in
-- the vocabulary or NULL semantics that the rest of the schema avoids.
-- ============================================================

-- ── The artwork's field ──────────────────────────────────────

alter table public.artworks add column series text not null default '';

comment on column public.artworks.series is
  'Series the artwork belongs to, from the series vocabulary. Empty means it belongs to none.';

-- ── Vocabulary ───────────────────────────────────────────────

create table public.series (
  -- The name is the key: the vocabulary is the value itself, and this keeps
  -- artworks.series readable in any query without a join.
  name text primary key,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- '' means "no series" and lives only in artworks; the vocabulary must not
  -- contain it. Stored trimmed so 'Paisajes' and 'Paisajes ' cannot coexist.
  constraint series_name_not_blank check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.series is
  'Controlled vocabulary of series. Open list: catalogers add entries; nothing is ever deleted (renaming or retiring a series is a future superuser task).';

-- Authorship stamped by trigger, like the other tables: the client is not
-- trusted to send who created the row.
create function public.tg_series_authorship()
returns trigger language plpgsql as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;

create trigger series_authorship
  before insert on public.series
  for each row execute function public.tg_series_authorship();

-- ── Integrity of artworks.series ─────────────────────────────
-- Membership is checked on the trimmed value: the forms trim before saving,
-- and a trailing space must not turn a valid series into a rejected one.

create function public.tg_series_in_vocabulary()
returns trigger language plpgsql
-- SECURITY DEFINER so the check does not depend on the caller being able to
-- read the vocabulary: it is an integrity rule of artworks, not a query.
security definer set search_path = public as $$
begin
  if btrim(new.series) <> ''
     and not exists (select 1 from public.series where name = btrim(new.series))
  then
    -- Users see this message as is: Spanish, like the other data errors.
    raise exception 'La serie «%» no está en el catálogo de series', new.series
      using hint = 'Añádela primero al catálogo de series o elige una existente.';
  end if;
  return new;
end $$;

create trigger series_in_vocabulary
  before insert or update of series on public.artworks
  for each row execute function public.tg_series_in_vocabulary();

-- ── RLS and privileges ───────────────────────────────────────
-- A table without RLS is open, not closed. The revoke is repeated explicitly
-- even though the initial migration revoked the defaults: the default-deny
-- test warns about RLS, not about grants.

alter table public.series enable row level security;

revoke all on public.series from anon, authenticated;

-- Granted one by one. No UPDATE and no DELETE, neither grant nor policy:
-- nothing is ever really deleted (RF-901), and renaming or retiring a series
-- is a future superuser feature — until it exists, those operations stay shut.
grant select, insert on public.series to authenticated;

-- Whoever reads the catalog needs the vocabulary: it labels the record and
-- will feed the series filter, which the Reader also uses.
create policy series_select on public.series
  for select using (public.can_read());

-- Whoever can edit artworks can extend the vocabulary: naming a new series is
-- part of cataloging, not of administering.
create policy series_insert on public.series
  for insert with check (public.can_edit());
