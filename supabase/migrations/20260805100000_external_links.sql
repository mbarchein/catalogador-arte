-- ============================================================
-- Links to external sites (RF-1401 to RF-1408).
--
-- Today a web address that documents an artwork has only one place where it can fit:
-- inside a note. There it cannot be clicked, it cannot be searched, it cannot be
-- checked and it cannot be attributed to the photograph that came out of it. And it is not
-- hypothetical: two inventory notes of the dump carry inside the address of
-- the MACVA record from which all the data were taken, image included.
--
-- ── WHY A TABLE OF ITS OWN AND NOT A COLUMN IN ANOTHER ──────
--
-- NOT a `url` column in `archive_documents`. It is not a question of form but of
-- nature. An archive document is a file we are custodians of: it
-- lives in the private bucket, it is served with a signed URL (RF-110, RNF-111), it has
-- a size and a MIME type, and RNF-112's 3-2-1 rule applies to it. A link is the
-- opposite: a third party's content that can change, move or disappear
-- with no warning, of which no backup can be made and whose life cycle
-- is expiry. Merging them would turn the file's all-or-nothing `check`
-- into a disjunction of two sets of columns alien to each other, would leave
-- half the columns null in each case, would force every permanence rule of the
-- document to carry the clause «unless it is a link» written in,
-- and would drag along vocabularies that do not apply: a museum page has no
-- document type and no archival series.
--
-- NOT a bridge table. The project's glossary defines a bridge table as the one that
-- models a datum depending on the combination of two entities and not belonging
-- naturally to either of the two separately. A link's title, its
-- type, its note and its check state belong to the link, and the link
-- belongs to a record: the criterion does not apply. The documents' bridge exists
-- so as not to duplicate an 8 MB PDF between three artworks; an eighty-character
-- URL is not duplicated, it is written again, and each copy gains its own
-- note. The case that would justify it —the press clipping of a group show,
-- repeated in fifteen artworks— is resolved by anchoring the link TO THE EXHIBITION, which
-- is besides the honest datum: the article is about the exhibition and not about each
-- painting. That anchor arrives in its own migration, when the documentary catalogue
-- raisonné is closed.
--
-- NOT a polymorphic foreign key. In PostgreSQL it cannot be declared: it would let in
-- rows pointing at non-existent artworks, the `restrict` could not be expressed and the
-- SELECT policy would have to branch by type without being able to lean on
-- the parent table's policy. The EXCLUSIVE ARC is used: one foreign-key column
-- declared per anchor, nullable, and a `check` that there is exactly one
-- not null. An accepted and written cost: adding an anchor forces redoing the `check`
-- in a new migration.
--
-- ── WHAT THIS MIGRATION DOES NOT CARRY, AND WHY ─────────────
--
-- Written down so that it is not added six months from now with no argument:
--
--  * No `sort_order`: there are four links per record, the order is by type and by
--    creation date, and reordering by hand has been asked for by nobody.
--  * No publication in `supabase_realtime`: the live views' own
--    migration says that publishing more than needed is not free, and a link is added by the same
--    person who is looking at the record. Adding it afterwards is one line.
--  * No entry in the wastebasket (RF-906): a link is not one of the six records
--    with an identifier of their own from RF-901.
--  * No URL normalisation, no crawler, no download of the icon, title or
--    preview of the linked site — that would leak to a third party which artwork
--    is being catalogued and from which address, and would turn a link into
--    embedded content (RF-1404).
--  * No shorteners, neither generated nor resolved: a shortener hides where
--    the link goes, which is the opposite of showing the domain.
--  * No PWA *share target*. It would be the perfect gesture on the phone and it is a
--    delivery in itself —a manifest, a landing route and an artwork selector—;
--    it is noted as the first thing to consider if adding links becomes
--    frequent.
-- ============================================================


