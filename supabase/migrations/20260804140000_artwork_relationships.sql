-- ============================================================
-- Artworks related to each other, with the type of relationship as a datum
-- (RF-217, which extends RF-212; RF-216, RF-517, RF-901, RF-902).
--
-- v11 left `obras_relacionadas` as a «multiple, self-referential relation»
-- inside the artwork record, and in v4 it took the trouble to clarify that it is not a text
-- field. What it does not have is the DATUM that makes the relationship useful: what class
-- it is. «AR-0012 relacionada con AR-0013» does not say whether they are the two halves of a
-- diptych, the preliminary study and the final work, or the front and the back of
-- the same panel catalogued separately — and those three things read differently in the
-- record and are cited differently in the catalogue raisonné.
--
-- This group does not invent it: v11's own «Notas de implementación»
-- anticipate the case in writing, when they say that the bridge-table pattern
-- «puede reutilizarse en el futuro si aparecen casos similares (por ejemplo, si
-- `obras_relacionadas` necesitara en algún momento especificar el *tipo* de
-- relación entre cada par de obras)». They appeared: a pair, a polyptych, a preliminary
-- study, a version, a reverse catalogued separately and a copy of a destroyed work.
--
-- WHY THE TYPE IS A MASTER TABLE AND NOT AN ENUMERATED TYPE. The criterion this
-- schema uses to separate the two things is whether the code looks at the value:
-- `artwork_types` is a master table because it never looks at it, `party_type` is an enumerated type
-- because on it depends how a line is worded. Here the list is open by
-- nature —research discovers relationships nobody foresaw—, but the
-- strong reason is another: each type carries DATA that does not fit in an enumerated type.
-- «Estudio previo de» is asymmetric and its inverse is «Obra final de»; «Pareja
-- de» is symmetric and has no inverse. That pair of labels and the symmetry
-- flag are what allow artwork B's record to say «obra final de
-- AR-0012» without anybody having written a second row. An enumerated type cannot
-- carry its inverse.
--
-- WHAT IS NOT CREATED: `related_artworks_status`. The four research-state
-- columns (RF-218) cover blocks that are researched AS A BLOCK —one goes
-- to the archive to look for exhibitions and comes back with whatever there is—, and a relationship
-- between artworks is not researched: it appears while cataloguing the piece next door.
-- Declaring «this artwork has no relationships» would be declaring something no
-- search ever closes, and a column that cannot get to be true is worse
-- than not having it.
--
-- The RLS POLICIES of the two tables go in the next migration. What IS
-- done here is enabling RLS and revoking the privileges, because a table that
-- exists for a single deployment with no RLS is a published table. With RLS enabled and
-- no policy, the table is closed to everybody except direct
-- administrative access, which is the safe state to wait in.
-- ============================================================


-- ── The vocabulary of relationship types (RF-217) ───────────
--
-- `artwork_types`'s pattern after ADR-007 and `publication_types`': surrogate
-- key, the name as an attribute unique by comparison key, wastebasket and
-- authorship with `tg_row_audit`. What is particular to this master table are the two columns
-- that make it something more than a list of labels.

