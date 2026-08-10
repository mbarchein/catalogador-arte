-- ============================================================
-- Exhibitions, their venues and each artwork's participation
-- (RF-512, RF-501, RF-502, RF-503, RF-505, RF-513, RF-517, RF-218).
--
-- They are tables 4 and 5 of the v11 field schema —«Exposiciones» and the bridge
-- «Obra_Exposicion»—, plus the master table of venues that v11 does not have: there the site
-- where a show happened is two loose texts, `lugar` and `institucion`.
--
-- WHY AFTER THE BIBLIOGRAPHY, even though v11 numbers this table as 4 and
-- that one as 6: the arrow points that way. RF-503 decides that an
-- exhibition's catalogue has no table of its own —it is a publication like
-- any other— and that is why `catalogue_reference_id` leaves here and enters
-- `bibliography`. Building in the document's order would have left this
-- migration with a foreign key to a non-existent table.
--
-- What this group changes over v11, and why:
--
--   • The VENUE is a master table with a surrogate key and NOT two texts. With two
--     texts, correcting a museum's name is touching all its exhibitions,
--     which is exactly the problem ADR-006 already solved once for the
--     store's places.
--   • And it is NOT the tree of places. They are two tables and the reason is not one of
--     convenience: `physical_places` answers «where is the artwork today», its nodes
--     are containers with `parent_id`, an anti-cycle rule and the prohibition on
--     withdrawing a place with something inside; a venue answers «where did a
--     show happen in 1985», it is historical —a room that closed in 1988 has to
--     go on existing for ever—, it has its own locality and country and it does not
--     contain anything. Merging them would put «Balda 2» in the venue selector and the
--     Museo del Prado in the store's tree.
--   • The `EXPO-0001` code v11 proposed is NOT created. Unlike
--     `catalog_id`, that code is not printed on anything nor stuck to any object
--     in the world: ADR-007 fixes a surrogate key, and a second identifier with no
--     use is one more column to keep coherent.
--   • The merger v11 did in v7 is UNDONE: `catalogue_number` goes back to being
--     a column separate from the note, with the criterion v11 itself wrote in
--     v9 for NOT merging `paginas` —a structured datum of recurrent use and
--     citable exactly— and with the warning v7 left written of what
--     was lost: «la posibilidad de buscar o filtrar por número de catálogo
--     de exposición». «cat. 12 bis» is cited in the catalogue raisonné's essay.
--     It revises RF-501.
--   • The bridge HAS a wastebasket (RF-517, which revises RF-903), for the same reason as the
--     bibliography's: with the catalogue number inside, RF-903's premise
--     —«they have no physical label nor citable number and it is enough to
--     create them again»— stops holding.
--
-- The RLS POLICIES of the three tables go in the next migration. What IS
-- done here is enabling RLS and revoking the privileges, because a table that
-- exists for a single deployment with no RLS is a published table. With RLS enabled and
-- no policy, the table is closed to everybody except direct
-- administrative access, which is the safe state to wait in.
-- ============================================================


-- ── One enumerated type, and why it is not a master table ───
--
-- The schema's criterion is whether the CODE looks at the value. Here it does look at it: on it
-- depends how the exhibition history's line is worded (a solo show is
-- written with the artist's name implicit, a group one is not) and it is the
-- distinction the catalogue raisonné uses to separate the two blocks. They are two
-- values that do not grow, plus RF-205's «Sin revisar» — which here is appropriate,
-- unlike in `party_type`: on noting an exhibition from a press clipping
-- the title is known and not always whether it was solo or group.
create type public.exhibition_type_value as enum (
  'INDIVIDUAL',  -- Individual
  'COLLECTIVE',  -- Colectiva
  'UNREVIEWED'   -- Sin revisar (RF-205)
);

comment on type public.exhibition_type_value is
  'Individual o colectiva (v11, tabla 4). Con «Sin revisar» (RF-205): de un recorte de prensa se saca el título antes que el carácter de la muestra.';