-- ── Two enumerated types, and why they are not master tables ──
--
-- The criterion that separates an enumerated type from a master table in this schema is who
-- owns the entries. The places, the artwork types and the series are tables
-- because the cataloguer invents them and renames them; these are written by the
-- schema, and nobody renames «Prensa» nor reorganises it into a tree. That is why they do not
-- need a maintenance screen.

create type public.external_link_type as enum (
  'MUSEUM_PAGE',     -- Página de museo
  'ONLINE_CATALOG',  -- Catálogo en línea
  'ART_DATABASE',    -- Base de datos de arte
  'PRESS',           -- Prensa
  'VIDEO',           -- Vídeo
  'ARTIST_SITE',     -- Sitio del artista
  'PHOTO_SOURCE',    -- De dónde salió una reproducción
  'OTHER'            -- Se miró y no encaja en ninguno
);

-- AUCTION_RECORD is left out on purpose until somebody needs it: adding
-- a value is `alter type ... add value` in a new migration —with the warning
-- that the new value cannot be used in the same transaction that creates it— and
-- removing it cannot be done.
comment on type public.external_link_type is
  'Clase de sitio enlazado. Enumerado y no tabla maestra: la línea que las separa en este esquema es quién es dueño de las entradas. Los lugares, los tipos de obra y las series son tablas porque la catalogadora las inventa y las renombra; estos los escribe el esquema, nadie renombra «Prensa» ni los reorganiza en un árbol. Nulo es «sin clasificar» y OTHER es «se miró y no encaja»: no son lo mismo (RF-1402).';

create type public.link_check_status as enum (
  'WORKING',  -- Funciona
  'CHANGED',  -- Carga, pero ya no muestra lo que documentaba
  'BROKEN'    -- Ya no está
);

comment on type public.link_check_status is
  'Resultado de comprobar un enlace a mano. Tres valores y no dos: «ha cambiado» —la página carga pero ya no muestra lo que documentaba— es justo lo que ningún rastreador detectaría. El cuarto estado es el nulo: sin comprobar no es roto (RF-1405).';

-- Explicit, as in the colour's migration: on this platform it is worth revoking
-- first and granting afterwards, one by one.
revoke all on type public.external_link_type from public;
revoke all on type public.link_check_status  from public;

grant usage on type public.external_link_type to authenticated;
grant usage on type public.link_check_status  to authenticated;


