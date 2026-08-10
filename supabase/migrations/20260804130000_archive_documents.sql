-- ============================================================
-- Archive and related documentation
-- (RF-515, RF-516, RF-408, RF-218, RF-517; ADR-006 applied for the second time).
--
-- It is table 9 of the v11 field schema —«Archivo/Documentación»—, the last
-- of the nine that was missing, plus two master tables that v11 does not have and the two bridge
-- tables that replace its two loose foreign keys.
--
-- What this group changes over v11, and why:
--
--   • `tipo_documento` goes from «open Selection» to a MASTER table with a surrogate
--     key. v11 itself declares it open —book, photograph, letter,
--     press clipping, poster, diptych…— so the source document already asks for
--     a list that grows. It is `artwork_types`'s case with no adaptation: the
--     user adds «telegrama» without deploying anything and the code never looks at the
--     value.
--   • `fondo_serie` goes from hierarchical text to a TREE. v11 defines it as
--     «Agrupación archivística (fondo → serie → subserie, si aplica)», which is
--     literally the shape `ubicacion_fisica` had before ADR-006: a
--     hierarchy stuffed inside a text with a convention that has to be
--     remembered. That mistake was already paid for once in this project and here avoiding it
--     costs nothing, because there is not a single document catalogued. It is born NULLABLE: if the
--     archival classification is never adopted, the table stays empty and
--     gets in nobody's way.
--   • `ubicacion_fisica` stops being text and points at the tree of places that ALREADY
--     exists. A box of letters is in the same building as the paintings, and a
--     second tree for the same thing would be the duplication ADR-006 came to
--     remove.
--   • `artista` stops being compulsory. v11 declares it a Selection between the two
--     artists, and a clipping about a group show of the two —or a context document
--     that belongs to neither— cannot choose.
--   • The relationships with artworks and with exhibitions are BRIDGE TABLES (RF-516) and
--     not v11's two foreign keys (`obra_relacionada`,
--     `exposicion_relacionada`). With that model, a press clipping that
--     mentions three artworks forces tripling the record and with it the uploaded PDF,
--     which is the normal case and not the rare one.
--   • The `digitalizado` (Yes/No) column is NOT created: it is `file_path is not null`.
--     A flag that can contradict the file it has alongside is a
--     flag that one day lies.
--
-- ABOUT THE DIGITISED FILE AND THE BUCKET. No new policy is needed: the
-- file goes to the private `obras` bucket under a prefix of its own, and the policies
-- of `storage.objects` that already exist (`bucket_id = 'obras'` and `can_read()` /
-- `can_edit()`) cover it as they are, which is RF-110's and RNF-111's criterion.
-- The bucket's size limit has been checked, which this group had to look at
-- for real: it is 62,914,560 bytes (60 MiB) per file, and it is NOT touched here. A
-- file scanned into a single PDF, which is what RF-408 recommends for
-- multipage documents, fits comfortably in black and white and can be managed in
-- colour from a few dozen pages. Raising the limit, sending the
-- digitised file to B2 like the masters or accepting splitting very long
-- files is a decision of the owner and not of this migration, and the number
-- is not copied into any constraint of this table: it would be a second source of
-- truth for a platform setting, which one day would say the opposite of what the
-- platform says.
--
-- The RLS POLICIES of the five tables go in the next migration. What IS
-- done here is enabling RLS and revoking the privileges, because a table that
-- exists for a single deployment with no RLS is a published table. With RLS enabled and
-- no policy, the table is closed to everybody except direct
-- administrative access, which is the safe state to wait in.
-- ============================================================


-- ── The vocabulary of document types (RF-515) ───────────────
--
-- `artwork_types`'s pattern after ADR-007 and `publication_types`': surrogate
-- key, the name as an attribute unique by `place_key`, wastebasket and creation
-- authorship. With no `updated_at`/`updated_by` and no `restored_at`, like the other
-- vocabulary master tables: it is a list that hangs from the records, not a record
-- with a wastebasket screen of its own (RF-901 enumerates those that do have one).

