-- ============================================================
-- People and institutions (RF-508), and the common traceability base (RF-804).
--
-- It is table 8 of the field schema —«Propietarios/Instituciones»— and the
-- first piece of the documentary catalogue raisonné, which until today did not exist at
-- all: of the model's nine tables, three were built.
--
-- A SINGLE TABLE for people and institutions, and not two, for two reasons. The
-- first is that half the attributes are the same (contact, contact
-- state, locality, country) and splitting them would force querying two tables to
-- compose one provenance line. The second is that a family collection
-- becomes a foundation without stopping being the same link of the chain, and with
-- two tables that change would be deleting one record and creating another: exactly what
-- this project never does.
--
-- And it is a MASTER table with a surrogate key by ADR-006's and ADR-007's criterion applied
-- as is: the Museo de Bellas Artes de Badajoz will appear as owner of
-- some artworks, depositary of others, venue of an exhibition and rights holder
-- of a third. If the name travels copied into each of those places,
-- correcting it —or adding its new name after a merger of institutions— is
-- touching every row. With a key of its own it is an update of one row and the whole
-- catalogue sees it.
--
-- This migration creates the table, its enumerated types and the common traceability
-- function. The RLS policies go in the next migration; what IS done here
-- is enabling RLS and revoking the privileges, because a table that exists for a single
-- deployment with no RLS is a published table. With RLS enabled and no
-- policy, the table is closed to everybody except direct
-- administrative access, which is the safe state to wait in.
-- ============================================================


-- ── Two enumerated types, and why they are not master tables ──
--
-- The criterion that separates an enumerated type from a master table in this schema is whether the
-- CODE looks at the value. `artwork_types` is a master table because the code never
-- looks at it: it renders it. Here it is the other way round in both cases.

-- Person or institution. It does NOT carry «Sin revisar», and it is a conscious exception to
-- RF-205 with the same argument with which RF-203 denies it to `artist`: on
-- opening the record it is already known whether a person or a museum is being written, and on
-- that value depends how the publishable provenance line is composed
-- («Colección privada, España» as against a public institution's
-- credits). A datum the wording depends on cannot be left pending.
--
-- And they are two values that do not grow: it is a closed ontological distinction, not
-- vocabulary the user extends. What HAS been left OUT on purpose is
-- the type of institution (gallery, museum, foundation, archive): that would grow,
-- but nothing asks for it yet and a classification column nobody consults
-- gets filled in badly. When it is needed it will be a master table, not one more value from here.
create type public.party_type_value as enum ('PERSON', 'INSTITUTION');

comment on type public.party_type_value is
  'Persona o institución. Sin «Sin revisar»: de este valor depende cómo se redacta la línea de procedencia (excepción a RF-205, con el argumento de RF-203).';

-- The contact state, just as the v11 field schema enumerates it: not
-- contacted, contacted, information received, visit made, verified. It is
-- the researcher's working datum and its order is a progression, not a
-- classification: that is why it is an enumerated type and not an open list.
create type public.contact_status_value as enum (
  'NOT_CONTACTED',   -- Sin contactar
  'CONTACTED',       -- Contactado
  'INFO_RECEIVED',   -- Info recibida
  'VISITED',         -- Visita realizada
  'VERIFIED'         -- Verificada
);

comment on type public.contact_status_value is
  'Progreso del contacto con una persona o institución (tabla 8 del esquema de campos v11).';


