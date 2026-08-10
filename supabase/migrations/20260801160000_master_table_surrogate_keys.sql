-- Surrogate key in the artwork types and in the series (ADR-007).
--
-- First of the decision's two deliveries. Both tables had the name
-- as the key —`series` the pair `(artist, name)`— and the artwork stored that text
-- copied, so renaming «Técnica mixta» forced touching every artwork that
-- used it. With a key of its own, renaming is one row and the whole catalogue sees it,
-- which is the same thing ADR-006 did with the places.
--
-- Logical deletion also appears where there was none (RF-901): a type or a series is
-- withdrawn, not deleted, and what still has artworks inside cannot be withdrawn.
--
-- The fund (`artist_fund`) does NOT come in here. It is an enumerated type and its values
-- hold up `catalog_id`'s prefix, which is the label stuck to the painting: it goes
-- in the second delivery, so that that part is reviewed with the per-fund numbering
-- in front and not in passing.
--
-- The text columns `artworks.artwork_type` and `artworks.series` are NOT withdrawn
-- here: the old frontend runs for a few seconds against the new schema, so they
-- go in a later deployment, along with their vocabulary triggers.

-- ── Artwork types ───────────────────────────────────────────

alter table public.artwork_types
  add column id uuid not null default gen_random_uuid(),
  -- RF-901: nothing is really deleted. It did not exist because there was no way of
  -- withdrawing a type; now that the key is not the name, there is.
  add column active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles (id);

-- The name stops being the key and becomes a unique attribute. Unique for
-- real, not by custom: two types with the same name are the same type, and
-- what has been let go of is the identity, not the uniqueness.
alter table public.artwork_types drop constraint artwork_types_pkey;
alter table public.artwork_types add constraint artwork_types_pkey primary key (id);
alter table public.artwork_types add constraint artwork_types_name_key unique (name);

comment on table public.artwork_types is
  'Vocabulario controlado de tipos de obra (RF-213), con clave sustituta (ADR-007): el nombre es un atributo y renombrar es una fila. Lista abierta; nada se borra, se retira.';

-- ── Series ──────────────────────────────────────────────────

alter table public.series
  add column id uuid not null default gen_random_uuid(),
  add column active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles (id);

-- The pair (fund, name) stops being the key and goes on being unique: each
-- artist works in their own series, and two series of the same fund with the
-- same name are the same series. What it no longer is, is the row's identity.
alter table public.series drop constraint series_pkey;
alter table public.series add constraint series_pkey primary key (id);
alter table public.series add constraint series_artist_name_key unique (artist, name);

comment on table public.series is
  'Vocabulario controlado de series, uno por fondo (ADR-007): clave sustituta, y la pareja (fondo, nombre) como única. Lista abierta; nada se borra, se retira.';

-- ── The artwork points by identifier ────────────────────────
--
-- `restrict` in both, coherent with nobody being granted DELETE:
-- if a row were ever deleted by hand, this warns instead of leaving artworks
-- pointing at nothing.
--
-- Null is legitimate in both, and it does not mean the same thing in each: an artwork with no
-- series belongs to none, and an artwork with no type does not have it
-- registered yet. It is what the empty string of the text columns says today.

alter table public.artworks
  add column artwork_type_id uuid references public.artwork_types (id) on delete restrict,
  add column series_id uuid references public.series (id) on delete restrict;

comment on column public.artworks.artwork_type_id is
  'Tipo de obra, del vocabulario (ADR-007). Nulo es «sin registrar todavía».';
comment on column public.artworks.series_id is
  'Serie a la que pertenece la obra (ADR-007). Nulo es «no pertenece a ninguna», que es una respuesta y no un dato pendiente.';

create index artworks_artwork_type_idx on public.artworks (artwork_type_id);
create index artworks_series_idx on public.artworks (series_id);

-- ── The data move ───────────────────────────────────────────
--
-- As in 20260801150000: the audit is switched off while it writes, because
-- inside a migration `auth.uid()` is nobody and the trigger would erase the
-- «actualizado por» of every artwork. And this is not having had the piece
-- in front either (RF-802).
--
-- The pairing is by the trimmed text, which is what the vocabulary
-- trigger already required: if an artwork has a type written, that type is in the
-- vocabulary, or the row could not have been saved.

alter table public.artworks disable trigger artwork_audit_trail;

update public.artworks a
   set artwork_type_id = t.id
  from public.artwork_types t
 where btrim(a.artwork_type) <> ''
   and t.name = btrim(a.artwork_type);

-- The series is paired by fund AND name: the same name in another fund is another
-- series, which is the reason the fund entered the key.
update public.artworks a
   set series_id = s.id
  from public.series s
 where btrim(a.series) <> ''
   and s.artist = a.artist
   and s.name = btrim(a.series);

alter table public.artworks enable trigger artwork_audit_trail;

do $$
declare
  v_tipos int;
  v_series int;
  v_huerfanos int;