-- ── The address validation (RF-1403) ────────────────────────
--
-- This is the only line in the system that says NO to an address, and it is a
-- real security risk and not a convenience: there is no backend, the anonymous key
-- travels in the client, and whatever goes into this column will end up inside an
-- `href` in the record the whole team sees. The check lives in the base
-- because it is the last line and it cannot be got round by attacking the API; the application
-- applies exactly the same rule before saving, but only so as to be able to
-- explain the rejection in Spanish.
--
-- Predicate by predicate, because whoever reads them a year from now has to be able to
-- decide whether they can touch them:
--
--  1. `btrim` — « javascript:alert(1)» with a space in front is executed by the
--     browser, which trims, and it is let through by any naive comparison that
--     does not trim first. Here the datum is not trimmed: it is REJECTED, so that what
--     is stored is identical to what was validated.
--  2. Length between 11 (`http://a.bc`) and 2048, which is the browsers' practical
--     limit: beyond that it is an accidental paste and not an address.
--  3. No spaces and no control characters IN ANY POSITION: `java<tab>script:`
--     and `java<nl>script:` have been executed by real browsers, and no
--     legitimate address carries them unescaped.
--  4. A WHITELIST of schemes and not a blacklist: it starts with `http://` or
--     `https://`, compared in lower case. It rejects in one go `javascript:`,
--     `data:`, `vbscript:`, `file:`, `blob:`, `intent:`, `mailto:`, `tel:` and everything
--     invented afterwards, as well as the protocol-relative form
--     `//evil.example`. A blacklist would have to be extended every time
--     a new scheme appears.
--     `http` is admitted as well as `https` and it is deliberate: there are museums and regional
--     archives with no encryption, and if their address does not fit in the table it will end up inside
--     a note, which is the failure all this exists to end. What
--     decides the security is not the destination's encryption but this whitelist and
--     the fact that nothing linked gets embedded.
--  5. AN ASCII WHITELIST OVER THE AUTHORITY, and not the rule «no @ and with a dot
--     in the middle», which is insufficient. The authority is what there is between `://` and the
--     first `/`, `?` or `#`, in lower case, and it has to be a domain
--     name: labels of letters, digits and hyphens separated by dots, with no
--     leading or trailing hyphen in any label, a top-level domain of
--     two letters or more, and an optional port of up to five digits. That single
--     line closes, checked one by one:
--
--       · https://macvac.es@evil.example/obra — credentials before the
--         host: it reads as being the MACVA's and it goes elsewhere. It is the only
--         impersonation that can be rejected without resolving anything over the network.
--       · https://evil.example\.ejemplo.es/ — THE BACKSLASH, which
--         browsers treat as a slash: the real host is `evil.example` and what
--         looks like the domain is the path.
--       · Invisible characters inside the site's name (U+200B and company).
--         PostgreSQL's `[[:space:]]` does not catch U+200B nor any character of
--         category Cf, so the whitelist is the only way of closing it.
--       · IP addresses, `https://192.168.1.7/obra` and `https://[::1]/obra`, for
--         the same reason `localhost` is rejected: they are not a source
--         a catalogue can cite.
--       · `https://.ejemplo.es`, `https://ejemplo.es.`, `https://ejemplo..es`,
--         `https://ejemplo_a.es`.
--
--     AN ACCEPTED COST: internationalised domains written in
--     Unicode (`https://münchen.example`) are rejected. They are stored in their punycode form
--     (`https://xn--mnchen-3ya.example`), which is the one the browser copies on
--     pasting, and the interface's message says so in those words.
--
-- The function does NOT check that the site exists nor that the page loads: that cannot
-- be done from a `check`, and pretending to would be worse than not having it.
create function public.is_web_url(p_url text) returns boolean
language sql immutable strict set search_path = public as $$
  select p_url = btrim(p_url)
     and length(p_url) between 11 and 2048
     and p_url !~ '[[:space:][:cntrl:]]'
     and lower(p_url) ~ '^https?://'
     and coalesce(substring(lower(p_url) from '^https?://([^/?#]*)'), '')
         ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:[0-9]{1,5})?$'
$$;

comment on function public.is_web_url is
  'Única regla de validación de direcciones web del esquema (RF-1403). Lista blanca de esquemas y lista blanca ASCII del nombre del sitio. Se concede a la aplicación para que aplique la misma regla sin duplicarla, como place_key. No comprueba que el sitio exista: eso no se puede hacer desde un check.';

revoke all on function public.is_web_url(text) from public;
grant execute on function public.is_web_url(text) to authenticated;

-- A BOUNDARY RULE, which holds for the whole schema: every column storing a
-- web address, in any present or future table, is validated with
-- `is_web_url`. And a web address lives in `external_links`, except the
-- canonical identifier of a publication (a DOI or a link to the copy), which would be
-- `bibliography`'s the day it has a column of its own — today it does not, so
-- `external_links` is the only place. `parties` does NOT get a website column:
-- that is what the anchor to the party is for, which arrives with the rest of the anchors.
--
-- A `check` THAT CALLS A FUNCTION DOES NOT REVALIDATE THE OLD ROWS WHEN THE
-- FUNCTION CHANGES. It is written here: the day `is_web_url` is tightened, the
-- migration that replaces it carries next a `do` block that counts the
-- rows of `external_links` that stop passing and FAILS if there is any. It is also
-- the second reason why the interface validates again on painting.


-- ── The table ───────────────────────────────────────────────