create table public.artwork_relationship_types (
  id uuid primary key default gen_random_uuid(),

  -- The DIRECT label, the one read from the artwork the arrow comes out of:
  -- «Estudio previo de». Just as it is written, with its capitals and its accents;
  -- what is normalised is the comparison key, not the datum.
  name text not null,

  -- The label the artwork at the other end sees: «Obra final de». It is the column
  -- that avoids the second row. Without it, recording that AR-0012 is a preliminary study
  -- of AR-0013 would force writing the opposite relationship by hand so that
  -- AR-0013's record said something, and that pair of rows can diverge: one is edited,
  -- the other is withdrawn, and the catalogue contradicts itself.
  --
  -- Empty in the symmetric relationships, where both records say the same thing.
  inverse_name text not null default '',

  -- Symmetric means that the relationship has no direction: if A is the pair of
  -- B, B is the pair of A, and it is ONE fact and not two. On this flag depend the
  -- row's canonicalisation and the check for the opposite one, further below.
  --
  -- It is called `is_symmetric` and not `symmetric` because `symmetric` is a RESERVED
  -- word in SQL —the one from `between symmetric`— and a column like that can only
  -- be named in quotes for ever, in the schema, in the queries and
  -- in the client. The prefix is uglier than the alternative and a good deal less
  -- fragile.
  is_symmetric boolean not null default false,

  -- RF-901: nothing is deleted, it is withdrawn. With no `restored_at`, as in the other
  -- vocabulary master tables: restoring leaves the row as if it had never been
  -- withdrawn, and `tg_row_audit` distinguishes that case by the column's absence.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- A blank type says nothing, and one with spaces around it would break the
  -- duplicate comparison without it being visible on screen.
  constraint artwork_relationship_types_name_not_blank
    check (btrim(name) <> '' and name = btrim(name)),

  constraint artwork_relationship_types_inverse_name_trimmed
    check (inverse_name = btrim(inverse_name)),

  -- The coherence that holds up everything else, and that is why it is a constraint and not
  -- a convention:
  --
  --   • A SYMMETRIC relationship has no inverse. If it had one, there would be two
  --     labels for the same fact and the record would choose one at random depending on which
  --     side it is looked at from.
  --   • An ASYMMETRIC relationship has to have one, and different from the direct
  --     name. With no inverse, the other artwork's record is left with nothing to
  --     write; with the inverse equal to the name, the type is symmetric badly
  --     declared and the canonicalisation would not be applied.
  constraint artwork_relationship_types_inverse_coherent check (
    (is_symmetric and inverse_name = '')
    or (not is_symmetric and inverse_name <> '' and inverse_name <> name)
  )
);

comment on table public.artwork_relationship_types is
  'Vocabulario abierto de tipos de relación entre obras (RF-217), con clave sustituta (ADR-007): renombrar es una fila. Cada tipo lleva su etiqueta inversa y su simetría, que es lo que un enumerado no puede llevar.';

comment on column public.artwork_relationship_types.inverse_name is
  'Etiqueta que ve la obra del otro extremo («Obra final de»). Vacía en las simétricas. Es lo que permite que la ficha contraria diga algo sin una segunda fila que pueda divergir.';
comment on column public.artwork_relationship_types.is_symmetric is
  'La relación no tiene dirección: A pareja de B es UN hecho, no dos. De aquí dependen la canonicalización de la fila y el rechazo de la contraria.';

-- Uniqueness by comparison key and not by the literal name, as in the
-- rest of the schema: «Estudio previo de» and «estudio previo de» are the same
-- type. The index also covers the withdrawn types, because registering again
-- one that is in the wastebasket has to be able to find it.
--
-- Cross uniqueness between `name` and `inverse_name` is NOT imposed. It would be possible and
-- it has been discarded: registering «Obra final de» as a direct type would be
-- redundant, but it corrupts nothing —the record would show two ways of saying the same
-- thing— and the rule is one of those that are explained worse than they are worth. The
-- vocabulary duplicates are resolved by review (RF-909).
create unique index artwork_relationship_types_name_unique
  on public.artwork_relationship_types (public.place_key(name));

create index artwork_relationship_types_active_idx
  on public.artwork_relationship_types (active);

create trigger artwork_relationship_type_row_audit
  before insert or update on public.artwork_relationship_types
  for each row execute function public.tg_row_audit();

-- The seeding: the six cases the catalogue already has in front of it. An empty master table
-- leaves the selector blank and forces inventing the vocabulary while
-- cataloguing, which is how one ends up with «Pareja» and «Pareja de» in the same
-- list. Extending it requires no migration: that is the whole reason it is a
-- master table.
--
-- «Versión de» goes as symmetric because between two versions of the same
-- composition there is not one that is the version of the other: they are versions of one
-- another. When one clearly precedes the other, what is recorded is
-- «Estudio previo de», which does have a direction.
--
-- `created_by` is left null on purpose: inside a migration `auth.uid()` is
-- nobody, and these rows were created by no person.
insert into public.artwork_relationship_types (name, inverse_name, is_symmetric) values
  ('Pareja de',                     '',              true),
  ('Parte del mismo políptico que', '',              true),
  ('Versión de',                    '',              true),
  ('Estudio previo de',             'Obra final de', false),
  ('Reverso de',                    'Anverso de',    false),
  ('Copia de',                      'Original de',   false);


-- ── What cannot be done with a type in use ──────────────────

