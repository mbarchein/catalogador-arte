-- ============================================================
-- The provenance stops being a field and becomes a chain of dated
-- events (RF-509, RF-510, RF-511, RF-218).
--
-- The v11 field schema merged in v4 `propietario_actual` and
-- `procedencia_historial` into a narrative `procedencia`, and in v10 hung
-- `propietarios_documentados` alongside it as a «structured and filterable version» that
-- explicitly «does not record acquisition dates nor chronological order». That
-- leaves the datum with TWO representations and NEITHER complete: the account cannot
-- be queried and the multiple relation does not know the order nor the dates, which is
-- exactly what a provenance chain is.
--
-- Here the hierarchy is inverted. The chain of events is the RECORD —with its
-- order, in what capacity the artwork was held, how it was acquired and between which years— and the
-- narrative account is the publishable WORDING (RF-510). It is exactly the rule
-- ADR-004 already applies with `date_note` over `execution_date`: the structure
-- feeds the search and the prose rules when printing, because the prose of a
-- catalogue raisonné cannot be generated. And `propietarios_documentados`
-- disappears before getting to exist: the `join` by `party_id` answers «which
-- artworks are linked to this institution?», which was the only thing that
-- justified it.
--
-- Nor is `estatus_legal` created. v11 defines it as a Selection (Donación /
-- Cesión / Depósito / Propiedad familia / Desconocido) and that list mixes two
-- different questions: in what capacity the artwork is held and how it arrived. With the
-- chain, the first is the last link's `capacity` and the second is
-- `acquisition`; a loose field that can contradict the chain it has
-- alongside is superfluous.
--
-- This migration creates the events table and its rules, adds the provenance
-- columns to the artwork, closes the check the `parties` migration
-- left pending —a party that holds up a chain is not withdrawn— and moves to the
-- new model the four nodes of the tree of places that today are ownership
-- disguised as a site.
--
-- The RLS POLICIES of `provenance_events` go in the next migration. What IS
-- done here is enabling RLS and revoking the privileges, because a table that
-- exists for a single deployment with no RLS is a published table. With RLS enabled and
-- no policy, the table is closed to everybody except direct
-- administrative access, which is the safe state to wait in.
-- ============================================================


-- ── Three enumerated types, and why they are not master tables ──
--
-- The schema's criterion is whether the CODE looks at the value. `artwork_types` is
-- a master table because the code never looks at it: it renders it. On these three depends
-- who the current holder is, how the publishable line is worded and whether a
-- documentary block is researched, so looking at them is exactly what has to be
-- done.

-- In what capacity the artwork was held. It is half of v11's `estatus_legal`, the one that
-- answers «as what did they have it?».
create type public.provenance_capacity as enum (
  'OWNER',       -- Propietario
  'DEPOSIT',     -- En depósito
  'LOAN',        -- En préstamo
  'UNKNOWN',     -- Investigado y no consta
  'UNREVIEWED'   -- Sin revisar (RF-205), que no es lo mismo
);

comment on type public.provenance_capacity is
  'En qué calidad tuvo la obra un eslabón de la cadena. «Desconocido» es investigado sin resultado; «Sin revisar» es pendiente (RF-205).';

-- How it came into their hands. It is the other half of `estatus_legal`, and they are two
-- different facts: «Depósito» says in what capacity and «Donación» says how it arrived. An
-- artwork can be on deposit having arrived by donation, and with a single
-- field one had to choose which of the two truths was stored.
create type public.provenance_acquisition as enum (
  'PURCHASE',    -- Compra
  'GIFT',        -- Donación
  'INHERITANCE', -- Herencia
  'COMMISSION',  -- Encargo
  'EXCHANGE',    -- Permuta
  'UNKNOWN',     -- Investigado y no consta
  'UNREVIEWED'   -- Sin revisar
);

comment on type public.provenance_acquisition is
  'Cómo llegó la obra a ese eslabón. Separado de la calidad de tenencia a propósito: una obra en depósito puede haber llegado por donación.';