-- ── The venue: where the show happened (RF-512) ─────────────
--
-- The vocabulary master tables' pattern after ADR-007: surrogate key, the name
-- as an attribute, wastebasket and creation authorship. With no `updated_at`/`updated_by` and no
-- `restored_at`, like `publication_types` and `artwork_types`: it is vocabulary that
-- hangs from the records, not a record with a wastebasket screen of its own (RF-901
-- enumerates the tables that do have one and the venues are not on that list).

create table public.exhibition_venues (
  id uuid primary key default gen_random_uuid(),

  -- Just as it is written, with its capitals and its accents. What is normalised is
  -- the comparison key, not the datum.
  name text not null,

  -- Locality and country loose, and not an address in one text: RF-502 composes
  -- «[año], [fechas], [título], [institución], [lugar]» and it needs the place
  -- separately in order to write it without parsing anything.
  locality text not null default '',
  country text not null default '',

  -- The institution behind it, optional. Optional on purpose: a cultural
  -- centre or a municipal hall are real venues with no institution record
  -- behind them, and forcing one to be created would fill `parties` with rows with no contact and no
  -- provenance. When there is one, the museum's contact is not duplicated.
  -- `restrict` for coherence with the rest of the schema: nobody has DELETE, and if
  -- a party were ever deleted by hand this warns instead of leaving the venue
  -- pointing at nothing.
  party_id uuid references public.parties (id) on delete restrict,

  note text not null default '',

  -- RF-901: nothing is deleted, it is withdrawn.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- A blank venue situates nothing, and one with spaces around it would break the
  -- duplicate comparison without it being visible on screen.
  constraint exhibition_venues_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.exhibition_venues is
  'Sedes de exposición (RF-512), con clave sustituta (ADR-007). NO es el árbol de lugares: aquel contesta dónde está la obra hoy y contiene cosas; esta contesta dónde ocurrió una muestra y es histórica. Nada se borra, se retira.';

comment on column public.exhibition_venues.party_id is
  'Institución que hay detrás de la sede, opcional: una casa de cultura es una sede sin ficha de institución. Cuando la hay, su contacto no se duplica.';
comment on column public.exhibition_venues.locality is
  'Localidad, suelta porque RF-502 la imprime aparte del nombre de la institución.';

-- Name AND locality, not the name alone: there is a «Casa de Cultura» in every
-- village and a «Sala de Exposiciones» in every provincial capital, and with uniqueness by the
-- name on its own the second would be an incomprehensible error. Compared with
-- `place_key`, which is the whole schema's comparison key for names: two
-- venues differing only in an accent are the same venue, and discovering it when
-- there are already two rows costs going through every exhibition.
--
-- The index also covers the withdrawn venues, as in the other master tables:
-- registering again one that is in the wastebasket has to be able to find it.
create unique index exhibition_venues_name_unique
  on public.exhibition_venues (public.place_key(name), public.place_key(locality));

create index exhibition_venues_party_idx on public.exhibition_venues (party_id);
create index exhibition_venues_active_idx on public.exhibition_venues (active);

-- Authorship and wastebasket with RF-804's generic function. With no `restored_at`, the
-- function leaves the row as if it had never been withdrawn, which is what the
-- places and the vocabulary master tables already do.
create trigger exhibition_venue_row_audit
  before insert or update on public.exhibition_venues
  for each row execute function public.tg_row_audit();


-- ── The exhibition ──────────────────────────────────────────

create table public.exhibitions (
  -- Surrogate key (ADR-007). See the header: `EXPO-0001` is not created.
  id uuid primary key default gen_random_uuid(),

  title text not null,

  exhibition_type public.exhibition_type_value not null default 'UNREVIEWED',

  -- The venue, optional, and the note for when it is on record without being identified. Both
  -- together: a clipping saying «expuesta en una galería de Madrid» is a datum,
  -- and forcing the creation of the record of a gallery nobody knows which it is would fill the
  -- venue master table with invented ones.
  venue_id uuid references public.exhibition_venues (id) on delete restrict,
  venue_note text not null default '',

  -- The year is the axis of the exhibition history: RF-502 prints it first and
  -- orders by it. Null while there is neither a year nor dates... which is a case
  -- the check further below does not allow: an exhibition with no date at all cannot
  -- be placed in a chronological history, and placing it at the end «because it is not
  -- known» would be inventing the datum.
  year smallint,

  -- The exact dates, optional. It is the difference from ADR-004's structured
  -- shape, which is used in the artwork and in the provenance links: an
  -- exhibition was not «hacia 1985», it had opening and closing dates that either
  -- are known or are not. What is approximate about an exhibition is its year, and that is what
  -- `year` on its own is for.
  start_date date,
  end_date date,
  date_note text not null default '',

  -- «Sin revisar» is not «no», literally: no catalogue being on record is not the same as there not
  -- having been one. The enumerated type that already exists is reused instead of creating a fourth
  -- identical tri-state.
  catalogue_published public.tri_state not null default 'UNREVIEWED',

  -- RF-503: an exhibition's catalogue has no table of its own, it is a
  -- publication like any other and it lives in `bibliography`.
  catalogue_reference_id uuid references public.bibliography (id) on delete restrict,

  -- v11 v6's `nota_exposicion`: curatorship, context, circumstances of the
  -- show as a whole. Different from the bridge's note, which gathers the
  -- circumstances of ONE artwork inside this exhibition.
  note text not null default '',

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 and RF-902: the exhibition is a record with a name of its own and one of those
  -- the requirement enumerates, so it carries a complete wastebasket: the restoration is
  -- stamped and does NOT erase the previous withdrawal's trace.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- An exhibition with no title cannot be cited in a history. As in the
  -- bibliography, it is NOT also required to be trimmed: here there is no comparison
  -- key a space could break, and a title is pasted from a PDF.
  constraint exhibitions_title_not_blank check (btrim(title) <> ''),

  -- A year outside a plausible range is a typo, not a date (ADR-004).
  constraint exhibitions_plausible_year check (
    year is null or year between 1000 and 2100
  ),

  -- At least one of the two ways of dating. With the trigger further below
  -- filling in the year from the start date, in practice this requires that
  -- every exhibition have a year: it is what makes RF-502's chronological history
  -- orderable whole and not in pieces.
  constraint exhibitions_dated check (
    year is not null or start_date is not null
  ),

  -- A closing earlier than the opening is a typo. And a closing WITH NO opening is
  -- half a date: it is rejected too, with the same all-or-nothing criterion with
  -- which `images` treats the corrected file. An `end_date >= start_date` on its own
  -- would have let it through, because a comparison with null is not false.
  constraint exhibitions_coherent_dates check (
    end_date is null
    or (start_date is not null and end_date >= start_date)
  ),

  -- And the year cannot contradict the start date. Without this, a correction
  -- of the date that forgets the year leaves the exhibition ordered by 1985 and printed
  -- as being from 1986.
  constraint exhibitions_year_matches_start_date check (
    start_date is null or year is null
    or extract(year from start_date)::smallint = year
  ),

  -- RF-503: if there is a catalogue record, then it is on record that there was a catalogue. The
  -- other way round, no: a catalogue may be on record as published and not yet be
  -- registered in the bibliography, which is the normal state while research goes on.
  constraint exhibitions_catalogue_reference_needs_catalogue check (
    catalogue_reference_id is null or catalogue_published = 'YES'
  )
);

comment on table public.exhibitions is
  'Exposiciones en las que ha participado obra del fondo (tabla 4 del esquema de campos v11). Clave sustituta (ADR-007): no se crea el código EXPO-0001, que no está impreso en nada. Nada se borra, se retira.';

comment on column public.exhibitions.year is
  'Año de la muestra, eje del historial cronológico (RF-502). Se rellena solo desde la fecha de inicio cuando esta existe.';
comment on column public.exhibitions.venue_note is
  'La sede que consta sin identificar («una galería de Madrid»). Evita inventar fichas de sede para poder guardar el dato.';
comment on column public.exhibitions.catalogue_published is
  'Si la muestra generó catálogo. «Sin revisar» no es «No»: que no conste catálogo no es que no lo hubiera.';
comment on column public.exhibitions.catalogue_reference_id is
  'Ficha bibliográfica del catálogo de la muestra (RF-503). El catálogo de una exposición no tiene tabla propia.';
comment on column public.exhibitions.note is
  'Nota de la muestra como conjunto (comisariado, contexto). Distinta de la nota de la participación de una obra concreta.';

-- WITHOUT uniqueness over the title, on purpose and for the same reason as in the
-- bibliography: two travelling shows of different years are called the same, and
-- «Alberto Rotili. Antológica» in Badajoz and in Cáceres are two exhibitions. The
-- duplicates are resolved by the team's review (RF-909).

-- The order of RF-502's exhibition history, which is ascending and by date: the
-- start one when it is known, and the 1st of January of the year when it is not. The expression
-- cannot give null —the `exhibitions_dated` check and the year's trigger
-- guarantee it— so the index orders the whole table and not a part.
create index exhibitions_chronology_idx
  on public.exhibitions ((coalesce(start_date, make_date(year::integer, 1, 1))));

create index exhibitions_venue_idx on public.exhibitions (venue_id);
create index exhibitions_catalogue_reference_idx
  on public.exhibitions (catalogue_reference_id);
create index exhibitions_active_idx on public.exhibitions (active);


-- ── The year is deduced from the date, never the other way round ──
--
-- Writing the exact dates and the year as well would be asking twice for the same
-- datum and guaranteeing that one day they will not match. The
-- `exhibitions_year_matches_start_date` check prevents them from contradicting each other; this trigger
-- also spares the interface from having to compute it, which is where that computation gets
-- forgotten.
--
-- The other way round, NO: from a loose year a 1st of January is not invented. The absent exact
-- date is a datum that is not known, and filling it in would be publishing an opening
-- nobody has documented.
create function public.tg_exhibition_year_from_dates()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.year is null and new.start_date is not null then
    new.year := extract(year from new.start_date)::smallint;
  end if;
  return new;
end $$;

comment on function public.tg_exhibition_year_from_dates is
  'Rellena el año de la exposición desde su fecha de inicio cuando falta (RF-502). Nunca al revés: de un año no se inventa un día.';

create trigger exhibition_year_from_dates
  before insert or update on public.exhibitions
  for each row execute function public.tg_exhibition_year_from_dates();


-- ── Autoría y papelera ──────────────────────────────────────

create trigger exhibition_row_audit
  before insert or update on public.exhibitions
  for each row execute function public.tg_row_audit();


-- ── A venue that holds up a show is not withdrawn ───────────
--
-- Same rule as `tg_publication_type_deactivation`, `tg_series_deactivation` and
-- `tg_physical_place_deactivation`: withdrawing the venue does not withdraw it, it leaves the
-- exhibition history pointing at something the interface no longer offers. An
-- exhibition in the wastebasket does not count, as in the others: requiring the
-- wastebasket to be emptied before withdrawing a venue would be making the wastebasket get in the way.
create function public.tg_exhibition_venue_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.exhibitions
                  where venue_id = new.id and active) then
    raise exception 'No se puede retirar una sede que todavía acoge exposiciones del catálogo'
      using hint = 'Cambia antes la sede de esas exposiciones.';
  end if;
  return new;