-- A type that still relates artworks is not withdrawn, with the same rule as
-- `tg_artwork_type_deactivation`, `tg_series_deactivation` and
-- `tg_publication_type_deactivation`: withdrawing it does not withdraw it, it leaves the catalogue
-- pointing at something the interface no longer offers. A relationship in the wastebasket does not
-- count, as in the others.
create function public.tg_artwork_relationship_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.artwork_relationships
                  where relationship_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de relación que todavía usan obras relacionadas del catálogo'
      using hint = 'Cambia antes el tipo de esas relaciones.';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_relationship_type_deactivation is
  'Impide retirar un tipo de relación que todavía relaciona obras activas (RF-217).';

-- And a type's symmetry is not changed once it already has relationships stored.
--
-- It is not a rule of purism: the rows of a symmetric type are
-- CANONICALISED —the lesser identifier always goes at the outgoing end—, and
-- those of an asymmetric one are not. Changing the flag would leave rows stored with one
-- convention and new rows with another, so that the same pair of artworks
-- could go in twice without the uniqueness noticing. It is the silent failure
-- this whole group is written to avoid, and it can only be avoided here:
-- once both rows are stored, there is no longer any way of knowing which one is superfluous.
--
-- The WITHDRAWN relationships are looked at too, unlike in the rule
-- above: a relationship in the wastebasket can be restored, and it would restore a row
-- written with the old convention.
create function public.tg_artwork_relationship_type_symmetry_locked()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.is_symmetric is distinct from old.is_symmetric
     and exists (select 1 from public.artwork_relationships
                  where relationship_type_id = new.id) then
    raise exception 'No se puede cambiar la simetría de un tipo de relación que ya se ha usado'
      using hint = 'Crea un tipo nuevo con la simetría que necesitas y cambia esas relaciones al tipo nuevo.';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_relationship_type_symmetry_locked is
  'La simetría de un tipo no cambia una vez usado: las filas simétricas están canonicalizadas y las asimétricas no, y mezclar las dos convenciones deja pasar la misma pareja dos veces (RF-217).';

create trigger artwork_relationship_type_deactivation
  before update of active on public.artwork_relationship_types
  for each row execute function public.tg_artwork_relationship_type_deactivation();

create trigger artwork_relationship_type_symmetry_locked
  before update of is_symmetric on public.artwork_relationship_types
  for each row execute function public.tg_artwork_relationship_type_symmetry_locked();


-- ── The relationship between two artworks ───────────────────

create table public.artwork_relationships (
  id uuid primary key default gen_random_uuid(),

  -- Same shape as `images`, `provenance_events` and the three previous
  -- bridges: `on update cascade` because the cataloguing identifier is
  -- text, and with no `on delete` because nothing is deleted from `artworks` (RF-901).
  --
  -- The two ends are the same in name and in type on purpose: in a
  -- symmetric relationship there is no origin and no destination, and in an asymmetric one the direction
  -- is set by the type and not by the column.
  from_catalog_id text not null references public.artworks (catalog_id) on update cascade,
  to_catalog_id   text not null references public.artworks (catalog_id) on update cascade,

  relationship_type_id uuid not null
    references public.artwork_relationship_types (id) on delete restrict,

  -- The circumstance of this particular relationship: «el reverso se separó del
  -- soporte en la restauración de 1998», «la pareja se subastó por separado».
  note text not null default '',

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, which revises RF-903: nothing is deleted, here either. With no `restored_at`,
  -- as in the three previous bridges: this row has no wastebasket screen
  -- of its own, it is restored from the record of the artwork it hangs from, and adding it
  -- again leaves it as if it had never been withdrawn.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- An artwork is not a preliminary study of itself. It is the class of row produced
  -- by a selector with the current artwork inside, and which afterwards paints in the record a
  -- link to the record itself.
  constraint artwork_relationships_two_artworks
    check (from_catalog_id <> to_catalog_id),

  -- The same relationship between the same two artworks is one fact, not two. The
  -- constraint also covers the withdrawn relationships, which is what allows
  -- adding one again to restore instead of duplicating (see `relate_artworks`).
  --
  -- Two different types between the same two artworks DO coexist: the front and the
  -- back of a panel can also be part of the same polyptych.
  constraint artwork_relationships_unique
    unique (from_catalog_id, to_catalog_id, relationship_type_id)
);

comment on table public.artwork_relationships is
  'Relación tipada entre dos obras catalogadas (RF-217, extiende RF-212). Las simétricas se guardan una sola vez, canonicalizadas. Nada se borra: una relación se retira (RF-517).';