create table public.external_links (
  -- Surrogate key (ADR-007, RF-204) and not the URL: the URL is precisely what
  -- changes when the museum reorganises its site, and a primary key is not edited.
  id uuid primary key default gen_random_uuid(),

  -- The exclusive arc. `on update cascade` in both anchors for coherence with
  -- `images.catalog_id` and `provenance_events.catalog_id`, even though `catalog_id` is
  -- immutable by trigger: it is a belt, not a mechanism. `on delete restrict` for the
  -- same reason as in the master tables: nobody has DELETE, and if a row were ever
  -- deleted by hand, this warns instead of leaving links hanging from nothing.
  artwork_id text references public.artworks (catalog_id)
    on update cascade on delete restrict,
  image_id text references public.images (image_id)
    on update cascade on delete restrict,

  url text not null,

  -- It can be empty: requiring a title on pasting breaks one-handed capture
  -- (RNF-106, RF-1408). When it is missing, the interface shows the DOMAIN and never the
  -- whole address, so there is no gap. It is stored trimmed.
  title text not null default '',

  link_type public.external_link_type,

  -- Why this link matters. Long text, with no forced trimming, like the rest
  -- of the catalogue's notes.
  note text not null default '',

  archive_url text,

  -- The three check columns. `record_link_check` writes them and not the
  -- client: see further below.
  check_status public.link_check_status,
  checked_at timestamptz,
  checked_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- `updated_at`/`updated_by` exist here and not in `images` on purpose: the URL
  -- is the only field of the catalogue that changes for reasons that are OUTSIDE the
  -- catalogue, and «who touched it last» is exactly the audit that is
  -- needed when an address stops leading where it led.
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- Logical deletion with the shape of `images` and `physical_places`: with no `restored_at`
  -- and no `restored_by`. A link is not one of RF-901's six records and it does not enter
  -- the wastebasket (RF-906): it is a subordinate row, like a photograph, and it is
  -- restored from the record itself. `tg_row_audit` detects the absence of
  -- `restored_at` and returns the two withdrawal columns to null on restoring, just
  -- as it does in `physical_places`.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- `= 1` and not `in (0, 1)`: a link with no anchor is not a link pending
  -- placement, it is invisible rubbish nobody will ever see again.
  constraint external_links_exactly_one_owner
    check (num_nonnulls(artwork_id, image_id) = 1),

  -- Each constraint with a name of its own, by the same criterion as the colour
  -- ranges: what PostgreSQL says on rejecting is the name, and it is what the
  -- interface translates.
  constraint external_links_url_is_web
    check (public.is_web_url(url)),
  constraint external_links_archive_url_is_web
    check (archive_url is null or public.is_web_url(archive_url)),
  constraint external_links_title_trimmed
    check (title = btrim(title)),

  -- Either both or neither: a check date with no result says nothing, and
  -- a result with no date cannot be aged on screen.
  constraint external_links_check_pair
    check (num_nonnulls(check_status, checked_at) = any (array[0, 2]))
);

comment on table public.external_links is
  'Enlaces a sitios externos (RF-1401). Cada fila cuelga de exactamente una ficha por clave ajena declarada: ni polimorfismo ni tabla puente. Nada se borra: se retira (RF-1406).';

comment on column public.external_links.url is
  'La dirección, tal cual se pega. Validada por is_web_url (RF-1403), que es lista blanca de esquemas y del nombre del sitio.';

comment on column public.external_links.title is
  'Lo que lee la usuaria. Puede faltar: entonces la interfaz muestra el dominio y nunca la dirección entera (RF-1402, RF-1408).';

comment on column public.external_links.link_type is
  'Nulo es «sin clasificar» y OTHER es «se miró y no encaja en ninguno»: no son lo mismo (RF-1402).';

comment on column public.external_links.archive_url is
  'Dirección de una copia que una persona guardó en un archivo público. La aplicación no archiva nada por su cuenta: guardar una instantánea propia en el bucket sería construir un archivador web, y si de verdad hace falta conservar una página la respuesta del esquema ya existe y es imprimirla a PDF y darla de alta como documento de archivo.';

