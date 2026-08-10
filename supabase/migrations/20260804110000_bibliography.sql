-- ============================================================
-- Bibliography and the citation of an artwork in a reference
-- (RF-514, RF-513, RF-504, RF-506, RF-517, RF-218; resolves DP-03).
--
-- They are tables 6 and 7 of the v11 field schema —«Bibliografía» and the bridge
-- «Obra_Bibliografia»—, plus the vocabulary of publication types that v11
-- left as a closed selection of four values.
--
-- WHY BEFORE THE EXHIBITIONS, which v11 numbers as table 4 and this one as
-- 6: the arrow points this way. `Exposiciones.referencia_catalogo`
-- (RF-503) references the bibliography and not the other way round, because an exhibition's
-- catalogue is not a table of its own: it is a publication like any
-- other. Building in the document's order would leave the exhibitions'
-- migration with a foreign key to a table that does not yet exist.
--
-- What this group adds over v11, and why:
--
--   • `publication_types` is an open MASTER table and not a selection of four
--     values. Book / Article / Catalogue / Press does not survive the first month of
--     real research: a doctoral thesis, an auction catalogue, a blog entry,
--     a radio programme, a leaflet. It is `artwork_types`'s case with no adaptation
--     at all — the user extends the list and the code never looks at the value,
--     it only renders it.
--   • `clave_bibtex` stops being the primary key and becomes a unique column,
--     optional and editable. It is DP-03, which the requirements document leaves
--     pending «only for when Bibliography exists»: ADR-007 already decided the
--     essential part and here it is executed.
--   • `container_title`, which v11 does not have and without which the name of an article's
--     journal ends up inside the title and the citation cannot be composed.
--   • The bridge keeps `pages` separate from `note`, following v11 v9, which already
--     reverted the merger with the correct argument: the page is a datum
--     citable exactly and of recurrent use (RF-504).
--   • And the bridge HAS a wastebasket, which is what revises RF-903 (see further below).
--
-- The RLS POLICIES of the three tables go in the next migration. What IS
-- done here is enabling RLS and revoking the privileges, because a table that
-- exists for a single deployment with no RLS is a published table. With RLS enabled and
-- no policy, the table is closed to everybody except direct
-- administrative access, which is the safe state to wait in.
-- ============================================================


-- ── The vocabulary of publication types (RF-514) ────────────
--
-- `artwork_types`'s pattern after ADR-007: surrogate key, the name as a
-- unique attribute, wastebasket and authorship. The difference from that one is that the
-- uniqueness goes by `place_key(name)` and not by the literal name: «Catálogo de
-- exposición» and «catalogo de exposicion» are the same type, and discovering it
-- when there are already two rows costs going through every reference.