comment on column public.artwork_relationships.from_catalog_id is
  'Extremo de salida. En un tipo simétrico es siempre el identificador menor, puesto ahí por el trigger de canonicalización: la pareja se guarda una sola vez.';

-- The record is consulted from both sides —«which artworks are related to this one»
-- does not distinguish which end the arrow came out of—, so both
-- indexes are needed. The outgoing one is served by the unique index, which already starts with
-- `from_catalog_id`.
create index artwork_relationships_to_idx
  on public.artwork_relationships (to_catalog_id);
create index artwork_relationships_type_idx
  on public.artwork_relationships (relationship_type_id);


-- ── A symmetric relationship is stored ONCE ─────────────────
--
-- «AR-0003 pareja de AR-0007» and «AR-0007 pareja de AR-0003» are the same fact.
-- Without canonicalising, the uniqueness does not see them as equal and both rows go in: two
-- notes that can say different things, two withdrawals that have to be remembered,
-- and the record showing the pair twice. It is always stored with the
-- lesser identifier at the outgoing end, so that the second write
-- clashes against the uniqueness constraint and `relate_artworks` resolves it.
--
-- The comparison goes with `collate "C"`, byte by byte, and not with the base's: the
-- identifiers are ASCII and any collation gives the same order today, but if
-- the base's changed at some point, the stored rows would be left
-- canonicalised with one criterion and the new ones with another — and then the same
-- pair would go in twice. The criterion has to be the same for ever.
create function public.tg_canonicalize_artwork_relationship()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_symmetric boolean;
  v_swap text;
begin
  select is_symmetric into v_symmetric
    from public.artwork_relationship_types
   where id = new.relationship_type_id;

  -- The type does not yet exist in the eyes of this check: the foreign keys are
  -- verified AFTER the `before` triggers, so here no error of our own is invented
  -- and the foreign key is left to speak, which will say the same thing better.
  if v_symmetric is null then
    return new;
  end if;

  if v_symmetric and new.from_catalog_id collate "C" > new.to_catalog_id collate "C" then
    v_swap := new.from_catalog_id;
    new.from_catalog_id := new.to_catalog_id;
    new.to_catalog_id := v_swap;
  end if;

  return new;
end $$;

comment on function public.tg_canonicalize_artwork_relationship is
  'Una relación simétrica se guarda con el identificador menor en el extremo de salida (RF-217): así «A pareja de B» y «B pareja de A» son la misma fila y no dos que pueden divergir.';


-- ── And an asymmetric one does not admit its opposite ───────
--
-- If it is already on record that A is a preliminary study of B, B being a preliminary study of A is not
-- one more datum: it is a documentary contradiction, and one of those that are not seen on
-- writing them because each one is registered from its own artwork's record. B's
-- record already says «obra final de A» without anybody writing anything, which is exactly
-- what `inverse_name` exists for.
--
-- It is checked on RESTORING a withdrawn relationship too, which is the route
-- by which the contradiction would really come in: the opposite one was written while
-- this one was in the wastebasket.
create function public.tg_artwork_relationship_not_reversed()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_type public.artwork_relationship_types%rowtype;
begin
  if not new.active then
    return new;
  end if;

  select * into v_type
    from public.artwork_relationship_types
   where id = new.relationship_type_id;

  -- As above: if the type is not visible, the foreign key speaks.
  if v_type.id is null or v_type.is_symmetric then
    return new;
  end if;

  if exists (select 1 from public.artwork_relationships
              where from_catalog_id = new.to_catalog_id
                and to_catalog_id = new.from_catalog_id
                and relationship_type_id = new.relationship_type_id
                and active) then
    raise exception 'Ya consta que % es «% %», y lo contrario no puede ser cierto a la vez',
      new.to_catalog_id, v_type.name, new.from_catalog_id
      using hint = format('La ficha de %s ya muestra «%s %s» sin necesidad de esta fila. Si la relación estaba al revés, retira antes la que consta.',
                          new.from_catalog_id, v_type.inverse_name, new.to_catalog_id);
  end if;

  return new;
end $$;

comment on function public.tg_artwork_relationship_not_reversed is
  'Rechaza la pareja inversa de una relación asimétrica (RF-217): «A es estudio previo de B» y «B es estudio previo de A» no pueden ser ciertas a la vez.';


