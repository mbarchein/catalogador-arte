-- ============================================================
-- The dossier: chosen artworks, in a chosen order, and the PDF that was sent
-- (RF-1600, ADR-011).
--
-- Sending artworks to a gallery is work that is already done and that had no
-- place in the application: photographs downloaded into a folder, pasted into a
-- document, measurements typed by hand. Redoing it without the last two artworks
-- is starting again, and of what was sent in March nothing remains.
--
-- Three tables and a single idea per table:
--
--   dossiers        the record with a name of its own
--   dossier_items   WHAT THE DOSSIER SAYS, in order: artworks and texts
--   dossier_issues  each PDF issued, with its version. APPEND ONLY
--
-- ── ONE LIST AND NOT TWO, WHICH IS THE STRUCTURE ────────────
--
-- The middle table is not «the dossier's artworks»: it is the dossier's
-- CONTENT, and an artwork is one of the two things content can be. The other is
-- a free text — an opening paragraph, the heading that separates the oils from
-- the works on paper, a closing note about availability.
--
-- Two separate tables, one of artworks and one of texts, each with its own
-- order, cannot express «this paragraph goes between the fourth artwork and the
-- fifth», which is the whole point of writing a paragraph in a dossier. One
-- list with a `kind` can, and the order is one order.
--
-- `kind` is an explicit enum and not deduced from «has no `catalog_id`, so it
-- must be a text»: the schema's rule of always distinguishing the datum from its
-- absence, and what allows a third kind — a page break, a full-page photograph —
-- without guessing what a row with everything null meant.
--
-- ── WHAT IS COPIED, AND FROM WHERE ──────────────────────────
--
-- Almost nothing here is new, and that is on purpose:
--
--   * The artwork's line is shaped like `artwork_bibliography`: surrogate key
--     (ADR-007), `catalog_id` with `on update cascade` and no `on delete`
--     because nothing is deleted from `artworks` (RF-901), uniqueness COVERING
--     the withdrawn rows, and a function that turns adding-again into a restore
--     instead of a uniqueness violation.
--   * The order is `images`' one: `sort_order` 1..n assigned on insert by a
--     trigger, and a `reorder_*` function that rewrites the whole list or
--     rewrites nothing. There is no unique index over (dossier, position), also
--     as in `images`: a withdrawn line keeps the number it had, which is dead
--     and harmless, and an index would turn withdrawing a line into a landmine
--     for the next reorder.
--   * The inherited visibility is 20260805130000's and 20260805150000's: an
--     `exists` over the anchor, which goes through the anchor's own policy. A
--     TEXT item hangs from the dossier and from nothing else, so it inherits the
--     dossier's visibility only.
--
-- ── THE PRICE IS ON THE LINE, AND THAT IS THE DECISION ──────
--
-- ADR-011 in one paragraph: a price in `artworks` would be the catalogue
-- affirming what an artwork is worth, with one figure for every interlocutor,
-- and the first time the same painting is offered differently to two galleries
-- one of the two would be a lie. On the line, each dossier says what it said
-- and the catalogue keeps quiet. It is the invoice's rule and the gallery
-- platforms' one.
--
-- Consequence accepted knowingly and written down in the ADR: with the dossier
-- being the team's, a Reader — a consultation account — can open one and read
-- the price asked of a gallery. It is two people and the fund is theirs. The day
-- there is a consultation account for somebody from outside, this gets revised
-- before creating it.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────
--
-- It does not touch the change log: it audits artworks and photographs, and
-- extending it to the fifteen documentary tables plus the links plus these
-- three is its own decision, with the third party's contact datum inside
-- (RF-105). It has its own row in `docs/plan-de-pruebas.md`.
--
-- It does not add a storage policy either: the PDF lives in the private `obras`
-- bucket under a prefix of its own, and the three `storage.objects` policies of
-- 20260726010000 sit over the whole bucket. What is protected here is the row
-- that carries the path, because without it nobody knows what to sign.
-- (`obras` is the bucket's legacy identifier — see CLAUDE.md.)
--
-- Checked against `supabase/tests/dossiers.test.sql`, and the `do` block at the
-- end of this file measures the perimeter inside the very transaction that
-- applies the migration: a table with half a perimeter is the state to avoid.
-- ============================================================


-- ── 1. The dossier ──────────────────────────────────────────

create table public.dossiers (
  -- Surrogate key (ADR-007). It is not the title: two dossiers for the same
  -- gallery two years apart are called the same and both are legitimate.
  id uuid primary key default gen_random_uuid(),

  title text not null,

  -- What it is for, in the user's words («Galería tal, selección de obra sobre
  -- papel»). Free text and not a closed list: the uses that have not appeared
  -- yet are the reason this feature exists, and a list of four values would be
  -- wrong by the second month.
  purpose text not null default '',

  -- The note is the team's, for whoever opens the dossier in a year: «la que se
  -- quedó a medias porque pidieron sólo obra sobre papel». It does NOT go into
  -- the PDF.
  note text not null default '',

  -- The cover's text, which DOES go into the PDF and is the only free text that
  -- is not an item: a cover is a page, not something that flows between two
  -- artworks. Empty is a legitimate answer and the most frequent one — a cover
  -- with the title and the date, and nothing else.
  cover_text text not null default '',

  -- Who it goes to, reusing the master table of people and institutions
  -- (RF-508). Nullable, because a dossier is often armed before knowing to whom
  -- it is going. `restrict` for the reason of the rest of the schema: nobody has
  -- DELETE, and if a row were ever deleted by hand this warns instead of leaving
  -- the dossier pointing at nothing.
  recipient_party_id uuid references public.parties (id) on delete restrict,

  -- What the PDF shows. They are per dossier because that is the question that
  -- gets asked: a gallery wants the exhibition history, an insurer the
  -- measurements and the condition.
  --
  -- The three that default to FALSE do so for a reason and not out of caution
  -- theatre: the provenance carries the names of private owners, the prices are
  -- the figure asked of somebody, and the bibliography is normally noise outside
  -- research. Showing them is a decision that gets taken; hiding them is not one
  -- that gets forgotten.
  show_provenance boolean not null default false,
  show_exhibitions boolean not null default true,
  show_bibliography boolean not null default false,
  show_prices boolean not null default false,

  -- RF-804: complete traceability, stamped by `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 and RF-902: a record with a name of its own has the complete
  -- wastebasket, with the trace of the last withdrawal and of the last
  -- restoration.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- A dossier with no title cannot be found again, which is the only reason to
  -- save one.
  constraint dossiers_title_not_blank check (btrim(title) <> '')
);

comment on table public.dossiers is
  'Dossier: selección de obras con nombre propio, en un orden elegido, de la que se emiten PDF (RF-1601, ADR-011). Nada se borra, se retira.';

comment on column public.dossiers.purpose is
  'Para qué es el dossier, en palabras de la usuaria. Texto libre y no una lista cerrada: los usos que no han aparecido todavía son el motivo de esta función.';
comment on column public.dossiers.recipient_party_id is
  'A quién va, de la tabla de personas e instituciones (RF-508). Nulo: un dossier se arma antes de saber a quién se manda.';
comment on column public.dossiers.show_prices is
  'Si el PDF enseña los precios de las líneas. Por omisión no: un precio es la cifra que se pidió a alguien.';

-- WITHOUT uniqueness over the title, following `bibliography`'s precedent: two
-- different dossiers are called the same and duplicates are resolved by the
-- team's review (RF-909).

create index dossiers_active_idx on public.dossiers (active);
create index dossiers_recipient_idx on public.dossiers (recipient_party_id);

create trigger dossier_row_audit
  before insert or update on public.dossiers
  for each row execute function public.tg_row_audit();


-- ── 2. What the dossier says, in order ──────────────────────

-- Two kinds today and room for a third without another enum: `PAGE_BREAK` and a
-- full-page photograph are the two that will be asked for, and they are items of
-- the same list.
create type public.dossier_item_kind as enum ('ARTWORK', 'TEXT');

comment on type public.dossier_item_kind is
  'Qué es un elemento del dossier: una obra del catálogo o un texto libre (RF-1602, RF-1614).';

create table public.dossier_items (
  id uuid primary key default gen_random_uuid(),

  dossier_id uuid not null references public.dossiers (id) on delete restrict,

  kind public.dossier_item_kind not null default 'ARTWORK',

  -- `artwork_bibliography`'s shape: `on update cascade` because the cataloguing
  -- identifier is text, and no `on delete` because nothing is deleted from
  -- `artworks` (RF-901). Null on a TEXT item, which is what the constraints
  -- below force.
  catalog_id text references public.artworks (catalog_id) on update cascade,

  -- THE FREE TEXT (RF-1614). Two columns and not one, for `artwork_bibliography`'s
  -- reason: a heading and a paragraph are typeset differently and get searched
  -- differently, and merging them would mean inventing a format inside the
  -- format — a first line that means «title» is exactly the kind of convention
  -- nobody remembers a year later.
  --
  -- Either of the two on its own is a legitimate item: a bare heading separates
  -- two blocks of artworks, and a bare paragraph opens the dossier.
  heading text not null default '',
  body text not null default '',

  -- Position within the dossier, 1..n over the active items. Assigned on insert
  -- by `tg_assign_dossier_item_order` and rearranged by
  -- `reorder_dossier_items`, all or nothing.
  sort_order integer not null,

  -- WHICH PHOTOGRAPH. Null means «the artwork's representative one» (RF-403),
  -- which is what is wanted almost always and what goes on being true if the
  -- main photograph is changed tomorrow. Fixing a shot — the signature detail,
  -- the back — is choosing one, and the trigger below checks that it belongs to
  -- that artwork: a line pointing at another artwork's photograph would put a
  -- different painting into the PDF, which is the kind of mistake that is
  -- discovered by the person who receives it.
  image_id text references public.images (image_id) on update cascade,

  -- THE PRICE IS OF THE DOSSIER AND NOT OF THE ARTWORK (ADR-011). Null is «no
  -- price», which is not zero: zero would be a price of nothing. The currency
  -- has a default so that the client does not have to send it, and one with no
  -- price is harmless.
  price numeric(12, 2),
  currency text not null default 'EUR',

  -- The team's note about this line («la que pidieron ver de cerca»). It does not
  -- go into the PDF, unlike `body`: that is the difference between the two.
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517: the item carries work — a paragraph, a price — so it is withdrawn and
  -- not deleted. With no `restored_at`, as in the bridge tables: an item that is
  -- added again is left as if it had never been withdrawn, and it is restored
  -- from the dossier it hangs from and not from a wastebasket screen.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- The same artwork twice in one dossier is not two items. Covering the
  -- withdrawn ones, which is what lets adding it again restore instead of
  -- colliding (see `add_artwork_to_dossier`).
  --
  -- The TEXT items are not affected even though they are in the same index:
  -- their `catalog_id` is null and Postgres counts nulls as distinct, so a
  -- dossier can carry as many paragraphs as it likes. That is exactly why the
  -- constraint can stay a plain one instead of a partial index, and why
  -- `on conflict (dossier_id, catalog_id)` goes on inferring it.
  constraint dossier_items_unique unique (dossier_id, catalog_id),

  constraint dossier_items_order_positive check (sort_order >= 1),

  -- THE TWO KINDS, EACH WITH ITS OWN SHAPE. Without this, a row with everything
  -- null would be a valid item that the PDF cannot draw, and a text with a price
  -- would be a price nobody would ever see. What cannot be saved cannot be a bug
  -- later.
  constraint dossier_items_artwork_shape check (
    kind <> 'ARTWORK' or (
      catalog_id is not null
      and heading = '' and body = ''
    )
  ),
  constraint dossier_items_text_shape check (
    kind <> 'TEXT' or (
      catalog_id is null and image_id is null
      and price is null
      -- A text with neither heading nor paragraph is a blank space, and a blank
      -- space is not something anybody meant to add.
      and (btrim(heading) <> '' or btrim(body) <> '')
    )
  ),

  -- Zero is not a price and a negative one is a typo.
  constraint dossier_items_price_positive check (price is null or price > 0),

  -- ISO 4217, three capitals. It is not a master table because there is no list
  -- to maintain: it is a code, and the day a second currency is needed the value
  -- changes and nothing else does.
  constraint dossier_items_currency_shape check (currency ~ '^[A-Z]{3}$')
);

comment on table public.dossier_items is
  'Lo que dice un dossier, en orden: obras del catálogo y textos libres (RF-1602, RF-1603, RF-1614). Una sola lista, porque un párrafo va entre dos obras. Nada se borra: un elemento se retira.';

comment on column public.dossier_items.kind is
  'Obra o texto. Explícito y no deducido de que no haya obra: un elemento vacío tenía que ser imposible de guardar, no un caso que adivinar.';
comment on column public.dossier_items.sort_order is
  'Posición del elemento dentro del dossier, 1..n sobre los activos. La asigna la base al añadir y la reescribe reorder_dossier_items.';
comment on column public.dossier_items.heading is
  'Rótulo de un texto libre («Óleos, 1962-1968»). Aparte del cuerpo porque se maqueta y se busca distinto (RF-1614).';
comment on column public.dossier_items.body is
  'Párrafo de un texto libre. Va al PDF, al contrario que la nota, que es del equipo (RF-1614).';
comment on column public.dossier_items.image_id is
  'Fotografía elegida. Nulo es «la representativa de la obra» (RF-403), que es lo que se quiere casi siempre y sigue siendo verdad si mañana cambia la principal.';
comment on column public.dossier_items.price is
  'Precio de esta obra EN ESTE DOSSIER (RF-1604). El catálogo no afirma ningún precio: la misma obra se ofrece distinto en dos sitios. Nulo es «sin precio», que no es cero.';

create index dossier_items_dossier_order_idx
  on public.dossier_items (dossier_id, sort_order);
-- «In which dossiers is this artwork» is read from the artwork's record.
create index dossier_items_catalog_idx on public.dossier_items (catalog_id);
create index dossier_items_image_idx on public.dossier_items (image_id);

create trigger dossier_item_row_audit
  before insert or update on public.dossier_items
  for each row execute function public.tg_row_audit();


-- A new artwork goes LAST, never into the middle of an order somebody arranged.
-- It is `tg_assign_image_sort_order` with another table's name, and it counts
-- over all the lines and not only the active ones: reusing the number of a
-- withdrawn line would put the new artwork in the middle.
create function public.tg_assign_dossier_item_order()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1
      into new.sort_order
      from public.dossier_items
     where dossier_id = new.dossier_id;
  end if;
  return new;
end $$;

comment on function public.tg_assign_dossier_item_order is
  'Una obra añadida a un dossier va al final, nunca en medio de un orden que alguien colocó (RF-1603).';

-- BEFORE the audit trigger, by name: `tg_row_audit` does not look at
-- `sort_order`, so the order between the two is indifferent today and this
-- comment is here so that it goes on being indifferent on purpose and not by
-- luck. Postgres fires the row triggers of the same event in alphabetical
-- order.
create trigger dossier_item_assign_order
  before insert on public.dossier_items
  for each row execute function public.tg_assign_dossier_item_order();


-- The fixed shot has to be OF THAT ARTWORK. It cannot be a `check`, which does
-- not see other rows, and it is not a composite foreign key either: `images`
-- has no unique key over (image_id, catalog_id) and adding one to a table with
-- data for this is more than what is being asked.
create function public.tg_dossier_item_image_matches()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.image_id is not null
     and not exists (
       select 1 from public.images
        where image_id = new.image_id
          and catalog_id = new.catalog_id
     ) then
    raise exception 'La fotografía % no es de la obra %', new.image_id, new.catalog_id
      using hint = 'Elige una fotografía de esa obra, o déjalo en la representativa.';
  end if;
  return new;
end $$;

comment on function public.tg_dossier_item_image_matches is
  'La toma fijada en una línea del dossier tiene que ser de esa obra (RF-1605): otra metería un cuadro distinto en el PDF.';

create trigger dossier_item_image_matches
  before insert or update of image_id, catalog_id on public.dossier_items
  for each row execute function public.tg_dossier_item_image_matches();


-- ── 3. Adding an artwork RESTORES its withdrawn item ────────
--
-- It is `cite_artwork`'s case, letter by letter: with the uniqueness covering
-- the withdrawn items, an `insert` of a pair that is in the wastebasket clashes
-- against the index and the interface would turn an «Añadir» into an
-- incomprehensible uniqueness violation.
--
-- A function and not a `before insert` trigger returning `null`: a trigger like
-- that leaves the `insert` with no affected rows, and whoever calls from the API
-- asking for the created row receives none.
--
-- With no SECURITY DEFINER: the policies stay in force and a Reader does not
-- write here. The explicit check only turns the silent «nothing has changed»
-- into a legible error, in Spanish because she reads it.
create function public.add_artwork_to_dossier(
  p_dossier_id uuid,
  p_catalog_id text,
  p_note text default '',
  p_price numeric default null,
  p_image_id text default null
)
returns public.dossier_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.dossier_items;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir obras a un dossier';
  end if;

  insert into public.dossier_items (dossier_id, catalog_id, note, price, image_id)
  values (p_dossier_id, p_catalog_id, coalesce(p_note, ''), p_price, p_image_id)
  on conflict (dossier_id, catalog_id) do update
     set active = true,
         -- Restoring an item brings back the position it had, which is dead while
         -- the item is withdrawn: it is put back at the end so that the artwork
         -- appears where it was just added and not where it was a month ago.
         --
         -- The subquery's table is ALIASED, and it is the same trap as in
         -- `reorder_dossier_items`: without the alias, `dossier_items.id`
         -- inside the subquery resolves to the subquery's own row instead of the
         -- conflicting one, the comparison becomes `id <> id`, the set comes out
         -- empty and every restored item lands on position 1 — on top of whatever
         -- was already there. Measured, not feared.
         sort_order = (select coalesce(max(d.sort_order), 0) + 1
                         from public.dossier_items d
                        where d.dossier_id = p_dossier_id
                          and d.id <> dossier_items.id),
         -- What is not sent is not deleted: adding an artwork that was already
         -- there cannot empty the note or the price somebody wrote, because the
         -- «Añadir» form comes in blank. Emptying them is editing the item,
         -- which is another operation.
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else dossier_items.note end,
         price = coalesce(excluded.price, dossier_items.price),
         image_id = coalesce(excluded.image_id, dossier_items.image_id)
  returning * into v_row;

  return v_row;
end $$;

comment on function public.add_artwork_to_dossier is
  'Añade una obra a un dossier, o RESTAURA la línea que estuviera retirada en vez de chocar contra la unicidad, conservando su nota y su precio (RF-1602, RF-1612).';


-- ── 3 bis. Adding a text (RF-1614) ──────────────────────────
--
-- Its sibling, and it is deliberately simpler: a text has no uniqueness — the
-- same paragraph can be written twice in one dossier and that is nobody's
-- mistake — so there is no `on conflict` and nothing to restore. It exists at all
-- so that the two ways of adding read the same from the interface and so that the
-- permission is checked in the same place.
create function public.add_text_to_dossier(
  p_dossier_id uuid,
  p_heading text default '',
  p_body text default ''
)
returns public.dossier_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.dossier_items;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir textos a un dossier';
  end if;

  -- Said before the constraint says it: `dossier_items_text_shape` would reject
  -- this with the name of a constraint, and what the user reads has to be a
  -- sentence.
  if btrim(coalesce(p_heading, '')) = '' and btrim(coalesce(p_body, '')) = '' then
    raise exception 'Un texto sin rótulo ni párrafo no dice nada'
      using hint = 'Escribe al menos una de las dos cosas.';
  end if;

  insert into public.dossier_items (dossier_id, kind, heading, body)
  values (p_dossier_id, 'TEXT', coalesce(p_heading, ''), coalesce(p_body, ''))
  returning * into v_row;

  return v_row;
end $$;

comment on function public.add_text_to_dossier is
  'Añade un texto libre al final de un dossier: un rótulo, un párrafo o los dos (RF-1614).';


-- ── 4. Rearranging, all or nothing (RF-1603) ────────────────
--
-- `reorder_images`' function with another table's name and the same three
-- checks, because the failure it avoids is the same one: a half-applied order is
-- worse than a rejected one. No SECURITY DEFINER, for the reason written there.
create function public.reorder_dossier_items(p_dossier_id uuid, p_line_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_active integer;
  v_given integer := coalesce(array_length(p_line_ids, 1), 0);
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para reordenar los elementos de un dossier';
  end if;

  -- A repeated identifier would pass the count check below and leave two items
  -- fighting for one position.
  if v_given <> (select count(distinct t.line_id) from unnest(p_line_ids) as t(line_id)) then
    raise exception 'La lista de elementos tiene identificadores repetidos';
  end if;

  -- The list must be EXACTLY the dossier's active items. A stale client —
  -- somebody else added or withdrew an artwork meanwhile — would otherwise leave
  -- items out of the order or drag in another dossier's.
  select count(*) into v_active
    from public.dossier_items
   where dossier_id = p_dossier_id and active;

  if v_active <> v_given then
    raise exception 'La lista de elementos no coincide con la del dossier';
  end if;

  -- The alias is `line_id` and not `id`, which is not a matter of taste: inside a
  -- subquery over `dossier_items`, an unqualified `id` resolves to the table's
  -- own column and the comparison would be a tautology that lets another
  -- dossier's items through.
  if exists (
    select 1 from unnest(p_line_ids) as t(line_id)
    where not exists (
      select 1 from public.dossier_items
       where dossier_items.id = t.line_id
         and dossier_items.dossier_id = p_dossier_id
         and dossier_items.active
    )
  ) then
    raise exception 'Algún elemento no pertenece a este dossier';
  end if;

  update public.dossier_items d
     set sort_order = p.position
    from (
      select line_id, ordinality as position
        from unnest(p_line_ids) with ordinality as t(line_id, ordinality)
    ) p
   where d.id = p.line_id
     and d.sort_order is distinct from p.position;
end $$;

comment on function public.reorder_dossier_items is
  'Reordena los elementos de un dossier al orden dado, todo o nada (RF-1603).';


-- ── 5. Each PDF issued, and it is APPEND ONLY (RF-1607) ─────
--
-- The two questions that get asked are different and each one is answered by
-- one half of this design: «mándalo otra vez con los datos al día» by the live
-- references of the table above, and «qué le mandé en marzo» by this table. The
-- issued document IS the frozen copy, which is why the artworks' data is not
-- duplicated in here: that would be a second catalogue, wrong from the first
-- time the two stopped matching.
--
-- WHY THE ROW IS ONLY EVER WRITTEN ONCE. The order of the operations is: the PDF
-- is generated, it is uploaded, and only then is this row inserted with its path
-- and its size. So there is nothing to correct afterwards, and forbidding the
-- update is free. What that order does cost is an orphan file in the store if
-- the insert fails after the upload — a few megabytes nobody references, which
-- is a much cheaper failure than a row promising a version that was never sent.

create table public.dossier_issues (
  id uuid primary key default gen_random_uuid(),

  dossier_id uuid not null references public.dossiers (id) on delete restrict,

  -- 1, 2, 3… per dossier. Assigned by the base and never by the client, which is
  -- the same reason the cataloguing identifier is (ADR-003): two people issuing
  -- at the same time would both compute «the next one».
  version integer not null,

  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles (id),

  -- Where the PDF is, in the private `obras` bucket under its own prefix.
  file_path text not null,
  file_bytes bigint,

  -- What this version was for («la que se mandó sin los dos dibujos»).
  note text not null default '',

  constraint dossier_issues_version_unique unique (dossier_id, version),
  constraint dossier_issues_version_positive check (version >= 1),

  -- The prefix is part of the perimeter and not tidiness: the path is what gets
  -- signed, and a row pointing at `AR-0001/x_master.jpg` would turn a dossier
  -- into a way of getting a signature for a master.
  constraint dossier_issues_path_shape check (
    file_path like 'dossiers/%'
    and file_path like '%.pdf'
    and file_path = btrim(file_path)
    and length(file_path) > length('dossiers/.pdf')
  ),

  -- A zero-byte PDF is not a PDF. Null is «not measured», which is a datum.
  constraint dossier_issues_bytes_positive check (file_bytes is null or file_bytes > 0)
);

comment on table public.dossier_issues is
  'Cada PDF emitido de un dossier, con su versión (RF-1607). Solo se añade: una versión emitida no se reescribe ni se borra nunca, porque el fichero ya está en el correo de otra persona.';

comment on column public.dossier_issues.version is
  'La primera, la segunda… La asigna la base y nunca el cliente: dos personas emitiendo a la vez calcularían las dos «la siguiente».';
comment on column public.dossier_issues.file_path is
  'Ruta del PDF en el almacén privado, bajo el prefijo dossiers/. Es lo que se firma para descargarlo (RF-110).';

create index dossier_issues_dossier_idx
  on public.dossier_issues (dossier_id, version desc);

-- The version and the author are stamped by the base, and what the client sends
-- in those two columns is ignored. The lock is per dossier and for the length of
-- the transaction, which is `tg_assign_image_id`'s idiom: without it two
-- simultaneous issues read the same maximum and the second one dies against the
-- unique index — correct, but with an error nobody can read.
create function public.tg_stamp_dossier_issue()
returns trigger language plpgsql
set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('dossier_issue:' || new.dossier_id::text));

  select coalesce(max(version), 0) + 1
    into new.version
    from public.dossier_issues
   where dossier_id = new.dossier_id;

  new.issued_at := now();
  new.issued_by := auth.uid();
  return new;
end $$;

comment on function public.tg_stamp_dossier_issue is
  'Pone la versión, la fecha y el autor de una emisión: los tres los dice la base y no el cliente (RF-1607).';

create trigger stamp_dossier_issue
  before insert on public.dossier_issues
  for each row execute function public.tg_stamp_dossier_issue();


-- The padlock the RLS does not give. RLS does not apply to the table's owner,
-- nor to `service_role`, nor to `postgres`; triggers do. It is
-- `tg_change_log_append_only` with one difference written on purpose: THE INSERT
-- IS NOT LOCKED, because here inserting is the legitimate operation — issuing.
-- What must never happen is a version changing or disappearing after it left in
-- an email.
create function public.tg_dossier_issue_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Una versión emitida de un dossier no se cambia ni se borra: el fichero ya está mandado'
    using hint = 'Emite otra versión con los datos corregidos.';
end $$;

comment on function public.tg_dossier_issue_append_only is
  'Rechaza update, delete y truncate sobre las emisiones, también para el propietario de la tabla, que es la vía que la RLS no cierra (RF-1607).';

create trigger dossier_issue_append_only
  before update or delete on public.dossier_issues
  for each statement execute function public.tg_dossier_issue_append_only();

create trigger dossier_issue_no_truncate
  before truncate on public.dossier_issues
  for each statement execute function public.tg_dossier_issue_append_only();


-- ── 6. A party that is a recipient is not withdrawn ─────────
--
-- The fourth check of `tg_party_deactivation`, with the reason of the other
-- three: withdrawing it does not withdraw it, it leaves the catalogue pointing
-- at something the interface no longer offers. A dossier in the wastebasket does
-- not count, as in the others.
--
-- `set search_path = public` is repeated because `create or replace` replaces
-- the whole definition and with it its configuration.
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

    if exists (
      select 1 from public.dossiers
       where recipient_party_id = new.id and active
    ) then
      raise exception 'No se puede retirar una parte que es el destinatario de un dossier'
        using hint = 'Cambia antes el destinatario de esos dossieres, o retíralos.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_party_deactivation is
  'Impide retirar una parte que sostiene un eslabón de procedencia activo, que es titular de derechos, que está detrás de una sede activa o que es destinataria de un dossier activo (RF-508, RF-1601).';


-- ── 7. RLS, privileges and policies ─────────────────────────
--
-- Revoked first and granted afterwards, one by one: the platform grants by
-- default all the privileges of every new table to the anonymous and
-- authenticated roles, `delete` included (RF-113).
--
-- The shape is `artworks`' one, which has been there since the first migration:
--
--   select  ->  ((active and can_read()) or can_edit())  + the anchor's visibility
--   insert  ->  can_edit()
--   update  ->  can_edit()
--   delete  ->  DOES NOT EXIST, for any role
--
-- `dossier_issues` has no update policy either, and that is the whole point of
-- the table (RF-1607). It is two barriers in series with the padlock above: the
-- policy closes it for the session, the trigger for whoever skips the RLS.
--
-- THE INHERITED VISIBILITY, which is 20260805130000's criterion written the same
-- way:
--
--   * a line of a withdrawn dossier is not seen by the Reader, and is seen by
--     whoever edits — restoring a dossier has to give it back with its artworks
--     inside (RF-905);
--   * a line whose ARTWORK is in the wastebasket is not seen by the Reader
--     either (RF-609, RF-1613), and it is not removed from the dossier: it was
--     in the document that was sent, and that is a datum. Whoever edits sees it
--     and the screen has to SAY that it is withdrawn.

alter table public.dossiers enable row level security;
alter table public.dossier_items enable row level security;
alter table public.dossier_issues enable row level security;

revoke all on public.dossiers from anon, authenticated;
revoke all on public.dossier_items from anon, authenticated;
revoke all on public.dossier_issues from anon, authenticated;

grant select, insert, update on public.dossiers to authenticated;
grant select, insert, update on public.dossier_items to authenticated;
-- No UPDATE here, and it is not an oversight: see the padlock above.
grant select, insert on public.dossier_issues to authenticated;

create policy dossiers_select on public.dossiers
  for select using (
    (active and public.can_read())
    or public.can_edit()
  );

create policy dossiers_insert on public.dossiers
  for insert with check (public.can_edit());

create policy dossiers_update on public.dossiers
  for update using (public.can_edit()) with check (public.can_edit());

create policy dossier_items_select on public.dossier_items
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.dossiers d
       where d.id = dossier_items.dossier_id
    )
    -- The artwork's visibility is inherited only by the items that HAVE an
    -- artwork. Without the first branch a TEXT item —whose `catalog_id` is null,
    -- so the `exists` is false— would be invisible to everybody including its
    -- author, which is the way this closure fails if it is copied without
    -- thinking.
    and (
      dossier_items.catalog_id is null
      or exists (
        select 1 from public.artworks a
         where a.catalog_id = dossier_items.catalog_id
      )
    )
  );

create policy dossier_items_insert on public.dossier_items
  for insert with check (public.can_edit());

create policy dossier_items_update on public.dossier_items
  for update using (public.can_edit()) with check (public.can_edit());

-- The issues have no `active`: nothing is withdrawn here either, and there is
-- nothing to withdraw. They inherit the dossier's visibility and nothing else.
create policy dossier_issues_select on public.dossier_issues
  for select using (
    (public.can_read() or public.can_edit())
    and exists (
      select 1 from public.dossiers d
       where d.id = dossier_issues.dossier_id
    )
  );

create policy dossier_issues_insert on public.dossier_issues
  for insert with check (public.can_edit());


-- ── 8. Function privileges ──────────────────────────────────
--
-- Explicit, as in the rest of the schema: on this platform a new function is
-- born with EXECUTE for PUBLIC despite the `alter default privileges`, and what
-- catches it is `function_privileges.test.sql`.

revoke all on function public.tg_assign_dossier_item_order() from public;
revoke all on function public.tg_dossier_item_image_matches() from public;
revoke all on function public.tg_stamp_dossier_issue() from public;
revoke all on function public.tg_dossier_issue_append_only() from public;
-- `create or replace` keeps the previous function's privileges, but it is
-- repeated so that the migration does not depend on that detail.
revoke all on function public.tg_party_deactivation() from public;

revoke all on function public.add_artwork_to_dossier(uuid, text, text, numeric, text)
  from public, anon;
grant execute on function public.add_artwork_to_dossier(uuid, text, text, numeric, text)
  to authenticated;

revoke all on function public.add_text_to_dossier(uuid, text, text) from public, anon;
grant execute on function public.add_text_to_dossier(uuid, text, text) to authenticated;

revoke all on function public.reorder_dossier_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_dossier_items(uuid, uuid[]) to authenticated;


-- ── 9. The perimeter, measured inside this transaction ──────
--
-- Neither ornament nor the same thing as the test: this runs INSIDE the
-- transaction that applies the migration, so if something does not add up the
-- migration is not applied half way. The test alongside measures it again from
-- outside and besides attacks the base with each role's session, which is the
-- only thing that verifies for real.

do $$
declare
  -- Table, expected policies, expected privileges of `authenticated`. The
  -- issues' row is the one that carries the decision: two policies and two
  -- privileges, with no UPDATE anywhere (RF-1607).
  v_expected constant text[][] := array[
    array['dossiers',         'INSERT, SELECT, UPDATE', 'INSERT,SELECT,UPDATE'],
    array['dossier_items', 'INSERT, SELECT, UPDATE', 'INSERT,SELECT,UPDATE'],
    array['dossier_issues',   'INSERT, SELECT',         'INSERT,SELECT']
  ];
  v_table text;
  v_policies text;
  v_privs text;
  i integer;
begin
  for i in 1 .. array_length(v_expected, 1) loop
    v_table := v_expected[i][1];

    -- RLS enabled. Without this, the policies are decoration.
    if not (select c.relrowsecurity
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = v_table) then
      raise exception 'FAIL: public.% no tiene RLS activado', v_table;
    end if;

    select coalesce(string_agg(distinct cmd::text, ', ' order by cmd::text), '(ninguna)')
      into v_policies
      from pg_policies
     where schemaname = 'public' and tablename = v_table;

    if v_policies <> v_expected[i][2] then
      raise exception 'FAIL: public.% debería tener las políticas [%], tiene [%]',
        v_table, v_expected[i][2], v_policies;
    end if;

    -- The anonymous role, not one privilege. `column_privileges` and not only
    -- `role_table_grants`, because a `grant update (column)` does not show up in
    -- the second: it would be a one-column hole, invisible from where one
    -- usually looks.
    if exists (select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = v_table
                  and grantee = 'anon') then
      raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre public.%', v_table;
    end if;

    select string_agg(distinct privilege_type, ',' order by privilege_type)
      into v_privs
      from information_schema.column_privileges
     where table_schema = 'public' and table_name = v_table
       and grantee = 'authenticated';

    if v_privs is distinct from v_expected[i][3] then
      raise exception 'FAIL: el rol autenticado debería tener [%] sobre public.%, tiene [%]',
        v_expected[i][3], v_table, coalesce(v_privs, '(ninguno)');
    end if;
  end loop;

  -- The three padlocks of the issues, by name: two triggers over the table and
  -- the one that stamps the version.
  if (select count(*) from pg_trigger
       where tgrelid = 'public.dossier_issues'::regclass
         and not tgisinternal) <> 3 then
    raise exception 'FAIL: dossier_issues debería tener tres triggers: el sello y los dos candados';
  end if;

  raise notice 'OK: las tres tablas del dossier tienen RLS, sus políticas y los privilegios justos';
end $$;