create table public.publication_types (
  id uuid primary key default gen_random_uuid(),

  -- Just as it is written, with its capitals and its accents. What is normalised
  -- is the comparison key, not the datum.
  name text not null,

  -- RF-901: nothing is deleted, it is withdrawn. With no `restored_at`: as in the other
  -- vocabulary master tables, restoring leaves the row as if it had never been
  -- withdrawn, and `tg_row_audit` distinguishes that case by the column's
  -- absence.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- A blank type classifies nothing, and one with spaces around it would break
  -- the duplicate comparison without it being visible on screen.
  constraint publication_types_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.publication_types is
  'Vocabulario abierto de tipos de publicación (RF-514), con clave sustituta (ADR-007): renombrar es una fila. v11 lo dejaba como selección cerrada de cuatro valores. Nada se borra, se retira.';

create unique index publication_types_name_unique
  on public.publication_types (public.place_key(name));

create index publication_types_active_idx on public.publication_types (active);

-- Authorship and wastebasket with RF-804's generic function, and not with a fourth
-- copy of `tg_artwork_type_authorship`: it was exactly the divergence
-- `tg_row_audit` came to avoid.
create trigger publication_type_row_audit
  before insert or update on public.publication_types
  for each row execute function public.tg_row_audit();

-- The seeding, which is what makes the interface usable on the first day: an
-- empty master table leaves the selector blank and forces inventing the vocabulary
-- while cataloguing. They are v11's four values with the catalogue one
-- written out in full —«Catálogo» on its own gets confused with the catalogue raisonné
-- this project is making—, plus «Tesis» and «Otro», which are the two that
-- are missing on the first day in the archive. Extending the list requires no migration: that
-- is the reason it is a master table.
--
-- `created_by` is left null on purpose: inside a migration `auth.uid()` is
-- nobody, and these rows were created by no person.
insert into public.publication_types (name) values
  ('Libro'),
  ('Artículo'),
  ('Catálogo de exposición'),
  ('Prensa'),
  ('Tesis'),
  ('Otro');

-- A type that still classifies references is not withdrawn, with the same rule
-- as `tg_artwork_type_deactivation` and `tg_series_deactivation`: withdrawing it does not
-- withdraw it, it leaves the catalogue pointing at something the interface no longer offers.
-- A reference in the wastebasket does not count, as in the others.
create function public.tg_publication_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.bibliography
                  where publication_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de publicación que todavía usan referencias del catálogo'
      using hint = 'Cambia antes el tipo de esas referencias.';
  end if;
  return new;
end $$;

comment on function public.tg_publication_type_deactivation is
  'Impide retirar un tipo de publicación que todavía clasifica referencias activas (RF-514).';

create trigger publication_type_deactivation
  before update of active on public.publication_types
  for each row execute function public.tg_publication_type_deactivation();


-- ── The bibliographic reference ─────────────────────────────

create table public.bibliography (
  -- Surrogate key (ADR-007). The BibTeX key was the primary key in v11 and
  -- stops being it: see the next column.
  id uuid primary key default gen_random_uuid(),

  -- DP-03, resolved. It is the short handle with which the researcher names a
  -- reference («rotili1985muba»), and that is why it is kept even though RF-507 —the
  -- export to `.bib`— is withdrawn: the printed catalogue is parked, not
  -- cancelled. What changes is its role:
  --
  --   • NULL ALLOWED, because a reference just noted from a press
  --     clipping does not have a key yet and forcing one to be invented would fill the table
  --     with keys nobody chose.
  --   • EDITABLE, which is exactly what it was not while being the primary key: a BibTeX
  --     key gets corrected on discovering that the year was another.
  --   • UNIQUE, compared like the rest of the schema's names: two keys that
  --     differ only in capitals are the same key and `.bib` would not
  --     distinguish them.
  --
  -- And it does NOT carry a `bibtex_type` alongside: that would be building for RF-507, which is
  -- struck out, and that is how the code nobody can remove afterwards accumulates.
  bibtex_key text,

  -- Free text and NOT a relationship to `parties`, on purpose: the author of a
  -- 1985 article is not a contact of the catalogue —they have no provenance, no
  -- telephone, no rights— and putting them in the master table would fill it with empty records
  -- that then get in the way in the owners' selector. The day an author does
  -- also happen to be an owner, they will have their record for that other reason.
  authors text not null default '',
  -- The volume's editor or coordinator, when it is different from the author
  -- (frequent in collective catalogues). v11 added it in v4 so as to be able to search
  -- by it.
  editors text not null default '',

  title text not null,

  -- The journal, the volume or the catalogue that CONTAINS the cited text. v11 does not
  -- have it, and without it the journal's name ends up inside the title: the citation
  -- stops being composable and searching «everything published in such-and-such journal» becomes
  -- a free-text search inside another field.
  container_title text not null default '',

  -- Null is «not classified yet», which is a legitimate answer while the
  -- reference is noted from a photocopy. `restrict` for the same reason as in the
  -- rest of the schema: nobody has DELETE, and if a row were ever deleted
  -- by hand this warns instead of leaving references pointing at nothing.
  publication_type_id uuid references public.publication_types (id) on delete restrict,

  -- Null allowed: `s.f.` exists and is a datum, not a gap. It is a loose year and
  -- not ADR-004's structured shape because a reference is cited by its
  -- year of publication, which is neither a range nor an approximation.
  year smallint,

  publisher text not null default '',
  place text not null default '',
  note text not null default '',

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 and RF-902: complete wastebasket, with the trace of the last withdrawal and of the
  -- last restoration.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- A reference with no title cannot be cited. It is NOT also required to be
  -- trimmed, unlike the master tables' names: here there is no comparison
  -- key a space could break, and a title is pasted from a PDF.
  constraint bibliography_title_not_blank check (btrim(title) <> ''),

  -- If there is a key, let it be a key: trimmed, not empty and without the characters
  -- a `.bib` file does not admit inside one — a space or a comma
  -- splits the entry, and braces close it before time. Rejecting it here
  -- costs one line; discovering it the day somebody exports, a while.
  constraint bibliography_bibtex_key_shape check (
    bibtex_key is null
    or (bibtex_key = btrim(bibtex_key)
        and bibtex_key <> ''
        and bibtex_key !~ '[[:space:],{}]')
  ),

  -- Un año fuera de rango plausible es una errata, no una fecha (ADR-004).
  constraint bibliography_plausible_year check (
    year is null or year between 1000 and 2100
  )
);

comment on table public.bibliography is
  'Referencias bibliográficas (tabla 6 del esquema de campos v11). Clave sustituta (ADR-007) y clave BibTeX como columna única, opcional y editable (DP-03). Nada se borra, se retira.';

comment on column public.bibliography.bibtex_key is
  'Asa corta con la que se nombra la referencia («rotili1985muba»). Única, opcional y editable: deja de ser clave primaria (DP-03, ADR-007).';
comment on column public.bibliography.container_title is
  'Revista, volumen o catálogo que contiene el texto citado. Sin esta columna el nombre de la revista acaba dentro del título.';
comment on column public.bibliography.authors is
  'Texto libre, no una relación a personas e instituciones: el autor de un artículo no es un contacto del catálogo.';
comment on column public.bibliography.year is
  'Año de publicación. Nulo es «sin fecha», que en bibliografía es un dato y no un hueco.';

-- Única por clave de comparación, y solo donde hay clave: `place_key` es
-- `strict`, así que devuelve nulo para las referencias sin clave y el índice
-- las ignora — que es lo que permite tener muchas sin clave y ninguna
-- duplicada.
create unique index bibliography_bibtex_key_unique
  on public.bibliography (public.place_key(bibtex_key));

-- SIN unicidad sobre el título, a propósito: dos referencias distintas se
-- llaman igual («Alberto Rotili») y son dos entradas legítimas del catálogo.
-- Los duplicados se resuelven por revisión del equipo (RF-909), que es lo que
-- el proyecto ya decidió para el resto de las altas.

create index bibliography_publication_type_idx
  on public.bibliography (publication_type_id);
create index bibliography_active_idx on public.bibliography (active);

create trigger bibliography_row_audit
  before insert or update on public.bibliography
  for each row execute function public.tg_row_audit();


-- ── La cita de una obra en una referencia (RF-504) ──────────
--
-- La tabla puente 7 de v11. Registra en qué páginas de qué referencia aparece
-- mencionada o reproducida cada obra.

create table public.artwork_bibliography (
  id uuid primary key default gen_random_uuid(),

  -- Misma forma que `images` y que `provenance_events`: `on update cascade`
  -- porque el identificador de catalogación es texto, y sin `on delete` porque
  -- de `artworks` no se borra nada (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  bibliography_id uuid not null references public.bibliography (id) on delete restrict,

  -- DOS COLUMNAS y no una nota fundida, siguiendo a v11 v9, que ya revirtió esa
  -- fusión con el argumento correcto: la página es un dato de uso recurrente y
  -- citable de forma exacta —se cita en el ensayo del catálogo razonado y se
  -- busca—, mientras que la nota es prosa («reproducida en color», «mencionada
  -- en pie de foto, sin reproducir»). Es texto y no un número porque «34-36»,
  -- «s/p» y «lám. XII» son páginas reales.
  pages text not null default '',
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, que REVISA RF-903. El requisito justificaba el borrado real de las
  -- puente en que «no tienen etiqueta física ni número citable y basta con
  -- volver a crearlas»; con `pages` dentro, esa premisa no se sostiene: la fila
  -- lleva trabajo de investigación y quién la retiró es traza que interesa. Y
  -- hay una razón de perímetro además de la documental: `rls_default_deny`
  -- lanza excepción ante cualquier política DELETE en `public`, así que el
  -- borrado real de dos tablas exigiría debilitar el guardarraíl que ha cazado
  -- errores reales.
  --
  -- Sin `restored_at`: como en las maestras de vocabulario, una cita que se
  -- vuelve a añadir queda como si nunca se hubiera retirado. La papelera
  -- completa de RF-902 es de las fichas con nombre propio; esta fila se
  -- restaura desde la ficha de la que cuelga y no desde una pantalla de
  -- papelera.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- Una obra citada dos veces en la misma referencia es una sola cita con dos
  -- páginas dentro («34, 51»), no dos filas. La restricción cubre también las
  -- citas retiradas, que es lo que permite que volver a añadir una restaure en
  -- vez de duplicar (ver `cite_artwork`).
  constraint artwork_bibliography_unique unique (catalog_id, bibliography_id)
);

comment on table public.artwork_bibliography is
  'Cita de una obra en una referencia bibliográfica (tabla puente 7 del esquema de campos v11, RF-504). Nada se borra: una cita se retira (RF-517, revisa RF-903).';

comment on column public.artwork_bibliography.pages is
  'Páginas donde aparece la obra en esa referencia. Columna aparte de la nota por ser dato citable de forma exacta (RF-504, v11 v9). Texto: «34-36», «s/p» y «lám. XII» son páginas.';

-- El bloque «Obras citadas» de la ficha bibliográfica (RF-506) se lee por este
-- lado; el bloque de bibliografía de la ficha de obra usa el índice único, que
-- ya empieza por `catalog_id`.
create index artwork_bibliography_reference_idx
  on public.artwork_bibliography (bibliography_id);

create trigger artwork_bibliography_row_audit
  before insert or update on public.artwork_bibliography
  for each row execute function public.tg_row_audit();


-- ── Añadir una cita retirada la RESTAURA ────────────────────
--
-- Con la unicidad cubriendo también las citas retiradas, un `insert` de una
-- pareja que está en la papelera choca contra el índice, y la interfaz
-- convertiría un «Añadir» en una violación de unicidad incomprensible. Es
-- exactamente el caso que `masterTables.test.ts` ya cubre para el vocabulario,
-- y aquí se resuelve en la base para que no dependa de que el cliente lo
-- recuerde.
--
-- Se hace con una función y no con un trigger `before insert` que devuelva
-- `null`: un trigger así deja el `insert` sin filas afectadas, y quien llame
-- desde la API pidiendo la fila creada no recibirá ninguna. La función
-- devuelve siempre la fila, exista ya o no.
--
-- Sin SECURITY DEFINER, como `reorder_provenance_events`: las políticas siguen
-- en vigor y un Lector no escribe aquí. La comprobación explícita solo convierte
-- el silencioso «no ha cambiado nada» en un error legible, y en español porque
-- lo lee ella.
create function public.cite_artwork(
  p_catalog_id text,
  p_bibliography_id uuid,
  p_pages text default '',
  p_note text default ''
)
returns public.artwork_bibliography
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_bibliography;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para citar una obra en una referencia';
  end if;

  insert into public.artwork_bibliography (catalog_id, bibliography_id, pages, note)
  values (p_catalog_id, p_bibliography_id,
          coalesce(p_pages, ''), coalesce(p_note, ''))
  on conflict (catalog_id, bibliography_id) do update
     set active = true,
         -- Lo que no se manda no se borra: añadir una cita que ya existía no
         -- puede vaciar las páginas que alguien investigó, porque el formulario
         -- de «Añadir» viene en blanco. Cambiarlas a vacío es editar la cita,
         -- que es otra operación.
         pages = case when btrim(excluded.pages) <> ''
                      then excluded.pages
                      else artwork_bibliography.pages end,
         note  = case when btrim(excluded.note) <> ''
                      then excluded.note
                      else artwork_bibliography.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.cite_artwork is
  'Añade la cita de una obra en una referencia, o RESTAURA la que estuviera retirada en vez de chocar contra la unicidad (RF-504, RF-517).';


-- ── Lo que la obra gana (RF-218) ────────────────────────────

alter table public.artworks
  add column bibliography_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.bibliography_status is
  'Estado de investigación de la bibliografía de la obra (RF-218). Una obra sin citas registradas no es una obra que nadie ha publicado.';


-- ── «Sin revisar» no es «no», también en bibliografía ───────
--
-- La migración de la procedencia dejó escrito que los grupos siguientes
-- REEMPLAZAN esta función con `create or replace` para añadir su bloque, y que
-- el trigger se declara sin lista de columnas para no tener que recrearlo. Esto
-- es ese reemplazo.
--
-- Se comprueba por las DOS puertas, como allí: ni se declara «investigado sin
-- resultado» en una obra con citas activas, ni se añade o restaura una cita en
-- una obra declarada así.
--
-- `set search_path = public` se repite porque `create or replace` reemplaza la
-- definición entera y con ella su configuración.
--
-- Los `if` que miran `old` van dentro de su propio `if tg_op = 'UPDATE'` por el
-- detalle de plpgsql que la versión anterior documenta: en un trigger de INSERT
-- el registro `old` no está asignado, y una expresión que lo nombre falla
-- aunque el `and` de la izquierda ya sea falso.
create or replace function public.tg_artwork_research_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
declare
  -- En un alta todo es un cambio. En una edición, solo lo que cambia se
  -- comprueba: así una fila que ya estuviera en un estado imposible se puede
  -- arreglar en vez de bloquear cualquier otra edición de la obra.
  v_provenance_changed boolean := true;
  v_bibliography_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      old.provenance_status is distinct from new.provenance_status;
    v_bibliography_changed :=
      old.bibliography_status is distinct from new.bibliography_status;
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

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218). Cubre procedencia y bibliografía; los grupos siguientes añaden su bloque.';

-- La otra puerta. Lo que SÍ se permite, y es intencionado: citas en una obra
-- cuyo estado sigue en «Sin revisar». Tener un dato no es haber hecho la
-- investigación, así que la regla es de un solo sentido.
create function public.tg_artwork_citation_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select bibliography_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'La bibliografía de la obra % consta investigada sin resultado y esta cita la contradice', new.catalog_id
      using hint = 'Cambia antes el estado de la bibliografía a «En curso» o «Completa».';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_citation_status_coherent is
  'La otra puerta de RF-218: no se añade ni se restaura una cita en una obra cuya bibliografía consta investigada sin resultado.';

create trigger artwork_citation_status_coherent
  before insert or update on public.artwork_bibliography
  for each row execute function public.tg_artwork_citation_status_coherent();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE en ninguna de las tres: ni privilegio ni política, nunca (RF-901,
-- RF-517). Retirar una cita es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, estas tablas
-- no las lee ni las escribe nadie con sesión: RLS activado sin política niega.

alter table public.publication_types enable row level security;
alter table public.bibliography enable row level security;
alter table public.artwork_bibliography enable row level security;

revoke all on public.publication_types from anon, authenticated;
revoke all on public.bibliography from anon, authenticated;
revoke all on public.artwork_bibliography from anon, authenticated;

grant select, insert, update on public.publication_types to authenticated;
grant select, insert, update on public.bibliography to authenticated;
grant select, insert, update on public.artwork_bibliography to authenticated;

-- Explícito, como en 20260801140000, 20260804090000 y 20260804100000: en esta
-- plataforma una función nueva nace con EXECUTE para PUBLIC pese al `alter
-- default privileges`, y quien lo caza es `function_privileges.test.sql`.
revoke all on function public.tg_publication_type_deactivation() from public;
revoke all on function public.tg_artwork_citation_status_coherent() from public;
-- `create or replace` conserva los privilegios de la función anterior, pero se
-- repite para que la migración no dependa de ese detalle.
revoke all on function public.tg_artwork_research_status_coherent() from public;

revoke all on function public.cite_artwork(text, uuid, text, text) from public, anon;
grant execute on function public.cite_artwork(text, uuid, text, text) to authenticated;