begin
  select count(*) into v_tipos from public.artworks where artwork_type_id is not null;
  select count(*) into v_series from public.artworks where series_id is not null;
  -- If the vocabulary trigger has done its job ever since it existed, this is
  -- zero. If it is not, it has to be known now and not when a datum is missing from a
  -- record.
  select count(*) into v_huerfanos
    from public.artworks
   where (btrim(artwork_type) <> '' and artwork_type_id is null)
      or (btrim(series) <> '' and series_id is null);

  raise notice 'Obras con tipo: %. Con serie: %. Sin emparejar: %.', v_tipos, v_series, v_huerfanos;
  if v_huerfanos > 0 then
    raise exception 'Hay % obras cuyo tipo o serie en texto no está en su vocabulario', v_huerfanos;
  end if;
end $$;

-- ── The series is still the one of the artwork's fund ───────
--
-- The foreign key guarantees the series exists, not that it is of the artwork's fund:
-- «Paisajes de la sierra» is a Rotili series and putting it on a Ruiz Campins
-- is a false datum. That rule was held up by the trigger that checks the text
-- against the fund's vocabulary, and here it is repeated for the identifier.
--
-- A trigger and not a `check` constraint because a `check` cannot query
-- another table.
create function public.tg_artwork_series_matches_fund()
returns trigger language plpgsql
-- SECURITY DEFINER for the same reason as the vocabulary one: it is an integrity
-- rule of the artworks, not a client query.
security definer set search_path = public as $$
declare v_artist public.artist_fund;
begin
  if new.series_id is null then
    return new;
  end if;

  select artist into v_artist from public.series where id = new.series_id;
  if v_artist is distinct from new.artist then
    raise exception 'Esa serie no es del fondo de la obra'
      using hint = 'Cada fondo tiene sus propias series: elige una del fondo de esta obra.';
  end if;
  return new;
end $$;

create trigger artwork_series_matches_fund
  before insert or update of series_id, artist on public.artworks
  for each row execute function public.tg_artwork_series_matches_fund();

-- ── RF-802: the basic date watches the identifier ───────────
--
-- The artwork type is a phase-1 field —it is taken with the artwork in front— and it goes on
-- being one; what changes is that the identifier says it. The series is not in the
-- tuple and goes on not being: it is decided by reading a catalogue, not by measuring the piece.
--
-- `artwork_type` leaves the tuple, with the same bounded consequence as
-- `physical_location`: during the seconds the two phases last, a type
-- written by the old frontend will not move the basic date.
--
-- `set search_path = public` is repeated because `create or replace` replaces the
-- whole definition and with it the configuration (see 20260801150000).
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
  if (new.artwork_type_id, new.technique, new.support, new.height_cm, new.width_cm,
      new.depth_cm, new.signed, new.signature_description, new.dated_on_artwork,
      new.conservation_status, new.physical_place_id)
     is distinct from
     (old.artwork_type_id, old.technique, old.support, old.height_cm, old.width_cm,
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

-- ── Authorship and withdrawal, stamped by the base ──────────
-- The two authorship triggers only stamped the creation, because there was no withdrawal to
-- stamp. Now there is, and with the same shape as in the places.

create or replace function public.tg_artwork_type_authorship()
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

drop trigger artwork_type_authorship on public.artwork_types;
create trigger artwork_type_authorship
  before insert or update on public.artwork_types
  for each row execute function public.tg_artwork_type_authorship();

create or replace function public.tg_series_authorship()
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

drop trigger series_authorship on public.series;
create trigger series_authorship
  before insert or update on public.series
  for each row execute function public.tg_series_authorship();

-- ── What has artworks inside is not withdrawn ───────────────
-- Same rule as the places, and for the same reason: withdrawing a type that
-- twenty-one artworks use is not withdrawing it, it is leaving the catalogue pointing at something
-- the interface no longer offers. An artwork in the wastebasket does not count.

create function public.tg_artwork_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.artworks
                  where artwork_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de obra que todavía usan obras del catálogo'
      using hint = 'Cambia antes el tipo de esas obras.';
  end if;
  return new;
end $$;

create trigger artwork_type_deactivation
  before update of active on public.artwork_types
  for each row execute function public.tg_artwork_type_deactivation();

create function public.tg_series_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.artworks
                  where series_id = new.id and active) then
    raise exception 'No se puede retirar una serie que todavía tiene obras dentro'
      using hint = 'Saca antes las obras de la serie.';
  end if;
  return new;
end $$;

create trigger series_deactivation
  before update of active on public.series
  for each row execute function public.tg_series_deactivation();

-- ── Privileges ─────────────────────────────────────────────
-- The two tables were granted with `select, insert` and with no UPDATE, because
-- renaming and withdrawing were «a future superuser feature». That feature is
-- now the point of the decision, and whoever exercises it is the Cataloguer, just as
-- with the places: the studio is being reorganised and waiting for an administrator
-- to correct a name is not viable.
--
-- No DELETE, as always: neither privilege nor policy.

grant update on public.artwork_types to authenticated;
grant update on public.series to authenticated;

create policy artwork_types_update on public.artwork_types
  for update using (public.can_edit()) with check (public.can_edit());

create policy series_update on public.series
  for update using (public.can_edit()) with check (public.can_edit());

-- ── The functions' privileges ──────────────────────────────
-- Explicit, as in 20260801140000: a new function is born with EXECUTE for
-- PUBLIC on this platform, and what catches it is function_privileges.test.sql.

revoke all on function public.tg_artwork_series_matches_fund() from public;
revoke all on function public.tg_artwork_type_deactivation() from public;
revoke all on function public.tg_series_deactivation() from public;