create table public.document_types (
  id uuid primary key default gen_random_uuid(),

  -- Just as it is written, with its capitals and its accents. What is normalised is
  -- the comparison key, not the datum.
  name text not null,

  -- RF-901: nothing is deleted, it is withdrawn.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- A blank type classifies nothing, and one with spaces around it would break
  -- the duplicate comparison without it being visible on screen.
  constraint document_types_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.document_types is
  'Vocabulario abierto de tipos de documento de archivo (RF-515), con clave sustituta (ADR-007): renombrar es una fila. Nada se borra, se retira.';

create unique index document_types_name_unique
  on public.document_types (public.place_key(name));

create index document_types_active_idx on public.document_types (active);

-- Authorship and wastebasket with RF-804's generic function, not with a fifth copy
-- of `tg_artwork_type_authorship`.
create trigger document_type_row_audit
  before insert or update on public.document_types
  for each row execute function public.tg_row_audit();

-- The seeding, which is what makes the interface usable on the first day: an
-- empty master table leaves the selector blank and forces inventing the vocabulary
-- while cataloguing. They are exactly the ten values v11 enumerates in its
-- table 9. Extending the list requires no migration: that is the reason it is
-- a master table.
--
-- `created_by` is left null on purpose: inside a migration `auth.uid()` is
-- nobody, and these rows were created by no person.
insert into public.document_types (name) values
  ('Libro'),
  ('Publicación'),
  ('Fotografía'),
  ('Carta'),
  ('Recorte de prensa'),
  ('Manuscrito'),
  ('Cartel'),
  ('Díptico'),
  ('Folleto'),
  ('Nota de prensa');

-- A type that still classifies documents is not withdrawn, with the same rule as
-- `tg_publication_type_deactivation` and `tg_artwork_type_deactivation`: withdrawing it
-- does not withdraw it, it leaves the archive pointing at something the interface no longer offers.
-- A document in the wastebasket does not count, as in the others: requiring the
-- wastebasket to be emptied before withdrawing a type would be making the wastebasket get in the way.
create function public.tg_document_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.archive_documents
                  where document_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de documento que todavía usan documentos del archivo'
      using hint = 'Cambia antes el tipo de esos documentos.';
  end if;
  return new;
end $$;

comment on function public.tg_document_type_deactivation is
  'Impide retirar un tipo de documento que todavía clasifica documentos activos (RF-515).';

create trigger document_type_deactivation
  before update of active on public.document_types
  for each row execute function public.tg_document_type_deactivation();


-- ── The archival classification, as a tree (RF-515) ─────────
--
-- `physical_places`'s pattern (ADR-006), and for the same reason: the name is
-- stored just as it is written and what is normalised is the comparison key;
-- `parent_id` is mutable because reorganising a fonds is a normal operation; and
-- nothing is deleted.
--
-- It is the most debatable of the new master tables and that is why it is born NULLABLE on the
-- document's side: if the archival classification is not adopted, this table
-- stays empty and no document misses it.

create table public.archive_series (
  id uuid primary key default gen_random_uuid(),

  -- Null is a fonds (the root). MUTABLE on purpose: discovering that what was
  -- noted as a series is really a sub-series of another has to be an
  -- update, not a redoing. `restrict` because a node with children is not withdrawn: it is
  -- emptied first.
  parent_id uuid references public.archive_series (id) on delete restrict,

  name text not null,

  -- RF-901: nothing is deleted, it is withdrawn. With no `restored_at`, like the tree of
  -- places: restoring leaves the node as if it had never been withdrawn, and
  -- `tg_row_audit` distinguishes that case by the column's absence.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  constraint archive_series_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.archive_series is
  'Árbol de clasificación archivística: fondo → serie → subserie (RF-515). Es el `fondo_serie` de v11, que era un texto jerárquico, resuelto con la forma que ADR-006 ya fijó para los lugares. Nada se borra, se retira.';

comment on column public.archive_series.parent_id is
  'Nulo es un fondo (raíz). Mutable: reorganizar la clasificación es una operación normal y no toca ningún documento.';

-- Two siblings cannot be called the same, compared with no accents and no capitals. They are
-- two indexes because in SQL one null is not equal to another null: without the partial one, two
-- homonymous fonds would pass.
create unique index archive_series_root_unique
  on public.archive_series (public.place_key(name))
  where parent_id is null;

create unique index archive_series_siblings_unique
  on public.archive_series (parent_id, public.place_key(name))
  where parent_id is not null;

create index archive_series_parent_idx on public.archive_series (parent_id);
create index archive_series_active_idx on public.archive_series (active);

-- No cycles. A series inside its own sub-series leaves the tree
-- unrecoverable: no recursive query terminates and the node disappears from the
-- hierarchy without having been deleted. It is cheap to check and expensive to discover, and
-- it is `tg_physical_place_no_cycle`'s same 100-hop belt: if the
-- tree were already corrupt, this stops instead of hanging.
create function public.tg_archive_series_no_cycle()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_ancestor uuid := new.parent_id;
  v_hops int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Una serie no puede estar dentro de sí misma';
  end if;

  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'Ese movimiento metería la serie dentro de una de sus subseries';
    end if;
    v_hops := v_hops + 1;
    if v_hops > 100 then
      raise exception 'La clasificación archivística tiene un ciclo';
    end if;
    select parent_id into v_ancestor from public.archive_series where id = v_ancestor;
  end loop;

  return new;
end $$;

comment on function public.tg_archive_series_no_cycle is
  'Impide que la clasificación archivística se cierre sobre sí misma (RF-515), con el cinturón de 100 saltos de ADR-006.';

create trigger archive_series_no_cycle
  before insert or update of parent_id on public.archive_series
  for each row execute function public.tg_archive_series_no_cycle();

create trigger archive_series_row_audit
  before insert or update on public.archive_series
  for each row execute function public.tg_row_audit();

-- A series with content is not withdrawn: it is emptied first. It holds for the
-- sub-series and for the documents, just as in the tree of places.
create function public.tg_archive_series_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.archive_series
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar una serie que todavía contiene otras series'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;

    if exists (select 1 from public.archive_documents
                where archive_series_id = new.id and active) then
      raise exception 'No se puede retirar una serie que todavía tiene documentos dentro'
        using hint = 'Mueve antes los documentos a otra serie.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_archive_series_deactivation is
  'Impide retirar una serie archivística con subseries o con documentos activos dentro (RF-515).';

create trigger archive_series_deactivation
  before update of active on public.archive_series
  for each row execute function public.tg_archive_series_deactivation();


-- ── The archive document ────────────────────────────────────

create table public.archive_documents (
  -- Surrogate key (ADR-007). The folder's label goes in the next
  -- column and it is not the row's identity: see the reason there.
  id uuid primary key default gen_random_uuid(),

  -- v11's `id_documento` (`AR-ARCH-0001`), and here is the difference from
  -- `catalog_id`: that one is a label stuck to a real artwork and that is why it is the
  -- key and is not edited (RF-204); this one is not stuck to anything yet, and an
  -- archival classification gets reorganised. Separating it from the identity is what
  -- allows correcting it with no migration.
  --
  --   • NULL ALLOWED: a clipping noted before being filed has no
  --     shelfmark, and forcing one to be invented would fill the archive with codes
  --     nobody chose.
  --   • EDITABLE, which is exactly what it would not be while being the primary key.
  --   • UNIQUE, compared like the rest of the schema's names: two shelfmarks
  --     that differ only in capitals are the same shelfmark.
  archive_code text,

  -- NULL ALLOWED, unlike in v11, which declared it a compulsory Selection
  -- between the two artists: a press clipping about a group show
  -- of the two does not belong to a single fund, and a context document belongs to
  -- neither. Forcing a choice would have put a false datum in half the
  -- archive records.
  artist_fund public.artist_fund,

  -- Null is «not classified yet», which is a legitimate answer while the
  -- document is noted from a photocopy. `restrict` for the same reason as in the rest
  -- of the schema: nobody has DELETE, and if a row were ever deleted by hand
  -- this warns instead of leaving documents pointing at nothing.
  document_type_id uuid references public.document_types (id) on delete restrict,

  -- v11's `titulo_descripcion`: a title or a brief description. It is the only
  -- compulsory thing in the record, because a document with nothing to name it cannot
  -- be found again.
  title text not null,

  -- The archival classification, optional. See the table's note: it is born
  -- nullable on purpose.
  archive_series_id uuid references public.archive_series (id) on delete restrict,

  -- ── The date, with ADR-004's structured shape ─────────────
  -- The same one as in the provenance links, and for the same reason: five
  -- columns are repeated in exchange for inheriting the date parser from the frontend, the
  -- generated column and the tests already written. The alternative was v11's `Texto`,
  -- which cannot be asked about.
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

  -- Where the paper is. It REUSES the tree of places that already exists (ADR-006):
  -- a box of letters is in the same building as the paintings, and a second
  -- tree for the same thing would be the duplication this design avoids. Null is
  -- «with no site yet», as in the artworks.
  physical_place_id uuid references public.physical_places (id) on delete restrict,

  -- ── The digitised file (RF-408) ───────────────────────────
  -- Four columns and NOT a `digitalizado` flag: the answer to «is it
  -- digitised?» is `file_path is not null`, and a flag alongside the file
  -- ends up contradicting it.
  --
  -- One file per row, without the photographs' three levels: RF-413 was
  -- withdrawn for over-engineering and for the multipage documents RF-408 fixes a
  -- single PDF with all the pages, not one row per page.
  file_path text,
  file_size_bytes bigint,
  mime_type text,
  uploaded_at timestamptz,

  note text not null default '',

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 and RF-902: the document is one of the records the requirement enumerates,
  -- so it carries a complete wastebasket and the restoration does NOT erase the previous
  -- withdrawal's trace.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- With no title there is no document. It is NOT also required to be trimmed, as in
  -- the bibliography and in the exhibitions: here there is no comparison key
  -- a space could break, and a description is pasted from a PDF.
  constraint archive_documents_title_not_blank check (btrim(title) <> ''),

  -- If there is a shelfmark, let it be a shelfmark: trimmed and not empty. A string of
  -- spaces would pass for a code and would be a gap with a unique index.
  constraint archive_documents_code_shape check (
    archive_code is null
    or (archive_code = btrim(archive_code) and archive_code <> '')
  ),

  -- A year outside a plausible range is a typo, not a date (ADR-004).
  constraint archive_documents_plausible_years check (
    (start_year is null or start_year between 1000 and 2100)
    and (end_year is null or end_year between 1000 and 2100)
  ),

  -- As in the provenance links and unlike in
  -- `artworks_coherent_range`: here `>=`, because a correspondence folder
  -- from 1985 opened and closed in the same year is a real range. And an end with no
  -- beginning is half a date: it is rejected, because a comparison with null is not
  -- false and without this form it would slip through.
  constraint archive_documents_coherent_range check (
    end_year is null or (start_year is not null and end_year >= start_year)
  ),

  -- The flags speak about a year: with no year there is nothing to approximate nor to
  -- cast doubt on («[?]» on its own says nothing).
  constraint archive_documents_flags_require_year check (
    start_year is not null or (not approximate_date and not unconfirmed_date)
  ),

  -- All or nothing, like a photograph's corrected copy: half a description of
  -- a file does not exist. A path with no size cannot be offered with its weight, and
  -- a size with no path is a file nobody can download.
  constraint archive_documents_file_all_or_nothing check (
    num_nonnulls(file_path, file_size_bytes, mime_type, uploaded_at) in (0, 4)
  ),

  -- A zero-byte file is an upload failure disguised as a digitised
  -- document.
  constraint archive_documents_file_size_positive check (
    file_size_bytes is null or file_size_bytes > 0
  ),

  constraint archive_documents_file_path_shape check (
    file_path is null or (file_path = btrim(file_path) and file_path <> '')
  ),

  constraint archive_documents_mime_type_shape check (
    mime_type is null or (mime_type = btrim(mime_type) and mime_type <> '')
  )
);

comment on table public.archive_documents is
  'Documentación de archivo sobre los artistas y sus exposiciones que no es obra (tabla 9 del esquema de campos v11). Se relaciona con obras y con exposiciones por tablas puente (RF-516). Nada se borra, se retira.';

comment on column public.archive_documents.archive_code is
  'Signatura de la carpeta («AR-ARCH-0001»). Única, opcional y EDITABLE, al contrario que la clave de catalogación de una obra: esta no está pegada a nada del mundo y una clasificación archivística se reorganiza.';
comment on column public.archive_documents.artist_fund is
  'Fondo al que pertenece el documento. Nulo permitido, al contrario que en v11: un recorte sobre una colectiva de los dos artistas no pertenece a uno solo.';
comment on column public.archive_documents.archive_series_id is
  'Nodo del árbol de clasificación archivística (RF-515). Nulo es «sin clasificar», que también es una respuesta.';
comment on column public.archive_documents.physical_place_id is
  'Dónde está el papel, en el MISMO árbol de lugares que las obras (ADR-006): una caja de cartas está en el mismo edificio que los cuadros.';
comment on column public.archive_documents.date_text is
  'Generada: se compone de los campos estructurados (o de date_note si existe). No se escribe nunca directamente (ADR-004).';
comment on column public.archive_documents.file_path is
  'Ruta del fichero digitalizado en el bucket privado `obras` (RF-408, RF-110). No hay columna «digitalizado»: es esta ruta, que no puede mentir. Para un documento multipágina, un único PDF.';
comment on column public.archive_documents.file_size_bytes is
  'Tamaño del fichero. El bucket limita hoy a 60 MiB por fichero; el número no se copia aquí para no tener dos fuentes de verdad de un ajuste de la plataforma.';

-- Unique by comparison key, and only where there is a shelfmark: `place_key` is
-- `strict`, so it returns null for the documents with no code and the index
-- ignores them — which is what allows having many with no shelfmark and none duplicated.
create unique index archive_documents_code_unique
  on public.archive_documents (public.place_key(archive_code));

-- WITHOUT uniqueness over the title, on purpose and as in the bibliography and the
-- exhibitions: three different clippings are described the same («Nota de prensa de
-- la inauguración»). The duplicates are resolved by review (RF-909).

create index archive_documents_type_idx
  on public.archive_documents (document_type_id);
create index archive_documents_series_idx
  on public.archive_documents (archive_series_id);
create index archive_documents_place_idx
  on public.archive_documents (physical_place_id);
create index archive_documents_active_idx on public.archive_documents (active);

create trigger archive_document_row_audit
  before insert or update on public.archive_documents
  for each row execute function public.tg_row_audit();


-- ── Nor is a place with documents inside withdrawn ──────────
--
-- It is the easiest half-applied guardrail to forget in this whole design:
-- `tg_physical_place_deactivation` today checks the child places and the artworks
-- inside, and without this replacement the building where the whole archive is
-- could be withdrawn with nothing warning.
--
-- `create or replace` replaces the WHOLE definition, so the two previous
-- blocks are repeated here literally and the test checks all three: a
-- replacement that eats one of them breaks nothing visible the day it is
-- written. `set search_path = public` is repeated for the same reason, because the
-- replacement also takes the function's configuration.
create or replace function public.tg_physical_place_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.physical_places
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía contiene otros lugares'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;

    if exists (select 1 from public.artworks
                where physical_place_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía tiene obras dentro'
        using hint = 'Mueve antes las obras a otro sitio.';
    end if;

    if exists (select 1 from public.archive_documents
                where physical_place_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía tiene documentos de archivo dentro'
        using hint = 'Mueve antes esos documentos a otro sitio.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_physical_place_deactivation is
  'Impide retirar un lugar que todavía contiene lugares, obras activas o documentos de archivo activos (ADR-006, RF-215, RF-515).';


-- ── The document and the artwork (RF-516) ───────────────────
--
-- A bridge table, and not v11's `obra_relacionada` foreign key: with a single
-- reference per side, a press clipping that mentions three artworks forces
-- tripling the record and with it the uploaded PDF. And v11 itself fixes the criterion
-- in its implementation notes: when a datum depends on the combination of
-- two entities, it is modelled as a table of its own.

create table public.artwork_documents (
  id uuid primary key default gen_random_uuid(),

  -- Same shape as `images`, `provenance_events`, `artwork_bibliography` and
  -- `artwork_exhibitions`: `on update cascade` because the cataloguing
  -- identifier is text, and with no `on delete` because nothing is deleted from `artworks`
  -- (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  document_id uuid not null references public.archive_documents (id) on delete restrict,

  -- What that document says about THIS artwork: «reproducida en la página 3», «la obra
  -- aparece al fondo de la fotografía». Different from the document's note, which
  -- speaks of the document as a whole.
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, which REVISES RF-903, just as in the other two bridges: nothing in this
  -- schema is ever deleted, with no exceptions to remember. With no `restored_at`:
  -- this row is restored from the record it hangs from and not from a
  -- wastebasket screen, so adding it again leaves it as if it had never
  -- been withdrawn.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- A document that mentions the same artwork twice is one link with a longer
  -- note, not two rows. The constraint also covers the withdrawn
  -- links, which is what allows adding again to restore instead of
  -- duplicating (see `document_artwork`).
  constraint artwork_documents_unique unique (catalog_id, document_id)
);

comment on table public.artwork_documents is
  'Vínculo entre un documento de archivo y una obra (RF-516). Tabla puente y no la clave ajena de v11: un recorte que menciona tres obras no puede obligar a triplicar el PDF. Nada se borra (RF-517).';

-- The artwork record's «Documentación relacionada» block uses the unique index,
-- which already starts with `catalog_id`; this one serves the document record's
-- «Relacionado con» block (RF-310).
create index artwork_documents_document_idx
  on public.artwork_documents (document_id);

create trigger artwork_document_row_audit
  before insert or update on public.artwork_documents
  for each row execute function public.tg_row_audit();


-- ── The document and the exhibition (RF-516) ────────────────
--
-- The poster, the diptych or the leaflet of a show documents the exhibition as
-- a whole and not one particular artwork, which is the case v11 added in v4 with
-- `exposicion_relacionada`. Here it is a bridge for the same reason as the previous one: a
-- press release covering two shows is one row and two links.

create table public.exhibition_documents (
  id uuid primary key default gen_random_uuid(),

  exhibition_id uuid not null references public.exhibitions (id) on delete restrict,
  document_id uuid not null references public.archive_documents (id) on delete restrict,

  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, and with no `restored_at` for the same reason as the previous bridge.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  constraint exhibition_documents_unique unique (exhibition_id, document_id)
);

comment on table public.exhibition_documents is
  'Vínculo entre un documento de archivo y una exposición (RF-516): cartel, díptico, folleto o nota de prensa de la muestra. Nada se borra (RF-517).';

create index exhibition_documents_document_idx
  on public.exhibition_documents (document_id);

create trigger exhibition_document_row_audit
  before insert or update on public.exhibition_documents
  for each row execute function public.tg_row_audit();


-- ── Linking a withdrawn document again RESTORES it ──────────
--
-- Same case and same solution as `cite_artwork` and `exhibit_artwork`: with the
-- uniqueness also covering the withdrawn links, an `insert` of a pair
-- that is in the wastebasket clashes against the index, and the interface would turn an
-- «Añadir» into an incomprehensible uniqueness violation.
--
-- Functions and not a `before insert` trigger returning `null`: a trigger like that
-- leaves the `insert` with no affected rows and whoever calls from the API asking for the
-- created row will receive none. The function always returns the row.
--
-- With no SECURITY DEFINER: the policies remain in force and a Reader does not write
-- here. The explicit check only turns the silent «nothing has
-- changed» into a legible error, and in Spanish because she reads it.

create function public.document_artwork(
  p_catalog_id text,
  p_document_id uuid,
  p_note text default ''
)
returns public.artwork_documents
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_documents;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para vincular un documento con una obra';
  end if;

  insert into public.artwork_documents (catalog_id, document_id, note)
  values (p_catalog_id, p_document_id, coalesce(p_note, ''))
  on conflict (catalog_id, document_id) do update
     set active = true,
         -- What is not sent is not deleted: adding again a link that already
         -- existed cannot empty the note somebody wrote, because the
         -- «Añadir» form comes in blank. Emptying it is editing the
         -- link, which is another operation.
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else artwork_documents.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.document_artwork is
  'Vincula un documento de archivo con una obra, o RESTAURA el vínculo que estuviera retirado en vez de chocar contra la unicidad (RF-516, RF-517).';

create function public.document_exhibition(
  p_exhibition_id uuid,
  p_document_id uuid,
  p_note text default ''
)
returns public.exhibition_documents
language plpgsql
set search_path = public
as $$
declare
  v_row public.exhibition_documents;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para vincular un documento con una exposición';
  end if;

  insert into public.exhibition_documents (exhibition_id, document_id, note)
  values (p_exhibition_id, p_document_id, coalesce(p_note, ''))
  on conflict (exhibition_id, document_id) do update
     set active = true,
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else exhibition_documents.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.document_exhibition is
  'Vincula un documento de archivo con una exposición, o RESTAURA el vínculo que estuviera retirado (RF-516, RF-517).';


-- ── What the artwork gains (RF-218) ─────────────────────────

alter table public.artworks
  add column documentation_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.documentation_status is
  'Estado de investigación de la documentación relacionada de la obra (RF-218). Una obra sin documentos vinculados no es una obra de la que no se conserve nada: es una obra cuyo archivo nadie ha mirado todavía.';


-- ── «Sin revisar» is not «no», in documentation too ─────────
--
-- Fourth and last replacement of the same function: the provenance created it, the
-- bibliography and the exhibitions added their own and this one closes the four
-- documentary blocks of RF-218. All four are checked in the test, because a
-- `create or replace` can eat a previous block with nothing warning — the
-- migration that wrote it was applied a while ago and its test goes on passing, because
-- it checks the function that is there and not the one that was.
--
-- It is checked through BOTH doors, as in the three previous groups: neither is
-- «investigado sin resultado» declared on an artwork with linked documents, nor is
-- a document linked to an artwork declared that way.
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
  v_documentation_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      old.provenance_status is distinct from new.provenance_status;
    v_bibliography_changed :=
      old.bibliography_status is distinct from new.bibliography_status;
    v_exhibition_changed :=
      old.exhibition_history_status is distinct from new.exhibition_history_status;
    v_documentation_changed :=
      old.documentation_status is distinct from new.documentation_status;
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

  if new.documentation_status = 'NONE_FOUND' and v_documentation_changed then
    if exists (select 1 from public.artwork_documents
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar la documentación por investigada sin resultado: la obra % ya tiene documentos vinculados', new.catalog_id
        using hint = 'Retira antes esos vínculos, o marca la documentación como «En curso» o «Completa».';
    end if;
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218). Cubre los cuatro bloques: procedencia, bibliografía, historial expositivo y documentación.';

-- The other door. What IS allowed, and it is intentional: documents linked
-- to an artwork whose state is still on «Sin revisar». Having a datum is not having done
-- the research, so the rule is one-way.
create function public.tg_artwork_document_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select documentation_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'La documentación de la obra % consta investigada sin resultado y este vínculo la contradice', new.catalog_id
      using hint = 'Cambia antes el estado de la documentación a «En curso» o «Completa».';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_document_status_coherent is
  'La otra puerta de RF-218: no se vincula ni se restaura un documento en una obra cuya documentación consta investigada sin resultado.';

create trigger artwork_document_status_coherent
  before insert or update on public.artwork_documents
  for each row execute function public.tg_artwork_document_status_coherent();


-- ── RLS and privileges ──────────────────────────────────────
--
-- It is revoked first and granted afterwards, one by one: the platform grants by
-- default all the privileges of every new table to the anonymous and
-- authenticated roles, `delete` included (RF-113).
--
-- No DELETE in any of the five: neither privilege nor policy, ever (RF-901,
-- RF-517). Withdrawing a document or a link is an update of `active`.
--
-- The policies go in the next migration. Until they exist, nobody with a session
-- reads or writes these tables: RLS enabled with no policy denies.

alter table public.document_types enable row level security;
alter table public.archive_series enable row level security;
alter table public.archive_documents enable row level security;
alter table public.artwork_documents enable row level security;
alter table public.exhibition_documents enable row level security;

revoke all on public.document_types from anon, authenticated;
revoke all on public.archive_series from anon, authenticated;
revoke all on public.archive_documents from anon, authenticated;
revoke all on public.artwork_documents from anon, authenticated;
revoke all on public.exhibition_documents from anon, authenticated;

grant select, insert, update on public.document_types to authenticated;
grant select, insert, update on public.archive_series to authenticated;
grant select, insert, update on public.archive_documents to authenticated;
grant select, insert, update on public.artwork_documents to authenticated;
grant select, insert, update on public.exhibition_documents to authenticated;

-- Explicit, as in 20260801140000 and in the four previous groups: on this
-- platform a new function is born with EXECUTE for PUBLIC despite the `alter
-- default privileges`, and what catches it is `function_privileges.test.sql`.
revoke all on function public.tg_document_type_deactivation() from public;
revoke all on function public.tg_archive_series_no_cycle() from public;
revoke all on function public.tg_archive_series_deactivation() from public;
revoke all on function public.tg_artwork_document_status_coherent() from public;
-- `create or replace` keeps the previous function's privileges, but it is
-- repeated so that the migration does not depend on that detail.
revoke all on function public.tg_artwork_research_status_coherent() from public;
revoke all on function public.tg_physical_place_deactivation() from public;

revoke all on function public.document_artwork(text, uuid, text) from public, anon;
grant execute on function public.document_artwork(text, uuid, text) to authenticated;
revoke all on function public.document_exhibition(uuid, uuid, text) from public, anon;
grant execute on function public.document_exhibition(uuid, uuid, text) to authenticated;