-- ── The traceability, a single time for the whole schema ────
--
-- RF-804 asks that the traceability be a «common base reusable by all the
-- tables with a primary key of their own, not only by Artworks». Until now they were three
-- almost identical functions —`tg_physical_place_authorship`,
-- `tg_artwork_type_authorship`, `tg_series_authorship`— and the documentary catalogue
-- raisonné adds six more tables with exactly the same stamp. Six copies of
-- twenty lines is guaranteed divergence: the day one of them fixes a
-- case, the other five are left behind and nobody finds out.
--
-- The function reads the row as `jsonb`, decides what to touch according to the columns
-- that row HAS, and returns with `jsonb_populate_record`. The patch carries only
-- the columns that change —and not the whole row— so that no other column
-- goes through a round-trip conversion that could alter it: what is not in
-- the patch comes out of `new` just as it went in.
--
-- A deliberate consequence: a table with no `restored_at` works just the same. The
-- places and the vocabulary master tables erase the withdrawal's trace on restoring,
-- because they have nowhere to keep it; the tables with a key of their own and a complete
-- wastebasket (RF-902) stamp the restoration and KEEP the previous withdrawal's
-- trace. The function distinguishes the two cases by the column's presence, so
-- that adopting it in the old tables would not change their behaviour.
--
-- It is not SECURITY DEFINER: it only writes over `new` and reads `auth.uid()`, which already is
-- what the session declares.
create function public.tg_row_audit()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_new   jsonb := to_jsonb(new);
  v_old   jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_now   timestamptz := now();
  v_who   uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    -- Who creates is said by the session, not by the client. Inside a migration
    -- `auth.uid()` is nobody and the column is left null, which is the truth: a
    -- row moved by a migration was created by no person.
    if v_new ? 'created_by' then
      v_patch := v_patch || jsonb_build_object('created_by', v_who);
    end if;
    if v_new ? 'updated_at' then
      v_patch := v_patch || jsonb_build_object('updated_at', v_now);
    end if;
    if v_new ? 'updated_by' then
      v_patch := v_patch || jsonb_build_object('updated_by', v_who);
    end if;
  else
    v_old := to_jsonb(old);

    -- RF-801: any change moves the update date.
    if v_new ? 'updated_at' then
      v_patch := v_patch || jsonb_build_object('updated_at', v_now);
    end if;
    if v_new ? 'updated_by' then
      v_patch := v_patch || jsonb_build_object('updated_by', v_who);
    end if;

    -- RF-902: the withdrawal and the restoration stamp themselves. If they depended on what
    -- the interface sends, the wastebasket's trace would be worth what the clock of the
    -- phone that sent it is worth.
    if v_new ? 'active' then
      if (v_old->>'active')::boolean and not (v_new->>'active')::boolean then
        if v_new ? 'deactivated_at' then
          v_patch := v_patch || jsonb_build_object('deactivated_at', v_now);
        end if;
        if v_new ? 'deactivated_by' then
          v_patch := v_patch || jsonb_build_object('deactivated_by', v_who);
        end if;

      elsif not (v_old->>'active')::boolean and (v_new->>'active')::boolean then
        if v_new ? 'restored_at' then
          -- Complete wastebasket: the last event of each class is kept and the
          -- restoration does NOT erase the previous withdrawal's trace.
          v_patch := v_patch || jsonb_build_object('restored_at', v_now);
          if v_new ? 'restored_by' then
            v_patch := v_patch || jsonb_build_object('restored_by', v_who);
          end if;
        else
          -- With nowhere to keep the restoration, the honest thing is to leave the row
          -- as if it had never been withdrawn, which is what the places
          -- and the vocabulary master tables already do.
          v_patch := v_patch || jsonb_build_object('deactivated_at', null,
                                                   'deactivated_by', null);
        end if;
      end if;
    end if;
  end if;

  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
end $$;

comment on function public.tg_row_audit is
  'Sello común de autoría, fecha de actualización y papelera (RF-804, RF-801, RF-902). Toca solo las columnas que la fila tenga, de modo que una tabla sin fecha de restauración funciona igual.';


-- ── The table ───────────────────────────────────────────────