-- The two rule triggers fire in alphabetical order of name, and that order
-- matters: the canonicalisation has to have put the ends in their place
-- before anybody looks for the opposite relationship. `canonicalize` goes before
-- `not_reversed`, and `row_audit` afterwards, which does not care.
create trigger artwork_relationship_canonicalize
  before insert or update on public.artwork_relationships
  for each row execute function public.tg_canonicalize_artwork_relationship();

create trigger artwork_relationship_not_reversed
  before insert or update on public.artwork_relationships
  for each row execute function public.tg_artwork_relationship_not_reversed();

create trigger artwork_relationship_row_audit
  before insert or update on public.artwork_relationships
  for each row execute function public.tg_row_audit();


-- ── Relating two artworks again RESTORES the relationship ───
--
-- Same case and same solution as `cite_artwork`, `exhibit_artwork`,
-- `document_artwork` and `document_exhibition`: with the uniqueness also covering
-- the withdrawn relationships, an `insert` of a pair that is in the wastebasket
-- clashes against the index, and the interface would turn an «Añadir» into a
-- uniqueness violation that makes no sense.
--
-- Here it also does a second thing the other four did not need: since the
-- canonicalisation trigger has already put the ends in their place before the
-- conflict check, adding «AR-0007 pareja de AR-0003» finds and
-- restores the row «AR-0003 pareja de AR-0007» that already existed. The user does not
-- have to remember in which order she wrote it the first time.
--
-- A function and not a `before insert` trigger returning `null`: a trigger like that
-- leaves the `insert` with no affected rows and whoever calls from the API asking for the
-- created row will receive none. The function always returns the row.
--
-- With no SECURITY DEFINER: the policies remain in force and a Reader does not write
-- here. The explicit check only turns the silent «nothing has
-- changed» into a legible error, and in Spanish because she reads it.
create function public.relate_artworks(
  p_from_catalog_id text,
  p_to_catalog_id text,
  p_relationship_type_id uuid,
  p_note text default ''
)
returns public.artwork_relationships
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_relationships;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para relacionar dos obras';
  end if;

  insert into public.artwork_relationships
    (from_catalog_id, to_catalog_id, relationship_type_id, note)
  values (p_from_catalog_id, p_to_catalog_id, p_relationship_type_id,
          coalesce(p_note, ''))
  on conflict (from_catalog_id, to_catalog_id, relationship_type_id) do update
     set active = true,
         -- What is not sent is not deleted: adding again a relationship that already
         -- existed cannot empty the note somebody wrote, because the
         -- «Añadir» form comes in blank. Emptying it is editing the
         -- relationship, which is another operation.
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else artwork_relationships.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.relate_artworks is
  'Relaciona dos obras, o RESTAURA la relación que estuviera retirada en vez de chocar contra la unicidad (RF-217, RF-517). En un tipo simétrico da igual el orden en que se pasen las obras.';


-- ── RLS and privileges ──────────────────────────────────────
--
-- It is revoked first and granted afterwards, one by one: the platform grants by
-- default all the privileges of every new table to the anonymous and
-- authenticated roles, `delete` included (RF-113).
--
-- No DELETE in either of the two: neither privilege nor policy, ever (RF-901,
-- RF-517). Withdrawing a relationship is an update of `active`.
--
-- The policies go in the next migration. Until they exist, nobody with a session
-- reads or writes these tables: RLS enabled with no policy denies.

alter table public.artwork_relationship_types enable row level security;
alter table public.artwork_relationships enable row level security;

revoke all on public.artwork_relationship_types from anon, authenticated;
revoke all on public.artwork_relationships from anon, authenticated;

grant select, insert, update on public.artwork_relationship_types to authenticated;
grant select, insert, update on public.artwork_relationships to authenticated;

-- Explicit, as in 20260801140000 and in the four previous groups: on this
-- platform a new function is born with EXECUTE for PUBLIC despite the `alter
-- default privileges`, and what catches it is `function_privileges.test.sql`. A
-- trigger function is invoked by nobody from the API, and it fires all the same.
revoke all on function public.tg_artwork_relationship_type_deactivation() from public;
revoke all on function public.tg_artwork_relationship_type_symmetry_locked() from public;
revoke all on function public.tg_canonicalize_artwork_relationship() from public;
revoke all on function public.tg_artwork_relationship_not_reversed() from public;

revoke all on function public.relate_artworks(text, text, uuid, text) from public, anon;
grant execute on function public.relate_artworks(text, text, uuid, text) to authenticated;