comment on column public.external_links.checked_at is
  'La sella la base a través de record_link_check. Nulo es «sin comprobar», que no es «roto» (RF-1405).';


-- ── Indexes ─────────────────────────────────────────────────
--
-- The only two partial ones prevent the real accident —pasting the same thing twice in
-- the same record— and do NOT try to normalise the URL: comparing `http` with `https`,
-- the trailing slash or the order of the parameters is a bottomless pit, and those
-- variants are not caught. They are partial over `active` so that withdrawing a link
-- and adding it again works (RF-1406).

create index external_links_artwork_idx
  on public.external_links (artwork_id, active) where artwork_id is not null;

create index external_links_image_idx
  on public.external_links (image_id, active) where image_id is not null;

create unique index external_links_artwork_url_unique
  on public.external_links (artwork_id, url) where artwork_id is not null and active;

create unique index external_links_image_url_unique
  on public.external_links (image_id, url) where image_id is not null and active;


-- ── Authorship and wastebasket ──────────────────────────────
--
-- `tg_row_audit` stamps them, RF-804's common function that
-- 20260804090000_parties.sql created. No function of its own is written: six copies of
-- twenty lines is guaranteed divergence.

create trigger external_link_row_audit
  before insert or update on public.external_links
  for each row execute function public.tg_row_audit();


-- ── The check is not written by the client (RF-1405) ────────
--
-- The three check columns are the only ones in the table that assert a
-- FACT ABOUT THE OUTSIDE WORLD —that that page, today, loads and shows what
-- it said—, and a date that filled itself in would be false. So the write
-- path is a single one, `record_link_check`, and this trigger closes the others.
--
-- It does so IN SILENCE and not with an exception: a form that sends the whole row
-- must not fail for resending what was already there; the effect that matters is that it
-- cannot move it.
--
-- A limit said out loud: the `app.link_check` setting is a guardrail against
-- the honest client and not a perimeter. PostgREST does not allow setting
-- arbitrary session variables, so from the API there is no way of setting it; whoever already
-- has direct SQL access can. The real perimeter is that only
-- `can_edit()` writes in this table, and that is set by the RLS.
create function public.tg_external_link_check_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- A link is born unchecked, including the one a migration inserts: nobody
    -- has opened that page today and the base is not going to assert that it works.
    new.check_status := null;
    new.checked_at   := null;
    new.checked_by   := null;
    return new;
  end if;

  if nullif(current_setting('app.link_check', true), '') is distinct from new.id::text then
    new.check_status := old.check_status;
    new.checked_at   := old.checked_at;
    new.checked_by   := old.checked_by;
  end if;
  return new;
end $$;

comment on function public.tg_external_link_check_freeze is
  'Congela las tres columnas de comprobación de un enlace: solo record_link_check las mueve (RF-1405). En silencio y no con excepción, para que un formulario que reenvía la fila entera no falle.';

create trigger external_link_check_freeze
  before insert or update on public.external_links
  for each row execute function public.tg_external_link_check_freeze();

-- The name matters: the triggers of the same table and the same moment fire
-- in alphabetical order, and `external_link_check_freeze` goes before
-- `external_link_row_audit`. Here it makes no difference because they do not share a single column,
-- but it is worth whoever adds a third one knowing it.


-- `security invoker`, traced from `set_main_image`, so it still goes through RLS:
-- a Reader changes nothing even if they call the function. It returns the timestamp
-- so that the screen shows it without querying again.
--
-- Desired consequences, all with a test: confirming the same state again a
-- year later DOES move the date —it is the most frequent case, «it still
-- works»—; setting the state to null returns the three columns to null,
-- because «it is unchecked again» is a legitimate correction; and editing a
-- link's note does not move the check date but does move `updated_at`.
create function public.record_link_check(
  p_link_id uuid, p_status public.link_check_status)
returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare
  v_when timestamptz;
  v_rows integer;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para comprobar enlaces';
  end if;

  perform set_config('app.link_check', p_link_id::text, true);

  update public.external_links
     set check_status = p_status,
         checked_at   = case when p_status is null then null else now() end,
         checked_by   = case when p_status is null then null else auth.uid() end
   where id = p_link_id
  returning checked_at into v_when;

  -- The count is stored HERE and `found` is not consulted further below: in PL/pgSQL
  -- a `perform` also writes `found`, and the `set_config` that comes
  -- next would always leave it true. A non-existent link would pass without
  -- a complaint and the screen would be left waiting for a date that never arrives.
  get diagnostics v_rows = row_count;

  -- The setting is always cleared: it is local to the transaction, and leaving it set
  -- would open a window in which a later update over the same row, in the
  -- same transaction, could move the date.
  perform set_config('app.link_check', '', true);

  if v_rows = 0 then
    raise exception 'No existe el enlace que se intenta comprobar';
  end if;
  return v_when;
end $$;

comment on function public.record_link_check is
  'Único camino para sellar la comprobación de un enlace (RF-1405). La fecha la pone la base y no el cliente: una fecha que llegara del teléfono valdría lo que su reloj. No existe rastreador y no puede existir sin servidor de aplicación.';

revoke all on function public.tg_external_link_check_freeze() from public;
revoke all on function public.record_link_check(uuid, public.link_check_status) from public, anon;
grant execute on function public.record_link_check(uuid, public.link_check_status) to authenticated;


-- ── RLS and privileges ──────────────────────────────────────
--
-- A table with no RLS is open, not closed, and the platform grants by default
-- all the privileges of every new table to the anonymous and authenticated roles,
-- `delete` included (RF-113). It is revoked first and granted afterwards, one by one.
--
-- And the policies go IN THIS VERY MIGRATION, unlike in the documentary
-- catalogue raisonné: there they were fifteen tables and a perimeter migration
-- of their own; here it is one table, and a table that exists for a single deployment with no
-- policy is a table the application cannot use.

alter table public.external_links enable row level security;

revoke all on public.external_links from anon, authenticated;

grant select, insert, update on public.external_links to authenticated;

-- No DELETE: neither privilege nor policy, ever (RF-901, RF-1406). Withdrawing a
-- link is an update of `active`.

-- The first half is the shape of `artworks` and `images`: the Reader sees what is active,
-- whoever edits also sees the wastebasket.
--
-- THE SECOND HALF IS THE INHERITED VISIBILITY, and it deserves the comment because it is
-- not a copy of the record's rule, it is the rule itself. The subqueries are
-- evaluated UNDER THEIR OWN TABLE'S POLICY: `artworks`' hides the withdrawn
-- artworks from the Reader and `images`' hides the withdrawn photographs from them. Out of
-- that comes the correct behaviour for free —the Cataloguer sees everything, the Reader
-- does not find out that the link of a record they cannot see exists (RF-609)— and,
-- if tomorrow the artworks' visibility rule changes, the links' one
-- follows it on its own.
--
-- It costs one primary-key lookup and it avoids leaking the existence of a
-- record RF-609 hides. Note that `images` still has RF-905's hole
-- —the file name of a withdrawn photograph— and that the day it is
-- closed for the photographs it has to be done in ITS OWN migration, not here.
create policy external_links_select on public.external_links
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and (
      (artwork_id is not null
        and exists (select 1 from public.artworks a where a.catalog_id = external_links.artwork_id))
      or
      (image_id is not null
        and exists (select 1 from public.images i where i.image_id = external_links.image_id))
    )
  );

create policy external_links_insert on public.external_links
  for insert with check (public.can_edit());

create policy external_links_update on public.external_links
  for update using (public.can_edit()) with check (public.can_edit());