end $$;

comment on function public.tg_exhibition_venue_deactivation is
  'Impide retirar una sede que todavía acoge exposiciones activas (RF-512).';

create trigger exhibition_venue_deactivation
  before update of active on public.exhibition_venues
  for each row execute function public.tg_exhibition_venue_deactivation();


-- ── And nor is a party that is behind a venue ───────────────
--
-- The check the provenance's migration left announced in writing
-- («the exhibition venues will add their check here with `create or
-- replace` when they exist») and which without this group would be left half done: today the
-- Museo de Bellas Artes de Badajoz could be withdrawn while having a venue that
-- points at it, and the venue would be left with the contact hanging from a record the
-- interface no longer offers.
--
-- `create or replace` replaces the whole definition, so the two previous
-- blocks —provenance link and rights holder— are repeated here
-- literally. A replacement that eats them would break nothing visible, and that is why
-- the test checks all three.
--
-- `set search_path = public` is repeated for the same reason: `create or replace`
-- also replaces the function's configuration.
create or replace function public.tg_party_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (
      select 1
        from public.provenance_events e
        join public.artworks a on a.catalog_id = e.catalog_id
       where e.party_id = new.id and e.active and a.active
    ) then
      raise exception 'No se puede retirar una parte que sostiene un eslabón de procedencia'
        using hint = 'Quita antes esa parte de las cadenas de procedencia donde aparece.';
    end if;

    if exists (
      select 1 from public.artworks
       where rights_holder_party_id = new.id and active
    ) then
      raise exception 'No se puede retirar una parte que es titular de derechos de una obra'
        using hint = 'Cambia antes el titular de derechos de esas obras.';
    end if;

    if exists (
      select 1 from public.exhibition_venues
       where party_id = new.id and active
    ) then
      raise exception 'No se puede retirar una parte que es la institución de una sede de exposición'
        using hint = 'Retira antes esa sede, o quítale la institución.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_party_deactivation is
  'Impide retirar una persona o institución que aparece en una cadena de procedencia activa, que es titular de derechos o que está detrás de una sede de exposición activa (RF-511, RF-512, revisa RF-905).';


