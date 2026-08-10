-- The fund, from an enumerated type to a master table (ADR-007, second delivery).
--
-- The first delivery (20260801160000) left this written and deferred it on purpose:
-- «The fund (`artist_fund`) does NOT come in here. It is an enumerated type and its values
-- hold up `catalog_id`'s prefix, which is the label stuck to the painting: it goes
-- in the second delivery, so that that part is reviewed with the per-fund numbering
-- in front and not in passing.» This is that second delivery, and it has been reviewed with
-- the numbering in front — hence what it does NOT do.
--
-- ── WHAT DOES NOT CHANGE, AND WHY ───────────────────────────
--
-- **The enumerated type stays, and the columns too.** `artworks.artist`,
-- `series.artist` and `archive_documents.artist_fund` go on being
-- `public.artist_fund`, and this table joins by that value (`code`). Changing them to
-- a foreign key would force a two-phase deployment over columns in use, and it
-- buys nothing of what was needed: what was asked for was being able to rename the
-- fund, hide it and not be able to delete it.
--
-- **The generation of `catalog_id` is not touched**, nor the constraint that ties the
-- prefix to the fund. `AR-0001` is printed on a label stuck to a painting:
-- the prefix is stored here so that the truth is in one place, but it is stored
-- as a read-only datum, not as something that can be changed.
--
-- **New funds cannot be registered.** With no `insert` —neither privilege nor
-- policy— because a new fund brings a new prefix, and that prefix enters
-- the generation of identifiers, the artworks' constraint and the
-- whitelist of the function that signs the archive's files. That is a schema decision,
-- with its migration, and not a row typed in on a Tuesday.
--
-- ── THE TWO SWITCHES, WHICH ARE DIFFERENT ───────────────────
--
-- `active` is whether the fund **is offered**: on registering an artwork, in the
-- selectors, in the filters. `hide_artworks` is whether **its artworks are set aside** from the
-- listing. They are independent on purpose, because the case that asked for them is the
-- test fund: one wants to stop offering it AND set its artworks aside, but
-- one also wants to be able to stop offering it without hiding anything. Putting them into a
-- single switch would force choosing for the cataloguer.
--
-- Neither of the two deletes anything, and `hide_artworks` is not a policy: the artwork
-- goes on being readable by its identifier and its link goes on working. What
-- it does is make the listing not fetch it by default. Really hiding it
-- would be a deletion by another name.

create table public.artist_funds (
  id uuid primary key default gen_random_uuid(),

  -- The enumerated type's value that ALL the schema's columns store. It is the
  -- join key and it is legacy: `ROTILI` and `RUIZ_CAMPINS` are surnames and `TEST`
  -- is already in English, so it is neither translated nor renamed.
  code public.artist_fund not null unique,

  -- `catalog_id`'s prefix, which is what is printed on the painting's
  -- label. It is stored so that the fund→prefix correspondence is written in
  -- a table and not only inside a function's `case`; it is NOT edited.
  prefix text not null unique,

  -- Just as it is written, with its capitals and its accents. This one IS corrected:
  -- it is the fund's only datum that is an editorial decision.
  name text not null,

  -- RF-901: nothing is deleted, it is withdrawn. Withdrawn here means «it is not offered»,
  -- not «it is not visible»: see the read policy.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- The second switch: setting its artworks aside from the listing. False by default,
  -- which is what the three funds do today.
  hide_artworks boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- A blank name names nothing, and one with spaces around it would break the
  -- comparison without it being visible on screen.
  constraint artist_funds_name_not_blank
    check (btrim(name) <> '' and name = btrim(name)),

  -- Two capital letters, which is the shape of the prefix in `catalog_id` and what
  -- `next_catalog_id` takes for granted when reading the number from the fourth character.
  constraint artist_funds_prefix_shape check (prefix ~ '^[A-Z]{2}$')
);

comment on table public.artist_funds is
  'Los fondos del catálogo como tabla maestra (ADR-007, segunda entrega). El enumerado artist_fund se queda: esta tabla se une por «code» y aporta el nombre editable, el prefijo de catalog_id como dato de lectura, y los dos interruptores. Sin insert ni delete: un fondo nuevo es una migración, y ninguno se borra.';

comment on column public.artist_funds.code is
  'Valor del enumerado que guardan las columnas del esquema. Legado: no se traduce ni se renombra. Inmutable (ver tg_artist_fund_keys_immutable).';