-- The research state of a documentary block of the record. This group creates it
-- and bibliography, exhibitions and documentation reuse it: it is the same
-- question four times, and four identical enumerated types would diverge.
create type public.research_status as enum (
  'UNREVIEWED',   -- Sin revisar: nadie ha mirado todavía
  'IN_PROGRESS',  -- En curso
  'NONE_FOUND',   -- Investigado y no hay nada que registrar
  'COMPLETE'      -- Investigado y registrado
);

comment on type public.research_status is
  'Estado de investigación de un bloque documental de la obra (RF-218). Distingue el bloque pendiente del investigado sin resultado: una obra sin exposiciones registradas no es una obra que no se expuso.';


-- ── The chain ───────────────────────────────────────────────

create table public.provenance_events (
  -- Surrogate key (ADR-007). There is no label stuck to a link, and
  -- reordering the chain cannot be renumbering identifiers.
  id uuid primary key default gen_random_uuid(),

  -- Same shape as `images`: `on update cascade` because the cataloguing
  -- identifier is text and, although RF-204 declares it immutable, the cascade
  -- costs nothing and prevents an administrative correction from leaving orphan
  -- links. With no `on delete`: nothing is deleted from `artworks` (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  -- The chain's order, 1..n. It is MANUAL and not derived from the dates: half
  -- the links of a catalogue raisonné have no known year, and an order
  -- derived from nulls is not an order. The trigger assigns it on inserting and
  -- `reorder_provenance_events` redoes it, as in the photographs (RF-401).
  position integer not null,

  -- NULL ON PURPOSE. «Colección privada, España» and «colección desconocida» are
  -- legitimate links with no record behind them —v11 itself fixes them as a wording
  -- convention—, and forcing the creation of a phantom party for each one would dirty
  -- the master table with rows with no contact, no country and nothing to consult.
  -- `restrict` is coherent with nobody having DELETE over `parties`: if
  -- one were ever deleted by hand, this warns instead of breaking the chain.
  party_id uuid references public.parties (id) on delete restrict,

  -- How the link is recorded when it has no record, or the precision the record does not
  -- give («propiedad de la tía de X» inside a family collection).
  party_note text not null default '',

  capacity public.provenance_capacity not null default 'UNREVIEWED',
  acquisition public.provenance_acquisition not null default 'UNREVIEWED',

  -- ── The date, with ADR-004's structured shape ─────────────
  -- Five columns are repeated in exchange for inheriting the date parser from the
  -- frontend, the generated column and the tests already written. It is a good trade: the
  -- alternative was a free text that cannot be asked about.
  start_year smallint,
  end_year smallint,
  approximate_date boolean not null default false,
  unconfirmed_date boolean not null default false,
  date_note text not null default '',
  date_text text generated always as (
    case
      when date_note <> '' then date_note
      when start_year is null then ''
      else (case when approximate_date then 'c. ' else '' end)
           || start_year::text
           || coalesce('-' || end_year::text, '')
           || (case when unconfirmed_date then ' [?]' else '' end)
    end
  ) stored,

  -- The datum's source and RF-214's `[?]`: «según catálogo de la exposición de
  -- 1985», «dato facilitado por la familia, sin documentar».
  note text not null default '',

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, which revises RF-903: a link is withdrawn, not deleted. RF-903's
  -- premise —that a bridge row has nothing citable and redoing it is enough— does
  -- not hold here: the link carries years, quality of tenure and the datum's
  -- source, it is research work, and who withdrew it is a trace that matters.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- A link has to say whom it speaks of, with a record or without one. One with
  -- neither of the two things is a gap in the chain that also occupies a
  -- position, and a chain with a gap is a falsified document. The way out is
  -- cheap: `party_note` is free text and «colección desconocida» will do.
  constraint provenance_events_link_has_an_end
    check (party_id is not null or btrim(party_note) <> ''),

  -- The order starts at 1, like the photographs'.
  constraint provenance_events_position_positive check (position >= 1),

  -- A year outside a plausible range is a typo, not a date (ADR-004).
  constraint provenance_events_plausible_years check (
    (start_year is null or start_year between 1000 and 2100)
    and (end_year is null or end_year between 1000 and 2100)
  ),

  -- THE ONLY DIFFERENCE from `artworks_coherent_range`, and it is deliberate: there the
  -- range requires `end_year > start_year` because «1985-1985» is not an execution
  -- range but a badly written loose year, and it is written with `start_year` on
  -- its own. Here it is `>=` because an artwork bought and sold in 1985 is a
  -- real tenure and its two ends are different data.
  constraint provenance_events_coherent_range check (
    end_year is null or (start_year is not null and end_year >= start_year)
  ),

  -- The flags speak about a year: with no year there is nothing to approximate nor to
  -- cast doubt on («[?]» on its own says nothing).
  constraint provenance_events_flags_require_year check (
    start_year is not null or (not approximate_date and not unconfirmed_date)
  )
);

comment on table public.provenance_events is
  'Cadena de procedencia de una obra, un eslabón por fila (RF-509). El orden lo fija la catalogadora y no las fechas. Nada se borra: un eslabón se retira (RF-517).';

comment on column public.provenance_events.position is
  'Orden del eslabón dentro de la cadena, 1..n. Manual: la mitad de los eslabones no tienen año conocido y un orden derivado de nulos no es un orden.';
comment on column public.provenance_events.party_id is
  'Ficha de la persona o institución. Nulo es legítimo: «Colección privada, España» es un eslabón sin ficha detrás.';
comment on column public.provenance_events.date_text is
  'Generada: se compone de los campos estructurados (o de date_note si existe). No se escribe nunca directamente (ADR-004).';

-- The order of an artwork's chain, which is how it is always read.
create index provenance_events_artwork_idx
  on public.provenance_events (catalog_id, position);

-- «Which artworks have passed through this institution?». It was the only reason for being of
-- v11 v10's `propietarios_documentados`, and here it is an index.
create index provenance_events_party_idx
  on public.provenance_events (party_id);


-- ── The order assigns itself, and is redone by hand ─────────

-- A new link goes AT THE END, never in the middle of an order somebody arranged.
-- SECURITY DEFINER like `tg_assign_image_sort_order` and for the same reason: the maximum
-- is computed over the WHOLE chain, including the links the read policy
-- might hide from whoever inserts. A maximum computed over half a table
-- would return a repeated position.
create function public.tg_assign_provenance_position()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.position is null then
    select coalesce(max(e.position), 0) + 1
      into new.position
      from provenance_events e
     where e.catalog_id = new.catalog_id;
  end if;
  return new;
end $$;

comment on function public.tg_assign_provenance_position is
  'Coloca el eslabón nuevo al final de la cadena de su obra (RF-509).';

create trigger assign_provenance_position
  before insert on public.provenance_events
  for each row execute function public.tg_assign_provenance_position();

-- Reordering, all or nothing. Traced from `reorder_images`, which already has its tests, and
-- with no SECURITY DEFINER for the same reason: the policies remain in force, so a
-- Reader does not write here; the explicit check only turns the silent
-- «nothing has changed» into a legible error, and in Spanish because she reads it.
create function public.reorder_provenance_events(p_catalog_id text, p_event_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_active integer;
  v_given integer := coalesce(array_length(p_event_ids, 1), 0);
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para reordenar la procedencia';
  end if;

  -- A repeated identifier would pass the count further below and would leave two
  -- links fighting over a position, so it is rejected first.
  if v_given <> (select count(distinct t.id) from unnest(p_event_ids) as t(id)) then
    raise exception 'La lista de eslabones tiene identificadores repetidos';
  end if;

  -- The list has to be EXACTLY the artwork's active links. An
  -- out-of-date client —somebody added or withdrew a link in the meantime— would otherwise leave
  -- the chain half ordered, and half an ordered chain is worse than a
  -- rejection: it reads as an order and it is not one.
  select count(*) into v_active
    from provenance_events e
   where e.catalog_id = p_catalog_id and e.active;

  if v_active <> v_given then
    raise exception 'La lista de eslabones no coincide con la de la obra %', p_catalog_id;
  end if;

  if exists (
    select 1 from unnest(p_event_ids) as t(id)
    where not exists (
      select 1 from provenance_events e
       where e.id = t.id and e.catalog_id = p_catalog_id and e.active
    )
  ) then
    raise exception 'Algún eslabón no pertenece a la obra %', p_catalog_id;
  end if;

  update provenance_events e
     set position = p.new_position
    from (
      select t.id, t.ordinality::integer as new_position
        from unnest(p_event_ids) with ordinality as t(id, ordinality)
    ) p
   where e.id = p.id
     and e.position is distinct from p.new_position;
end $$;

comment on function public.reorder_provenance_events is
  'Rehace el orden de la cadena de procedencia de una obra, todo o nada (RF-509).';


-- ── Authorship and wastebasket ──────────────────────────────
-- RF-804's generic function, created with `parties`. The table has the four
-- columns of the complete wastebasket, so restoring keeps the previous
-- withdrawal's trace (RF-902).

create trigger provenance_event_row_audit
  before insert or update on public.provenance_events
  for each row execute function public.tg_row_audit();


-- ── What the artwork gains ──────────────────────────────────

alter table public.artworks
  -- RF-510: the publishable account. When it has text, it is what the record prints;
  -- when it is empty, the record composes the line out of the links. The
  -- rule lives in the interface; what the base guarantees is that both
  -- representations exist and neither treads on the other.
  add column provenance text not null default '',

  -- v11 v5's `nota_procedencia`: where the information comes from and what
  -- reliability it has. Separate from the account on purpose, because it is not published.
  add column provenance_note text not null default '',

  -- RF-511: the rights holder is a RELATIONSHIP and not v11's ambiguous
  -- «Texto/Relación», and it may not coincide with whoever possesses the artwork (an artwork on
  -- deposit at an institution, rights reserved to the family).
  add column rights_holder_party_id uuid references public.parties (id) on delete restrict,
  add column rights_holder_note text not null default '',

  -- RF-218. The column that was needed and that v11 does not have at all.
  add column provenance_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.provenance is
  'Relato narrativo publicable de la procedencia (RF-510). Si tiene texto, es lo que se imprime; si está vacío, la ficha compone la línea con los eslabones.';
comment on column public.artworks.provenance_note is
  'Fuente y fiabilidad del dato de procedencia. No se publica.';
comment on column public.artworks.rights_holder_party_id is
  'Titular de los derechos de reproducción (RF-511). Puede no ser quien posee la obra.';
comment on column public.artworks.provenance_status is
  'Estado de investigación de la procedencia (RF-218). «Sin revisar» no es «no hay».';

create index artworks_rights_holder_idx on public.artworks (rights_holder_party_id);


-- ── «Sin revisar» is not «no» (RF-218) ──────────────────────
--
-- Without this rule the column can lie, and a column that can lie about
-- whether something was researched is worse than not having it: the record would say «investigado sin
-- resultado» underneath a list of links.
--
-- It is checked through BOTH doors, because a single one does not close the invariant: neither
-- is «investigado sin resultado» declared on an artwork with active links, nor is a
-- link added or restored on an artwork declared that way. The second costs the user one
-- more update and is the one that makes the assertion hold.
--
-- What IS allowed, and it is intentional: links with the state on «Sin
-- revisar». Having a datum is not having done the research —the eight links
-- this same migration moves are exactly that case—, so the rule
-- is one-way.
--
-- The bibliography, exhibitions and documentation groups REPLACE this
-- function with `create or replace` in order to add their block. The trigger is declared
-- on purpose with no column list so that it does not have to be recreated each time: the
-- check only does work when the state changes to «investigado sin
-- resultado».
--
-- The `if`s are nested and not in a single condition because of a plpgsql detail that
-- bites: in an INSERT trigger the `old` record is not assigned, and an
-- expression naming it fails even if the `and` on the left is already false
-- —the whole expression is prepared as a query with parameters before being
-- evaluated—. `tg_op` is checked in its own `if`.
--
-- And the check is skipped when the state does not change, which is what prevents
-- a row that was already in an impossible state from blocking any edit
-- of the artwork instead of letting it be fixed.
create function public.tg_artwork_research_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.provenance_status <> 'NONE_FOUND' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.provenance_status = new.provenance_status then
      return new;
    end if;
  end if;

  if exists (select 1 from public.provenance_events
              where catalog_id = new.catalog_id and active) then
    raise exception 'No se puede dar la procedencia por investigada sin resultado: la obra % ya tiene eslabones registrados', new.catalog_id
      using hint = 'Retira antes los eslabones, o marca la procedencia como «En curso» o «Completa».';
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218).';

create trigger artwork_research_status_coherent
  before insert or update on public.artworks
  for each row execute function public.tg_artwork_research_status_coherent();

create function public.tg_provenance_event_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select provenance_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'La procedencia de la obra % consta investigada sin resultado y este eslabón la contradice', new.catalog_id
      using hint = 'Cambia antes el estado de la procedencia a «En curso» o «Completa».';
  end if;
  return new;
end $$;

comment on function public.tg_provenance_event_status_coherent is
  'La otra puerta de RF-218: no se añade ni se restaura un eslabón en una obra cuya procedencia consta investigada sin resultado.';

create trigger provenance_event_status_coherent
  before insert or update on public.provenance_events
  for each row execute function public.tg_provenance_event_status_coherent();


-- ── A party that holds up a chain is not withdrawn ──────────
--
-- The check the `parties` migration could not write yet: until
-- now there was nothing to check. It is the same rule as
-- `tg_series_deactivation` and `tg_physical_place_deactivation`, and here the reason
-- is stronger than in those: a provenance chain with a gap is not an
-- incomplete datum, it is a falsified document.
--
-- This REVISES RF-905 as far as the owners are concerned. RF-905 says that a
-- withdrawn owner «leaves the field empty in the artworks that had it
-- assigned»; applied to the provenance, that would be erasing a documented link
-- by the indirect route. In its place the rule of the other master tables governs: first
-- the party is taken out of wherever it is, and then it is withdrawn.
--
-- An artwork in the wastebasket does NOT count, as in the places: it is logically withdrawn,
-- its links are no longer shown (RF-905 downwards), and requiring the
-- wastebasket to be emptied before withdrawing a party would be making the wastebasket get in the way.
--
-- The exhibition venues will add their check here with `create or replace`
-- when they exist.
create function public.tg_party_deactivation()
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
  end if;
  return new;
end $$;

comment on function public.tg_party_deactivation is
  'Impide retirar una persona o institución que aparece en una cadena de procedencia activa o que es titular de derechos (RF-511, revisa RF-905).';

create trigger party_deactivation
  before update of active on public.parties
  for each row execute function public.tg_party_deactivation();


-- ── RLS and privileges ──────────────────────────────────────
--
-- It is revoked first and granted afterwards, one by one: the platform grants by
-- default all the privileges of every new table to the anonymous and
-- authenticated roles, `delete` included (RF-113).
--
-- No DELETE: neither privilege nor policy, ever (RF-901, RF-517). Withdrawing a
-- link is an update of `active`.
--
-- The policies go in the next migration. Until they exist, nobody with a session
-- reads or writes this table: RLS enabled with no policy denies.

alter table public.provenance_events enable row level security;

revoke all on public.provenance_events from anon, authenticated;

grant select, insert, update on public.provenance_events to authenticated;

-- Explicit, as in 20260801140000 and 20260804090000: on this platform a
-- new function is born with EXECUTE for PUBLIC despite the `alter default privileges`,
-- and what catches it is `function_privileges.test.sql`.
revoke all on function public.tg_assign_provenance_position() from public;
revoke all on function public.tg_artwork_research_status_coherent() from public;
revoke all on function public.tg_provenance_event_status_coherent() from public;
revoke all on function public.tg_party_deactivation() from public;

revoke all on function public.reorder_provenance_events(text, uuid[]) from public, anon;
grant execute on function public.reorder_provenance_events(text, uuid[]) to authenticated;


-- ============================================================
-- The move: the tree's four nodes that are ownership, not a site
-- ============================================================
--
-- ADR-006 left it noted that MUBA, MACVA and the private collections «will stop
-- being places and will become rows of that table» when the table existed.
-- It exists now. It is fulfilled HALF WAY AND ON PURPOSE:
--
--   • Their record is created in `parties` and one provenance link per artwork.
--   • The nodes are NOT deleted: a museum where an artwork is on deposit goes on
--     being the correct answer to «where is the artwork?», which is what
--     the tree is for, and the tree already has cities as roots.
--   • What DOES leave the tree is the ownership stuffed inside the name.
--
-- About the tag-on, which is the case that forces a decision: «Colección particular
-- familia Hormeño (propiedad de la tia de Almudena Hormeño)» and «Colección
-- particular familia Hormeño» are SIBLINGS under Castelar n.º 5 and, with the
-- ownership taken out of the name, they are the SAME site —and besides two homonymous siblings, which
-- the tree's uniqueness index does not admit. So trimming the
-- name is not enough: the artwork is moved to the sibling that remains and the node with the tag-on is
-- WITHDRAWN (logical deletion, RF-901, never a delete). The precision that name
-- carried inside is not lost: it travels to the link's `party_note`, which is where
-- it means something.
--
-- The QUALITY of tenure of the eight links is left at «Sin revisar» and not at
-- «Depósito» nor at «Propietario». The tree said where the artwork is, not in what
-- capacity whoever keeps it has it; deducing a legal fact from a site's
-- name is exactly what «Sin revisar no es no» forbids. For the same reason,
-- the `provenance_status` of those eight artworks is left at «Sin revisar»: having a
-- datum is not having researched the provenance.
--
-- If the base does not carry the dump —continuous integration, or a new
-- installation—, none of the four nodes is found and this block does
-- absolutely nothing.

-- The `artworks` audit is switched off while it writes, as in
-- 20260801150000 and 20260803160000: inside a migration `auth.uid()` is
-- nobody, and the trigger would erase the artworks' «actualizado por». And moving an
-- artwork is a phase-1 field (RF-802), so it would also move the date of the
-- last time somebody had it in front, which has not happened.
alter table public.artworks disable trigger artwork_audit_trail;

do $$
declare
  v_map record;
  v_artwork record;
  v_node uuid;
  v_party uuid;
  v_parties int := 0;
  v_events int := 0;
begin
  for v_map in
    select * from (values
      -- tree node as it is written today | record in `parties` | type | locality | country | link's precision
      ('Colección particular familia Hormeño',
       'Colección particular familia Hormeño', 'PERSON', 'Badajoz', 'España', ''),
      ('Colección particular familia Hormeño (propiedad de la tia de Almudena Hormeño)',
       'Colección particular familia Hormeño', 'PERSON', 'Badajoz', 'España',
       'Propiedad de la tía de Almudena Hormeño'),
      ('Museo de Bellas Artes de Badajoz MUBA',
       'Museo de Bellas Artes de Badajoz (MUBA)', 'INSTITUTION', 'Badajoz', 'España', ''),
      ('Museo de arte contemporaneo Vicente Aguilera Cerni MACVA',
       'Museo de Arte Contemporáneo Vicente Aguilera Cerni (MACVA)', 'INSTITUTION',
       'Villafamés', 'España', '')
    ) as t(node_name, party_name, party_type, locality, country, party_note)
  loop
    select id into v_node
      from public.physical_places
     where public.place_key(name) = public.place_key(v_map.node_name);

    continue when v_node is null;

    -- The record is looked up before creating it because the two Hormeño collections
    -- share a party: they are the same family with a different precision.
    --
    -- The record's name is written PROPERLY, with its accents and its acronym in
    -- brackets, and the node's is not copied: the tree was left in lower case and with no
    -- accents by ADR-006's move, and curing three names by hand here is
    -- cheaper than leaving them deformed waiting for an interface pass. The
    -- node keeps its own: they are two different things and each is called what
    -- it should be.
    select id into v_party
      from public.parties
     where public.place_key(name) = public.place_key(v_map.party_name);

    if v_party is null then
      insert into public.parties (party_type, name, locality, country, note)
      values (v_map.party_type::public.party_type_value, v_map.party_name,
              v_map.locality, v_map.country,
              'Ficha creada al sacar la propiedad del árbol de lugares (ADR-006).')
      returning id into v_party;
      v_parties := v_parties + 1;
    end if;

    -- One link per artwork, including those in the wastebasket: their documentary
    -- chain exists just the same and restoring them cannot give them back maimed.
    for v_artwork in
      select catalog_id from public.artworks
       where physical_place_id = v_node order by catalog_id
    loop
      insert into public.provenance_events (catalog_id, party_id, party_note, note)
      values (v_artwork.catalog_id, v_party, v_map.party_note,
              format('Trasladado del árbol de lugares (ADR-006): la obra constaba en «%s».',
                     v_map.node_name));
      v_events := v_events + 1;
    end loop;
  end loop;

  raise notice 'Partes creadas: %. Eslabones de procedencia creados: %.', v_parties, v_events;
end $$;

-- ── The merger of the two Hormeño nodes ─────────────────────
do $$
declare
  v_long uuid;
  v_short uuid;
  v_moved int := 0;
begin
  select id into v_long from public.physical_places
   where public.place_key(name) = public.place_key(
     'Colección particular familia Hormeño (propiedad de la tia de Almudena Hormeño)');
  select id into v_short from public.physical_places
   where public.place_key(name) = public.place_key('Colección particular familia Hormeño');

  if v_long is null then
    raise notice 'Sin nodo con coletilla de propiedad: no hay nada que fusionar.';
    return;
  end if;

  if v_short is null then
    raise exception 'El nodo con coletilla existe y el nodo hermano no: la fusión no tiene destino';
  end if;

  -- Their being siblings is the premise of this whole decision: if the tree has been
  -- reorganised and they no longer are, they are not the same site and merging them would move
  -- artworks between buildings. Better to stop than to guess.
  if (select parent_id from public.physical_places where id = v_long)
     is distinct from
     (select parent_id from public.physical_places where id = v_short) then
    raise exception 'Los dos nodos Hormeño ya no cuelgan del mismo sitio: la fusión no es segura';
  end if;

  update public.artworks set physical_place_id = v_short
   where physical_place_id = v_long;
  get diagnostics v_moved = row_count;

  -- Now the node is empty and the withdrawal trigger lets it be withdrawn. Withdrawing is not
  -- deleting: the row is still there with its withdrawal date (RF-901).
  update public.physical_places set active = false where id = v_long;

  raise notice 'Obras movidas al nodo hermano: %. Nodo con coletilla retirado.', v_moved;
end $$;

-- ── The count, which is what turns this into a migration and not an
--    attempt ─────────────────────────────────────────────────
do $$
declare
  v_events int;
  v_artworks int;
  v_dangling int;
begin
  select count(*) into v_events
    from public.provenance_events
   where note like 'Trasladado del árbol de lugares%';

  -- The artworks left hanging from the three surviving nodes: they are the ones that
  -- had to come out with a link. If one was left without it, the two numbers
  -- disagree and the migration stops instead of leaving half a chain written.
  select count(*) into v_artworks
    from public.artworks a
    join public.physical_places p on p.id = a.physical_place_id
   where public.place_key(p.name) in (
     public.place_key('Colección particular familia Hormeño'),
     public.place_key('Museo de Bellas Artes de Badajoz MUBA'),
     public.place_key('Museo de arte contemporaneo Vicente Aguilera Cerni MACVA')
   );

  if v_events <> v_artworks then
    raise exception 'El traslado ha dejado % eslabones para % obras: algo no ha emparejado',
      v_events, v_artworks;
  end if;

  -- And no artwork with two links from the move, which would be the other way
  -- of the counts adding up while lying.
  if exists (
    select 1 from public.provenance_events
     where note like 'Trasladado del árbol de lugares%'
     group by catalog_id having count(*) > 1
  ) then
    raise exception 'Alguna obra ha salido del traslado con más de un eslabón';
  end if;

  -- And that no ownership be left stuffed inside the name of an active place, which is
  -- half the reason for all this.
  select count(*) into v_dangling
    from public.physical_places
   where active and name ilike '%propiedad de%';

  if v_dangling > 0 then
    raise exception '% lugares activos siguen llevando la propiedad dentro del nombre', v_dangling;
  end if;

  raise notice 'Traslado comprobado: % eslabones para % obras, y ningún lugar activo con propiedad en el nombre.',
    v_events, v_artworks;
end $$;

-- The audit comes back before anybody else can write. If it were ever
-- forgotten, the catalogue would lose the trace with nothing failing: that is why
-- `artwork_physical_place.test.sql` also checks it.
alter table public.artworks enable trigger artwork_audit_trail;