-- ── An artwork's participation in the show (RF-501) ─────────
--
-- v11's bridge table 5. It records the FACT that a particular artwork took part
-- in a particular exhibition, regardless of whether there was a catalogue.

create table public.artwork_exhibitions (
  id uuid primary key default gen_random_uuid(),

  -- Same shape as `images`, `provenance_events` and `artwork_bibliography`: `on
  -- update cascade` because the cataloguing identifier is text, and with no `on
  -- delete` because nothing is deleted from `artworks` (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  exhibition_id uuid not null references public.exhibitions (id) on delete restrict,

  -- TWO COLUMNS, undoing v11 v7's merger. The number with which the artwork
  -- appeared in the catalogue or on the labels is a structured datum of recurrent
  -- use and citable exactly —«cat. 12 bis» is cited in the catalogue raisonné's
  -- essay and it is searched—, and the note is prose: a loan by a third party,
  -- state at the time of the show, differences from the current record. v7
  -- itself left written what was lost on merging them, and v9 fixed the criterion
  -- so as not to repeat it with `paginas`. It is text and not a number because «12 bis»,
  -- «s/n» and «II.4» are real catalogue numbers.
  catalogue_number text not null default '',
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, which REVISES RF-903, just as in the bibliography's bridge: with the
  -- catalogue number inside, the requirement's premise —«they have no physical
  -- label nor citable number and it is enough to create them again»— stops holding.
  -- The row carries research work and who withdrew it is a trace that
  -- matters. And there is a perimeter reason besides the documentary one:
  -- `rls_default_deny` throws an exception on any DELETE policy in
  -- `public`, so the real deletion would require weakening the guardrail that has
  -- caught real mistakes.
  --
  -- With no `restored_at`: this row is restored from the record it hangs from and
  -- not from a wastebasket screen, so adding it again leaves it as if
  -- it had never been withdrawn.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- An artwork exhibited twice in the same show is one participation with two
  -- numbers inside, not two rows. The constraint also covers the withdrawn ones,
  -- which is what allows adding again to restore instead of duplicating (see
  -- `exhibit_artwork`).
  constraint artwork_exhibitions_unique unique (catalog_id, exhibition_id)
);

comment on table public.artwork_exhibitions is
  'Participación de una obra en una exposición (tabla puente 5 del esquema de campos v11, RF-501). Nada se borra: una participación se retira (RF-517, revisa RF-903).';

comment on column public.artwork_exhibitions.catalogue_number is
  'Número con el que la obra apareció en el catálogo o las cartelas de esa muestra («12 bis», «s/n»). Columna aparte de la nota: deshace la fusión de v11 v7 con el criterio de v9 (RF-513).';
comment on column public.artwork_exhibitions.note is
  'Circunstancias de ESTA participación: préstamo por un tercero, estado en el momento, diferencias con la ficha actual.';

-- The exhibition record's «Obras participantes» block (RF-505) is read from
-- this side; the artwork record's exhibition history uses the unique index,
-- which already starts with `catalog_id`.
create index artwork_exhibitions_exhibition_idx
  on public.artwork_exhibitions (exhibition_id);

create trigger artwork_exhibition_row_audit
  before insert or update on public.artwork_exhibitions
  for each row execute function public.tg_row_audit();


-- ── Adding a withdrawn participation RESTORES it ────────────
--
-- Same case and same solution as `cite_artwork`: with the uniqueness also covering
-- the withdrawn participations, an `insert` of a pair that is in
-- the wastebasket clashes against the index, and the interface would turn an «Añadir» into
-- an incomprehensible uniqueness violation.
--
-- A function and not a `before insert` trigger returning `null`: a trigger like that
-- leaves the `insert` with no affected rows and whoever calls from the API asking for the
-- created row will receive none. The function always returns the row.
--
-- With no SECURITY DEFINER: the policies remain in force and a Reader does not write
-- here. The explicit check only turns the silent «nothing has
-- changed» into a legible error, and in Spanish because she reads it.
create function public.exhibit_artwork(
  p_catalog_id text,
  p_exhibition_id uuid,
  p_catalogue_number text default '',
  p_note text default ''
)
returns public.artwork_exhibitions
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_exhibitions;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir una obra a una exposición';
  end if;

  insert into public.artwork_exhibitions
         (catalog_id, exhibition_id, catalogue_number, note)
  values (p_catalog_id, p_exhibition_id,
          coalesce(p_catalogue_number, ''), coalesce(p_note, ''))
  on conflict (catalog_id, exhibition_id) do update
     set active = true,
         -- What is not sent is not deleted: adding a participation that already
         -- existed cannot empty the catalogue number somebody
         -- researched, because the «Añadir» form comes in blank.
         -- Changing it to empty is editing the participation, which is another operation.
         catalogue_number = case when btrim(excluded.catalogue_number) <> ''
                                 then excluded.catalogue_number
                                 else artwork_exhibitions.catalogue_number end,
         note             = case when btrim(excluded.note) <> ''
                                 then excluded.note
                                 else artwork_exhibitions.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.exhibit_artwork is
  'Añade la participación de una obra en una exposición, o RESTAURA la que estuviera retirada en vez de chocar contra la unicidad (RF-501, RF-517).';


-- ── What the artwork gains (RF-218) ─────────────────────────

alter table public.artworks
  add column exhibition_history_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.exhibition_history_status is
  'Estado de investigación del historial expositivo de la obra (RF-218). Es el caso que da nombre a la regla: una obra sin participaciones registradas no es una obra que no se expuso.';


-- ── «Sin revisar» is not «no», in exhibitions too ───────────
--
-- Third replacement of the same function: the provenance created it, the bibliography
-- added its block and this one adds its own. All three are checked in the
-- test, because a `create or replace` can eat a previous block with
-- nothing warning — the migration that wrote it was applied a while ago and its test passes
-- just the same, because it checks the function that is there and not the one that was.
--
-- It is checked through BOTH doors, as in the two previous groups: neither is
-- «investigado sin resultado» declared on an artwork with active participations,
-- nor is a participation added or restored on an artwork declared that way.
--
-- `set search_path = public` is repeated because `create or replace` replaces the
-- whole definition and with it its configuration.
--
-- The `if`s that look at `old` go inside their own `if tg_op = 'UPDATE'` because of the
-- plpgsql detail the previous versions document: in an INSERT
-- trigger the `old` record is not assigned, and an expression naming it fails
-- even if the `and` on the left is already false.
create or replace function public.tg_artwork_research_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
declare
  -- On a creation everything is a change. On an edit, only what changes is
  -- checked: this way a row that was already in an impossible state can be
  -- fixed instead of blocking any other edit of the artwork.
  v_provenance_changed boolean := true;
  v_bibliography_changed boolean := true;
  v_exhibition_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      old.provenance_status is distinct from new.provenance_status;
    v_bibliography_changed :=
      old.bibliography_status is distinct from new.bibliography_status;
    v_exhibition_changed :=
      old.exhibition_history_status is distinct from new.exhibition_history_status;
  end if;

  if new.provenance_status = 'NONE_FOUND' and v_provenance_changed then
    if exists (select 1 from public.provenance_events
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar la procedencia por investigada sin resultado: la obra % ya tiene eslabones registrados', new.catalog_id
        using hint = 'Retira antes los eslabones, o marca la procedencia como «En curso» o «Completa».';
    end if;
  end if;

  if new.bibliography_status = 'NONE_FOUND' and v_bibliography_changed then
    if exists (select 1 from public.artwork_bibliography
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar la bibliografía por investigada sin resultado: la obra % ya tiene citas registradas', new.catalog_id
        using hint = 'Retira antes las citas, o marca la bibliografía como «En curso» o «Completa».';
    end if;
  end if;

  if new.exhibition_history_status = 'NONE_FOUND' and v_exhibition_changed then
    if exists (select 1 from public.artwork_exhibitions
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar el historial expositivo por investigado sin resultado: la obra % ya tiene participaciones registradas', new.catalog_id
        using hint = 'Retira antes las participaciones, o marca el historial como «En curso» o «Completo».';
    end if;
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218). Cubre procedencia, bibliografía e historial expositivo; el grupo de documentación añadirá el suyo.';

-- La otra puerta. Lo que SÍ se permite, y es intencionado: participaciones en
-- una obra cuyo estado sigue en «Sin revisar». Tener un dato no es haber hecho
-- la investigación, así que la regla es de un solo sentido.
create function public.tg_artwork_exhibition_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select exhibition_history_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'El historial expositivo de la obra % consta investigado sin resultado y esta participación lo contradice', new.catalog_id
      using hint = 'Cambia antes el estado del historial expositivo a «En curso» o «Completo».';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_exhibition_status_coherent is
  'La otra puerta de RF-218: no se añade ni se restaura una participación en una obra cuyo historial expositivo consta investigado sin resultado.';

create trigger artwork_exhibition_status_coherent
  before insert or update on public.artwork_exhibitions
  for each row execute function public.tg_artwork_exhibition_status_coherent();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE en ninguna de las tres: ni privilegio ni política, nunca (RF-901,
-- RF-517). Retirar una participación es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, estas tablas
-- no las lee ni las escribe nadie con sesión: RLS activado sin política niega.

alter table public.exhibition_venues enable row level security;
alter table public.exhibitions enable row level security;
alter table public.artwork_exhibitions enable row level security;

revoke all on public.exhibition_venues from anon, authenticated;
revoke all on public.exhibitions from anon, authenticated;
revoke all on public.artwork_exhibitions from anon, authenticated;

grant select, insert, update on public.exhibition_venues to authenticated;
grant select, insert, update on public.exhibitions to authenticated;
grant select, insert, update on public.artwork_exhibitions to authenticated;

-- Explícito, como en 20260801140000 y en los tres grupos anteriores: en esta
-- plataforma una función nueva nace con EXECUTE para PUBLIC pese al `alter
-- default privileges`, y quien lo caza es `function_privileges.test.sql`.
revoke all on function public.tg_exhibition_year_from_dates() from public;
revoke all on function public.tg_exhibition_venue_deactivation() from public;
revoke all on function public.tg_artwork_exhibition_status_coherent() from public;
-- `create or replace` conserva los privilegios de la función anterior, pero se
-- repite para que la migración no dependa de ese detalle.
revoke all on function public.tg_artwork_research_status_coherent() from public;
revoke all on function public.tg_party_deactivation() from public;

revoke all on function public.exhibit_artwork(text, uuid, text, text) from public, anon;
grant execute on function public.exhibit_artwork(text, uuid, text, text) to authenticated;