comment on column public.artist_funds.prefix is
  'Prefijo de catalog_id, impreso en la etiqueta física de la obra. Inmutable.';
comment on column public.artist_funds.active is
  'Si el fondo SE OFRECE al dar de alta y en los selectores. Retirado no es invisible: sus obras se siguen leyendo y su nombre se sigue mostrando.';
comment on column public.artist_funds.hide_artworks is
  'Si sus obras se apartan del listado por omisión. Independiente de «active», y nunca un borrado: la obra sigue siendo legible por su identificador.';

create index artist_funds_active_idx on public.artist_funds (active);

-- The three that exist, with the prefix their identifiers already hold up. The
-- name is the one the application carried written by hand in `ARTIST_LABEL`.
insert into public.artist_funds (code, prefix, name) values
  ('ROTILI', 'AR', 'Alberto Rotili'),
  ('RUIZ_CAMPINS', 'RC', 'María Ruiz Campins'),
  ('TEST', 'TS', 'Pruebas');

-- ── What cannot be touched ──────────────────────────────────
--
-- `code` is what thousands of rows of other tables store and `prefix` is
-- printed on the labels stuck to the artworks. Changing either of the two is not
-- correcting a datum: it is leaving the catalogue saying one thing and the world another.
-- The interface does not offer them, and this is what guarantees it when the interface gets
-- it wrong.
create function public.tg_artist_fund_keys_immutable()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.code is distinct from old.code then
    raise exception 'El código de un fondo no se puede cambiar'
      using hint = 'Es el valor que guardan todas las obras, las series y los documentos de ese fondo.';
  end if;
  if new.prefix is distinct from old.prefix then
    raise exception 'El prefijo de un fondo no se puede cambiar'
      using hint = 'Está impreso en la etiqueta pegada a cada obra de este fondo.';
  end if;
  return new;
end $$;

create trigger artist_fund_keys_immutable
  before update on public.artist_funds
  for each row execute function public.tg_artist_fund_keys_immutable();

-- ── There is always one left to offer ───────────────────────
--
-- With the three withdrawn, registering an artwork would be a screen with an
-- empty selector and no way out of there from the application: to activate one
-- again the table has to be reachable, and to catalogue one has to be able to
-- choose a fund. The last one is refused, and the reason is given.
create function public.tg_artist_fund_keeps_one_active()
returns trigger language plpgsql
set search_path = public as $$
begin
  if old.active and not new.active then
    if (select count(*) from public.artist_funds where active and id <> new.id) = 0 then
      raise exception 'No se puede retirar el último fondo activo'
        using hint = 'Si se retiran todos, no queda ninguno que elegir al dar de alta una obra.';
    end if;
  end if;
  return new;
end $$;

create trigger artist_fund_keeps_one_active
  before update of active on public.artist_funds
  for each row execute function public.tg_artist_fund_keeps_one_active();

-- RF-902: the withdrawal and the restoration are stamped by the base, not by what the
-- client sends. The same trigger as the other master tables.
create trigger artist_funds_row_audit
  before insert or update on public.artist_funds
  for each row execute function public.tg_row_audit();

-- ── Perimeter ───────────────────────────────────────────────
--
-- The platform grants ALL the privileges of a new table to the anonymous
-- and authenticated roles, `delete` included, so first it is revoked and then
-- granted one by one. Here two are granted: reading and correcting. Neither `insert` —a
-- new fund is a migration— nor `delete` —RF-901, and above all: deleting a
-- fund would leave all its artworks with no name.
alter table public.artist_funds enable row level security;
revoke all on public.artist_funds from anon, authenticated;
grant select, update on public.artist_funds to authenticated;

-- And the same with the functions: `create function` leaves them executable by
-- PUBLIC. The two triggers run on their own from the table and nobody calls them
-- by name, so it is taken away from everybody.
revoke all on function public.tg_artist_fund_keys_immutable() from public;
revoke all on function public.tg_artist_fund_keeps_one_active() from public;

-- The whole team reads it, ACTIVE AND WITHDRAWN, which is where this table departs from
-- the other master tables. A withdrawn publication type is cited by almost nobody; the
-- fund is carried by EVERY artwork, so hiding the row from whoever only consults
-- would leave the fund of every artwork the Reader opened with no name. Withdrawn
-- means that it is not offered, not that it is not visible.
create policy artist_funds_select on public.artist_funds
  for select using (public.can_read());

create policy artist_funds_update on public.artist_funds
  for update using (public.can_edit()) with check (public.can_edit());