create table public.parties (
  -- Surrogate key (ADR-007), not the name: renaming an institution has to
  -- be one row and not a data migration, and a museum's name changes.
  id uuid primary key default gen_random_uuid(),

  party_type public.party_type_value not null,

  -- Just as it is written, with its capitals and its accents, as in the tree of
  -- places. What is normalised is the comparison key, not the datum.
  name text not null,

  -- Locality and country loose, and not an address in one text: they are exactly what the
  -- catalogue formula needs separately in order to write «Colección privada,
  -- España» without parsing anything.
  locality text not null default '',
  country text not null default '',

  -- A third party's personal datum, and the most important row of the whole project's RLS
  -- matrix. RF-105 decides explicitly that the Reader sees it —there is no
  -- per-field visibility restriction—, so the only barrier is the
  -- table's policy: a failure here does not corrupt the catalogue, it exposes a
  -- collector's telephone number.
  contact text not null default '',

  contact_status public.contact_status_value not null default 'NOT_CONTACTED',

  note text not null default '',

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 and RF-902: nothing is deleted, and the wastebasket keeps the last withdrawal event
  -- and the last restoration one, not the history of cycles.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- A blank name identifies nobody, and one with spaces around it
  -- would break the duplicate comparison without it being visible on screen.
  constraint parties_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.parties is
  'Personas e instituciones (RF-508): propietarios, depositarios, prestadores, titulares de derechos y la institución detrás de una sede de exposición. Clave sustituta (ADR-007): renombrar es una fila. Nada se borra, se retira.';

comment on column public.parties.contact is
  'Datos de contacto. Es dato personal de un tercero y el Lector lo ve (RF-105): la política de la tabla es su única barrera.';
comment on column public.parties.locality is
  'Localidad, suelta para poder componer «Colección privada, [país]» sin analizar una dirección.';


-- ── One name, one record ────────────────────────────────────
--
-- `place_key` is REUSED instead of writing a twin function with another name.
-- A second copy of the same normalisation rule is exactly the
-- divergence this project chases in everything else: the day one of the
-- two learns to handle the ç, the other will not.
--
-- The accepted cost: two different collectors called the same are
-- disambiguated in the name itself, which is what catalogues do («Juan
-- Pérez (Badajoz)»). In exchange, an artwork's provenance is not split between two
-- rows of the same museum written with and without an accent, which is a mistake that is not seen on
-- writing it and only appears on querying «which artworks have passed through here».
--
-- The index also covers the withdrawn records, as in the other master tables:
-- registering again a name that is in the wastebasket RESTORES it, and for that
-- it has to be findable.
create unique index parties_name_unique
  on public.parties (public.place_key(name));

create index parties_active_idx on public.parties (active);

-- The function's name has become narrow for what it does, and it is corrected
-- with its comment and not by renaming it: `place_key` is in the indexes of the tree
-- of places, in the location selector and mirrored character by character in
-- `app/src/lib/places.ts`. A renaming would cost more than it clarifies.
comment on function public.place_key is
  'Clave de comparación de nombres de todo el esquema: minúsculas y sin tildes, conservando la ñ. Nació para el árbol de lugares (ADR-006) y la usan además las tablas maestras y la de personas e instituciones. Inmutable para poder indexarla.';


-- ── Authorship and wastebasket, stamped by the base ─────────

create trigger party_row_audit
  before insert or update on public.parties
  for each row execute function public.tg_row_audit();


-- ── RLS and privileges ──────────────────────────────────────
--
-- A table with no RLS is open, not closed, and the platform grants by default
-- all the privileges of every new table to the anonymous and authenticated roles,
-- `delete` included (RF-113). It is revoked first and granted afterwards, one by one.
--
-- No DELETE: neither privilege nor policy, ever (RF-901). Withdrawing a record is an
-- update of `active`.
--
-- The POLICIES go in the next migration, and until they exist nobody with a session
-- reads or writes this table: RLS enabled with no policy denies. It is the
-- safe state to be left half way in, and the opposite of the one granting
-- the privileges without enabling RLS would have left.

alter table public.parties enable row level security;

revoke all on public.parties from anon, authenticated;

grant select, insert, update on public.parties to authenticated;

-- Explicit, as in 20260801140000: on this platform a new function is born
-- with EXECUTE for PUBLIC despite the `alter default privileges`, and what catches it is
-- `function_privileges.test.sql`. A trigger function is invoked by nobody from
-- the API, and it fires all the same.
revoke all on function public.tg_row_audit() from public;
