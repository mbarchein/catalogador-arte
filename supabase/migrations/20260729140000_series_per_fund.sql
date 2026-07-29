-- ============================================================
-- A series belongs to a fund.
--
-- The vocabulary was born global, with the name as the primary key, and that
-- is wrong: each artist works in their own series. "Paisajes de la sierra" is
-- a Rotili series and offering it while cataloging Ruiz Campins invites a
-- false datum. So the fund joins the key: (artist, name). The same name in
-- two funds becomes two entries, which is the point — two artists may well
-- title a series the same way and they are still two different series.
--
-- State of the data when this runs: in production the vocabulary is EMPTY
-- (it was created hours ago and nobody has used it). In development it has a
-- couple of entries with artworks using them, so the fund of whatever is in
-- use is derived from those artworks, and the entries nobody uses — which
-- cannot be attributed to any fund — are deleted. The rows are rewritten, so
-- their authorship stamp resets; nothing is lost that is not one tap away from
-- being retyped in the combo.
-- ============================================================

alter table public.series add column artist public.artist_fund;

comment on column public.series.artist is
  'Fund the series belongs to. Part of the key: each fund has its own vocabulary of series.';

-- The old key blocks the fill: a name used by two funds needs two rows.
alter table public.series drop constraint series_pkey;

-- ── Filling in the fund ──────────────────────────────────────

-- One row per (fund, name) the catalog actually uses. The trimmed value is
-- what counts, same as the integrity trigger.
insert into public.series (artist, name)
select distinct a.artist, btrim(a.series)
from public.artworks a
where btrim(a.series) <> ''
  and not exists (
    select 1 from public.series s
    where s.artist = a.artist and s.name = btrim(a.series)
  );

-- What nobody uses cannot be attributed to a fund, and inventing one would be
-- worse than deleting it.
delete from public.series where artist is null;

alter table public.series alter column artist set not null;

alter table public.series add constraint series_pkey primary key (artist, name);

comment on table public.series is
  'Controlled vocabulary of series, one set per fund. Open list: catalogers add entries; nothing is ever deleted (renaming or retiring a series is a future superuser task).';

-- ── Integrity of artworks.series ─────────────────────────────
-- Membership is now checked against the vocabulary OF THE ARTWORK'S FUND: a
-- series that exists, but in another fund, is as invalid as one that does not
-- exist at all.

create or replace function public.tg_series_in_vocabulary()
returns trigger language plpgsql
-- SECURITY DEFINER so the check does not depend on the caller being able to
-- read the vocabulary: it is an integrity rule of artworks, not a query.
security definer set search_path = public as $$
begin
  if btrim(new.series) <> ''
     and not exists (
       select 1 from public.series
       where artist = new.artist and name = btrim(new.series)
     )
  then
    -- Users see this message as is: Spanish, like the other data errors.
    raise exception 'La serie «%» no está en el catálogo de series de este fondo', new.series
      using hint = 'Cada fondo tiene sus propias series: añádela al catálogo de este fondo o elige una existente.';
  end if;
  return new;
end $$;

-- The fund now takes part in the check, so a change of fund must re-check it.
-- The fund is immutable (RF-204, enforced by its own trigger), but this rule
-- must not depend on another rule staying in place to be correct.
drop trigger series_in_vocabulary on public.artworks;

create trigger series_in_vocabulary
  before insert or update of series, artist on public.artworks
  for each row execute function public.tg_series_in_vocabulary();

-- ── RLS and privileges ───────────────────────────────────────
-- Unchanged: select for can_read(), insert for can_edit(), and neither update
-- nor delete — no grant and no policy. Adding a column to a table does not
-- alter its policies, and the wider key changes nothing about who may read or
-- extend the vocabulary.
