// Domain types, matching the database schema names: the schema is the
// project's vocabulary (see CLAUDE.md).
//
// Hand-written for now. RNF-102 plans generating them from the schema with the
// Supabase CLI (`supabase gen types typescript`), which needs the remote
// project already created. Until then, any change in a migration forces a
// change here: it is the point where schema and frontend can drift apart with
// no warning.
//
// Enum VALUES are code (the database renamed them to English via ALTER TYPE
// ... RENAME VALUE); only artist_fund keeps its values, which are surnames.
// What the user reads on screen is decided by the Spanish label maps below.

export type ArtistFund = 'ROTILI' | 'RUIZ_CAMPINS' | 'TEST'

/** Every fund, to validate values arriving from outside the code. */
export const ARTIST_FUNDS: readonly ArtistFund[] = ['ROTILI', 'RUIZ_CAMPINS', 'TEST']
export type UserRole = 'SUPERUSER' | 'CATALOGER' | 'READER'
export type TriState = 'YES' | 'NO' | 'UNREVIEWED'
export type AttributedTitleValue = 'NOT_APPLICABLE' | 'NO' | 'YES' | 'UNCONFIRMED' | 'UNREVIEWED'

export type ShotTypeValue =
  | 'GENERAL'
  | 'SIGNATURE_DETAIL'
  | 'BACK'
  | 'DAMAGE_DETAIL'
  | 'FRAME'
  | 'OTHER'

export type ConservationStatusValue =
  | 'GOOD'
  | 'FAIR'
  | 'NEEDS_RESTORATION'
  | 'NEEDS_URGENT_RESTORATION'
  | 'UNREVIEWED'

export type ExistenceStatusValue =
  | 'PRESERVED'
  | 'DESTROYED'
  | 'LOST'
  | 'UNKNOWN'
  | 'UNREVIEWED'

// ── Colour of a photograph (RF-414, RF-417, RF-418) ──────────
// The four enums added by 20260803120000_image_color.sql. Values are code, as
// everywhere else; the label maps at the bottom decide what is read on screen.
//
// They live here, next to the rest of the schema vocabulary, and not beside the
// colour model: `CropSource` ended up in imageEdits.ts because renderer and
// uploader both needed it and neither could own it, but these four are also read
// by the record and by the photograph panel, which have nothing to do with
// editing. Whoever adds a value to one of these enums in a migration has to come
// back here — a value the map does not cover is a crash at the lookup, not a
// blank.

/**
 * How the colour correction of a photograph came to be.
 *
 * This is the ONE colour column where null is not the identity value but
 * «nobody has looked at it yet», and the reason `REVIEWED_UNCHANGED` exists:
 * «sin revisar» no es «no» (CLAUDE.md), so a photograph judged correct with the
 * artwork in front of you has to be distinguishable from one never opened.
 */
export type ColorSource =
  | 'MANUAL'
  | 'NEUTRAL_PICKED'
  | 'AUTO'
  | 'AUTO_ADJUSTED'
  | 'PRESET'
  | 'REVIEWED_UNCHANGED'

/**
 * Where the neutral reference of the correction came from (RF-418).
 *
 * The value is not decoration: it says how much the grey can be believed, and
 * `TARGET_PRINT` is believed less than `TARGET_CARD` even though both are a
 * detected target (home ink is not neutral). See COLOR_REFERENCE_DESCRIPTION.
 */
export type ColorReference = 'TARGET_CARD' | 'TARGET_PRINT' | 'SCENE' | 'NONE'

/**
 * Kind of light chosen as a starting point for temperature and tint (RF-414).
 *
 * A list one picks from, never a measurement: the light is not deduced from the
 * photograph, and the interface has to say so wherever these labels appear.
 */
export type LightPreset =
  | 'DAYLIGHT'
  | 'OVERCAST'
  | 'FLUORESCENT_COOL'
  | 'FLUORESCENT_WARM'
  | 'LED_NEUTRAL'
  | 'INCANDESCENT'
  | 'MIXED_WINDOW_CEILING'
  | 'FLASH'

/**
 * Where the photograph comes from (RF-417). `OWN` is the default in the schema,
 * and the column is not nullable: with null the rule «colour only on our own
 * photographs» would arrive switched off for every existing row.
 *
 * On anything other than `OWN` the colour adjustment is not offered — the
 * parameters are absolute over our master, and a reproduction taken from someone
 * else's catalog already comes with its colour baked in by whoever made it.
 */
export type PhotoProvenance = 'OWN' | 'OTHER_CATALOG' | 'THIRD_PARTY'

// ── Documentary catalogue (RF-217, RF-218, RF-508..RF-517) ───
// The six enums added by the migrations of 2026-08-04. Values read from the
// live database (`pg_enum`), in the order the type declares them; the label
// maps at the bottom decide what is read on screen.
//
// Nullability below is likewise measured against the database and not guessed:
// every enum column of these tables is `not null` with a default, so no screen
// has to handle «the value is missing» on top of «the value is UNREVIEWED».

/**
 * Person or institution (RF-508). The only enum of this group WITHOUT
 * «Sin revisar», deliberately and for the reason RF-203 gives `artist`: when
 * the record is opened it is already known whether a person or a museum is
 * being written, and how the provenance line reads depends on the answer.
 */
export type PartyType = 'PERSON' | 'INSTITUTION'

/**
 * How far the conversation with a party has got. Working data, not a fact about
 * the artwork: it is what stops two people writing the same letter twice.
 */
export type ContactStatus =
  | 'NOT_CONTACTED'
  | 'CONTACTED'
  | 'INFO_RECEIVED'
  | 'VISITED'
  | 'VERIFIED'

/**
 * In what capacity a party held the artwork (RF-509). Half of what field schema
 * v11 crammed into a single `estatus_legal`: this one answers «on what terms»,
 * `ProvenanceAcquisition` answers «how it got there», and an artwork can be on
 * deposit having arrived as a gift.
 */
export type ProvenanceCapacity = 'OWNER' | 'DEPOSIT' | 'LOAN' | 'UNKNOWN' | 'UNREVIEWED'

/** How the artwork reached that party (RF-509). The other half of `estatus_legal`. */
export type ProvenanceAcquisition =
  | 'PURCHASE'
  | 'GIFT'
  | 'INHERITANCE'
  | 'COMMISSION'
  | 'EXCHANGE'
  | 'UNKNOWN'
  | 'UNREVIEWED'

/**
 * State of the research on one documentary block of an artwork (RF-218).
 *
 * This is «sin revisar» no es «no» moved from the field to the block: an artwork
 * with no exhibitions recorded is not an artwork that was never exhibited. The
 * database refuses to set `NONE_FOUND` on a block that already has rows, and
 * refuses to add rows to a block declared `NONE_FOUND`, so the value can never
 * contradict what is underneath it.
 */
export type ResearchStatus = 'UNREVIEWED' | 'IN_PROGRESS' | 'NONE_FOUND' | 'COMPLETE'

/** Character of an exhibition. Carries «Sin revisar»: a press cutting gives the title long before it gives this. */
export type ExhibitionTypeValue = 'INDIVIDUAL' | 'COLLECTIVE' | 'UNREVIEWED'

/**
 * Kind of site an external link points at (RF-1402). An enum and not a
 * vocabulary table because the schema owns the entries: nobody renames «Prensa»
 * or reorganizes these into a tree, which is what makes a table worth its
 * maintenance screen.
 *
 * The column is NULLABLE, and null is not `OTHER`: null is «nobody has
 * classified this one», `OTHER` is «it was looked at and fits none of these».
 * Same distinction `ColorSource` and `CropSource` already wrote down.
 */
export type ExternalLinkType =
  | 'MUSEUM_PAGE'
  | 'ONLINE_CATALOG'
  | 'ART_DATABASE'
  | 'PRESS'
  | 'VIDEO'
  | 'ARTIST_SITE'
  | 'PHOTO_SOURCE'
  | 'OTHER'

/**
 * Result of checking a link BY HAND (RF-1405). Three values and not two:
 * `CHANGED` —the page still loads but no longer shows what it documented— is
 * exactly what no crawler would detect, and there is no crawler here anyway
 * because there is no application server.
 *
 * The fourth state is null, «not checked», and it is not `BROKEN`.
 */
export type LinkCheckStatus = 'WORKING' | 'CHANGED' | 'BROKEN'

/**
 * One entry of the artwork-type vocabulary (RF-213).
 *
 * `id` is the identity since ADR-007: the name is an attribute, which is what
 * makes renaming one row instead of a pass over every artwork. `active` false is
 * a retired type — still readable, no longer on offer (RF-901).
 */
export interface ArtworkTypeEntry {
  id: string
  name: string
  active: boolean
}

/**
 * One entry of the series vocabulary. The series belongs to a fund, and the
 * pair (fund, name) is unique — each artist works in their own series — but
 * since ADR-007 it is no longer the identity: `id` is.
 */
export interface SeriesEntry {
  id: string
  artist: ArtistFund
  name: string
  active: boolean
}

/**
 * One node of the tree of physical places (ADR-006).
 *
 * `parent_id` null is a root, and it is MUTABLE: hanging a place that is a root
 * today from another one tomorrow is a normal operation, and the reason the tree
 * exists. `name` is stored exactly as it is written, with its capitals and its
 * accents; what gets normalized is only the comparison key (see places.ts).
 *
 * The trash columns of the row —who retired it and when— are not here: the
 * interface only needs to know whether the place is still in use, and the rest
 * belongs to whoever audits the catalog.
 */
export interface PhysicalPlace {
  id: string
  parent_id: string | null
  name: string
  active: boolean
}

// ── Rows of the documentary catalogue ────────────────────────
// One interface per table created on 2026-08-04. Field names, types and
// nullability are taken from the live schema (`pg_attribute`), not from the
// design document: where the two disagreed, the database won.
//
// What is deliberately NOT here, following `PhysicalPlace`: the audit and trash
// trail (`created_at`/`created_by`, `updated_at`/`updated_by`,
// `deactivated_at`/`deactivated_by`, `restored_at`/`restored_by`). The database
// seals those itself with `tg_row_audit` — the client cannot write them and any
// value it sends is overwritten — so typing them here would invite code that
// tries. `active` IS here, because every screen has to know whether a row is in
// the trash. The trash screen (RF-906), which is the one place that reads the
// trail, can select those columns explicitly when it is built.

/**
 * A person or an institution (RF-508): owner, depositor, lender, rights holder,
 * and the institution behind an exhibition venue — one table, because the Museo
 * de Bellas Artes de Badajoz is several of those at once and its name has to
 * live in exactly one row.
 *
 * `contact` is third-party personal data that the Reader can see by an explicit
 * decision (RF-105). Nothing but the table policy stands between it and the
 * anonymous key that ships in this client.
 */
export interface Party {
  id: string
  party_type: PartyType
  name: string
  locality: string
  country: string
  contact: string
  contact_status: ContactStatus
  note: string
  active: boolean
}

/**
 * One link of an artwork's chain of provenance (RF-509).
 *
 * `position` is the order of the chain and it is MANUAL, not derived from the
 * dates: half the links of a catalogue raisonné have no known year, and an order
 * derived from nulls is not an order. Reordering goes through the
 * `reorder_provenance_events(catalog_id, event_ids)` RPC, never through writing
 * `position` by hand.
 *
 * `party_id` null is legitimate — «Colección privada, España» is a real link
 * with no record behind it — but the database demands that a link say who it is
 * about: `party_id` or a non-blank `party_note`, never neither.
 */
export interface ProvenanceEvent {
  id: string
  catalog_id: string
  position: number
  party_id: string | null
  party_note: string
  capacity: ProvenanceCapacity
  acquisition: ProvenanceAcquisition
  start_year: number | null
  end_year: number | null
  approximate_date: boolean
  unconfirmed_date: boolean
  date_note: string
  /** Generated by the database from the structured fields (ADR-004). Read-only. */
  date_text: string
  note: string
  active: boolean
}

/** One entry of the publication-type vocabulary (RF-514). Open list: v11's closed four did not survive contact with real research. */
export interface PublicationTypeEntry {
  id: string
  name: string
  active: boolean
}

/**
 * A bibliographic reference (RF-504).
 *
 * `bibtex_key` resolves DP-03: it is no longer the primary key but a unique,
 * OPTIONAL and EDITABLE column — the short handle a researcher names a reference
 * by. The database rejects spaces, commas and braces in it, which are what break
 * a `.bib` entry.
 *
 * `authors` and `editors` are free text and not links to `Party` on purpose: the
 * author of a 1985 article is not a contact of this catalogue.
 */
export interface BibliographyEntry {
  id: string
  bibtex_key: string | null
  authors: string
  editors: string
  title: string
  /** Journal or volume containing the cited text. Without it the journal name ends up inside the title. */
  container_title: string
  publication_type_id: string | null
  /** Null is «s.f.», which in bibliography is a datum and not a hole. */
  year: number | null
  publisher: string
  place: string
  note: string
  active: boolean
}

/**
 * The citation of an artwork in a reference (RF-504).
 *
 * Adding one goes through the `cite_artwork(catalog_id, bibliography_id, pages,
 * note)` RPC and NOT through a plain insert: the unique constraint covers
 * retired rows too, so re-adding a citation that is in the trash restores it
 * instead of failing (RF-517).
 */
export interface ArtworkBibliography {
  id: string
  catalog_id: string
  bibliography_id: string
  /** Text, not a number: «34-36», «s/p» and «lám. XII» are all pages. */
  pages: string
  note: string
  active: boolean
}

/**
 * An exhibition venue (RF-512). NOT a node of the tree of physical places: that
 * one answers «where is the artwork today» and contains things; this one answers
 * «where did a show happen in 1985», is historical, and a room that closed in
 * 1988 has to keep existing forever.
 *
 * Unique by name AND locality, because there is a «Casa de Cultura» in every
 * town.
 */
export interface ExhibitionVenue {
  id: string
  name: string
  locality: string
  country: string
  /** The institution behind the venue, if there is one. A municipal hall has none. */
  party_id: string | null
  note: string
  active: boolean
}

/**
 * An exhibition (RF-501, RF-502).
 *
 * The database demands `year` or `start_date` — never neither — and fills `year`
 * from `start_date` when it is missing, never the other way round: inventing a
 * 1 January out of a bare year would publish an opening nobody documented. The
 * chronological order of RF-502 is `coalesce(start_date, make_date(year, 1, 1))`,
 * which is indexed.
 */
export interface Exhibition {
  id: string
  title: string
  exhibition_type: ExhibitionTypeValue
  venue_id: string | null
  /** The venue that is on record without being identified: «una galería de Madrid». */
  venue_note: string
  year: number | null
  /** ISO date, `YYYY-MM-DD`. */
  start_date: string | null
  end_date: string | null
  date_note: string
  catalogue_published: TriState
  /** The catalogue of the show, as a bibliographic record (RF-503). Only settable when `catalogue_published` is 'YES'. */
  catalogue_reference_id: string | null
  note: string
  active: boolean
}

/**
 * The participation of an artwork in an exhibition (RF-501).
 *
 * Added through the `exhibit_artwork(catalog_id, exhibition_id,
 * catalogue_number, note)` RPC, for the same restore-instead-of-fail reason as
 * `cite_artwork`.
 */
export interface ArtworkExhibition {
  id: string
  catalog_id: string
  exhibition_id: string
  /** «12 bis», «s/n». A column of its own and not part of the note: it is cited exactly and searched (RF-513). */
  catalogue_number: string
  note: string
  active: boolean
}

/** One entry of the archive document-type vocabulary (RF-515). Open list, as v11 already declared it. */
export interface DocumentTypeEntry {
  id: string
  name: string
  active: boolean
}

/**
 * One node of the archival classification tree: fondo → serie → subserie
 * (RF-515). Same shape as `PhysicalPlace`, and for the same reason: v11 had this
 * as a text with a separator convention, which is exactly the mistake ADR-006
 * already paid for once.
 *
 * `parent_id` null is a fondo (root) and is MUTABLE: reorganising the
 * classification touches no document.
 */
export interface ArchiveSeries {
  id: string
  parent_id: string | null
  name: string
  active: boolean
}

/**
 * A document of the archive (RF-515, RF-516): a letter, a press cutting, a
 * poster, a photograph — anything that is not artwork.
 *
 * There is NO `digitized` flag: it is `file_path !== null`. A flag that can
 * contradict the file next to it is a flag that lies one day. The four file
 * columns move together — all four set or all four null.
 */
export interface ArchiveDocument {
  id: string
  /** Signature written on the folder («AR-ARCH-0001»). Unique, optional and EDITABLE, unlike `catalog_id`. */
  archive_code: string | null
  /** Null on purpose, unlike v11: a cutting about a group show of both artists belongs to no single fund. */
  artist_fund: ArtistFund | null
  document_type_id: string | null
  title: string
  archive_series_id: string | null
  start_year: number | null
  end_year: number | null
  approximate_date: boolean
  unconfirmed_date: boolean
  date_note: string
  /** Generated by the database from the structured fields (ADR-004). Read-only. */
  date_text: string
  /** The SAME tree as the artworks (ADR-006): a box of letters is in the same building as the paintings. */
  physical_place_id: string | null
  /** Path inside the private `obras` bucket (RF-408, RF-110). Served through a signed URL, never public. */
  file_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_at: string | null
  note: string
  active: boolean
}

/** Link between an archive document and an artwork (RF-516). Added through `document_artwork(catalog_id, document_id, note)`. */
export interface ArtworkDocument {
  id: string
  catalog_id: string
  document_id: string
  note: string
  active: boolean
}

/** Link between an archive document and an exhibition (RF-516). Added through `document_exhibition(exhibition_id, document_id, note)`. */
export interface ExhibitionDocument {
  id: string
  exhibition_id: string
  document_id: string
  note: string
  active: boolean
}

/**
 * One kind of relationship between two artworks (RF-217).
 *
 * This is a table and not an enum because each kind carries DATA an enum cannot:
 * `inverse_name` is the label the artwork at the other end shows («Obra final
 * de» against «Estudio previo de»), which is what lets the opposite record say
 * something without a second row that could drift.
 *
 * `is_symmetric` — not `symmetric`, which is a reserved word in SQL. The
 * database refuses to flip it once the kind has relationships stored, retired
 * ones included: rows written under one canonicalisation convention and rows
 * written under another cannot be told apart afterwards.
 */
export interface ArtworkRelationshipType {
  id: string
  name: string
  /** Empty exactly when `is_symmetric` is true; non-empty and different from `name` when it is false. */
  inverse_name: string
  is_symmetric: boolean
  active: boolean
}

/**
 * A typed relationship between two catalogued artworks (RF-217, extends RF-212).
 *
 * For a SYMMETRIC kind the row is canonicalised by the database: the smaller
 * `catalog_id` always ends up in `from_catalog_id`, so «AR-0003 pareja de
 * AR-0007» and «AR-0007 pareja de AR-0003» are one row and not two that can
 * diverge in the note. For an ASYMMETRIC one the reverse pair is rejected.
 *
 * Both facts mean the record has to read BOTH ends and show `name` or
 * `inverse_name` depending on which side it is on. Adding a relationship goes
 * through `relate_artworks(from, to, type, note)`, which finds the canonicalised
 * row whichever order it is written in.
 */
export interface ArtworkRelationship {
  id: string
  from_catalog_id: string
  to_catalog_id: string
  relationship_type_id: string
  note: string
  active: boolean
}

/**
 * The documentary columns added to `artworks` by the 2026-08-04 migrations.
 *
 * They are kept OUT of `Artwork` for now on purpose. Every field of `Artwork` is
 * required, and no screen selects these yet; widening it today would only break
 * the complete-literal fixture in `recordPdf.test.ts`, which this work does not
 * own. When the documentary block gets its screen, fold this into `Artwork` and
 * complete that fixture in the same commit.
 *
 * All eight are `not null` in the database except `rights_holder_party_id`;
 * the four statuses default to `UNREVIEWED`.
 */
export interface ArtworkDocumentary {
  /** Publishable narrative of the provenance (RF-510). When it has text it is what the record prints; when empty, the record composes the line from the links. */
  provenance: string
  /** Source and reliability of the provenance datum. Not published. */
  provenance_note: string
  /** Holder of the reproduction rights (RF-511). May not be whoever owns the artwork. */
  rights_holder_party_id: string | null
  rights_holder_note: string
  provenance_status: ResearchStatus
  bibliography_status: ResearchStatus
  exhibition_history_status: ResearchStatus
  documentation_status: ResearchStatus
}

/**
 * A link to an external site (RF-1401). Every row hangs from EXACTLY ONE record
 * through a declared foreign key — an exclusive arc, not a polymorphic key and
 * not a bridge table — and today the two anchors are an artwork and a
 * photograph. The others (exhibition, publication, party, archive document)
 * arrive in their own migration; when they do, only this interface and the
 * check constraint widen.
 *
 * `title` may be the empty string, and that is not a gap: when it is empty the
 * screen shows the DOMAIN and never the whole address (RF-1402, RF-1408).
 *
 * The three check columns are READ-ONLY from here. The database freezes them and
 * only the `record_link_check` RPC moves them, because they assert a fact about
 * the outside world and a date the client sent would be worth whatever its clock
 * says (RF-1405). `checked_at` null means «not checked», which is not «broken».
 *
 * Following `PhysicalPlace`, the audit trail is not typed here — `tg_row_audit`
 * seals it and any value the client sends is overwritten.
 */
export interface ExternalLink {
  id: string
  /** Set when the link hangs from an artwork; null then means it hangs from a photograph. */
  artwork_id: string | null
  image_id: string | null
  /** Validated by `is_web_url` in the database (RF-1403); the mirror in this client only exists to explain the refusal in Spanish. */
  url: string
  title: string
  link_type: ExternalLinkType | null
  note: string
  /** Address of a copy a PERSON saved in a public archive. The application archives nothing by itself. */
  archive_url: string | null
  check_status: LinkCheckStatus | null
  checked_at: string | null
  checked_by: string | null
  active: boolean
}

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
}

/**
 * What a dossier's item is (RF-1602, RF-1614, RF-1616, RF-1619, ADR-011).
 *
 * The four share one ordered list because a paragraph goes BETWEEN two artworks,
 * and the database's `dossier_items_*_shape` constraints mean each kind arrives
 * with exactly its own fields filled in.
 *
 * A SECTION owns the items that follow it up to the next one, and it owns them by
 * POSITION and not by a column: a PDF is linear, so the order already says it.
 */
export type DossierItemKind = 'ARTWORK' | 'TEXT' | 'BIOGRAPHY' | 'SECTION'

/**
 * A dossier: the artworks chosen for a gallery, in the order they are to be
 * read, and the PDF issued from them (RF-1601, ADR-011).
 */
export interface Dossier {
  id: string
  title: string
  /** What it is for, in the user's words. Free text on purpose: the uses have not all appeared yet. */
  purpose: string
  /** The team's note. Deliberately NOT printed — that is what tells it from `cover_text` (RF-1615). */
  note: string
  /** The cover's text, which IS printed. The only free text that is not an item, because a cover is a page. */
  cover_text: string
  /** Who it goes to, from `parties` (RF-508). Null: a dossier is armed before knowing. */
  recipient_party_id: string | null
  show_provenance: boolean
  show_exhibitions: boolean
  show_bibliography: boolean
  /** Off by default: a price is the figure asked of somebody (RF-1604). */
  show_prices: boolean
  /** An index of sections behind the cover (RF-1622). All of them or no index. */
  show_index: boolean
  active: boolean
}

/**
 * One item of a dossier. The columns that do not belong to its `kind` arrive
 * null or empty, and the database is what guarantees it.
 */
export interface DossierItem {
  id: string
  dossier_id: string
  kind: DossierItemKind
  /** Position among the ACTIVE items, 1..n. Rewritten whole by `reorder_dossier_items`. */
  sort_order: number
  /** The artwork, on an ARTWORK item. */
  catalog_id: string | null
  /** The fixed shot. Null is «the artwork's representative one» (RF-1605). */
  image_id: string | null
  /** Of this dossier and not of the artwork (RF-1604). Null is «no price», which is not zero. */
  price: number | null
  currency: string
  /** The team's note about this item. Not printed. */
  note: string
  /** Section title of a TEXT item, or the heading over a BIOGRAPHY. */
  heading: string
  /** The paragraph of a TEXT item. Printed. */
  body: string
  /** Whose biography, on a BIOGRAPHY item. The prose itself lives in `artist_funds`. */
  artist_fund: ArtistFund | null
  /** Whether a BIOGRAPHY item also prints the CV. Null on the other kinds. */
  with_cv: boolean | null
  /** Whether a SECTION's heading gets a page of its own. Null on the other kinds. */
  divider_page: boolean | null
  /**
   * The SECTION item this one belongs to (RF-1619). Null is «suelta», which is a
   * datum: it prints with no heading. It used to be deduced from the position, and
   * that way a section could not be moved without adopting whatever was in front.
   */
  section_item_id: string | null
  active: boolean
}

/**
 * A PDF issued from a dossier (RF-1607). Append-only: a version that left in an
 * email is never rewritten, so there is no `active` and no way to correct one.
 */
export interface DossierIssue {
  id: string
  dossier_id: string
  /** 1, 2, 3… per dossier. Assigned by the database, never by this client. */
  version: number
  issued_at: string
  issued_by: string | null
  /** Under the `dossiers/` prefix of the private bucket. */
  file_path: string
  file_bytes: number | null
  note: string
}

export interface Artwork {
  catalog_id: string
  artist: ArtistFund
  title: string
  attributed_title: AttributedTitleValue
  artwork_type: string
  /** From the `series` vocabulary. Empty means the artwork belongs to none. */
  series: string
  /** Generated by the database from the structured fields. Read-only. */
  execution_date: string
  start_year: number | null
  end_year: number | null
  approximate_date: boolean
  unconfirmed_date: boolean
  date_note: string
  technique: string
  support: string
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
  signed: TriState
  signature_description: string
  dated_on_artwork: TriState
  conservation_status: ConservationStatusValue
  /**
   * Where the artwork is: a node of `physical_places` (ADR-006). Null is
   * legitimate — cataloging with the piece in front of you cannot demand
   * deciding where it is.
   */
  physical_place_id: string | null
  // `physical_location`, the old location as text with the notation convention
  // of field schema v11, is deliberately NOT here. The column still exists —
  // it is retired in a later deployment, after this frontend is the only one
  // running — but nothing reads or writes it any more, and a field no query
  // selects is a trap: whoever read it would get undefined, with the type
  // promising a string. It is `not null default ''`, so an insert that leaves
  // it out is fine.
  existence_status: ExistenceStatusValue
  photographed: boolean
  measurements_verified: boolean
  inventory_phase_completed: boolean
  documentation_phase_completed: boolean
  catalog_record_complete: boolean
  inventory_process_notes: string
  updated_at: string
  basic_updated_at: string | null
  updated_by: string | null
  active: boolean
}

/** The minimum the quick capture needs to create a record (RF-1204). */
export type NewArtwork = Pick<Artwork, 'artist'> & Partial<Omit<Artwork, 'artist'>>

// ── Interface labels ─────────────────────────────────────────
// The stored value is a stable code; what gets read on screen is decided here.
// This way, renaming a label never forces a data migration. Labels stay in
// Spanish: it is the users' language.

export const ARTIST_LABEL: Record<ArtistFund, string> = {
  ROTILI: 'Alberto Rotili',
  RUIZ_CAMPINS: 'María Ruiz Campins',
  // Rehearsal fund (TS- series): test records, never real artwork.
  TEST: 'Pruebas',
}

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPERUSER: 'Superusuario',
  CATALOGER: 'Catalogador',
  READER: 'Lector · solo consulta',
}

export const TRI_STATE_LABEL: Record<TriState, string> = {
  YES: 'Sí',
  NO: 'No',
  UNREVIEWED: 'Sin revisar',
}

export const ATTRIBUTED_TITLE_LABEL: Record<AttributedTitleValue, string> = {
  NOT_APPLICABLE: 'No consta título',
  NO: 'Del artista',
  YES: 'Atribuido',
  UNCONFIRMED: 'Sin confirmar',
  UNREVIEWED: 'Sin revisar',
}

/**
 * The five states split by whether a title is written (RF-209): with a blank
 * field only UNREVIEWED and NOT_APPLICABLE apply; with a written title, the
 * other three. The database enforces it (artworks_attributed_title_matches_title).
 */
export const ATTRIBUTED_TITLE_DESCRIPTION: Record<AttributedTitleValue, string> = {
  NO: 'Título auténtico, puesto por el artista',
  YES: 'Nombre de conveniencia de terceros (familia, comisario…)',
  UNCONFIRMED: 'Hay título, pero no está verificado si es del artista o atribuido',
  NOT_APPLICABLE: 'La investigación ha verificado que la obra no tiene título',
  UNREVIEWED: 'Pendiente de investigar; la ficha muestra [Sin título]',
}

export const CONSERVATION_LABEL: Record<ConservationStatusValue, string> = {
  GOOD: 'Bueno',
  FAIR: 'Regular',
  NEEDS_RESTORATION: 'Requiere restauración',
  NEEDS_URGENT_RESTORATION: 'Requiere restauración urgente',
  UNREVIEWED: 'Sin revisar',
}

export const EXISTENCE_LABEL: Record<ExistenceStatusValue, string> = {
  PRESERVED: 'Conservada',
  DESTROYED: 'Destruida',
  LOST: 'Perdida (paradero desconocido)',
  UNKNOWN: 'Estado desconocido',
  UNREVIEWED: 'Sin revisar',
}

// The artwork types (RF-213) are no longer a hardcoded list here: they live
// in the `artwork_types` table — an open vocabulary catalogers extend from
// the forms (see useArtworkTypes).

/**
 * Photographic shot types. A short list on purpose: during capture one must be
 * able to choose with a single tap, and the schema leaves it open with "Otro"
 * for whatever does not fit, instead of forcing the full taxonomy upfront.
 */
export const SHOT_TYPE_LABEL: Record<ShotTypeValue, string> = {
  GENERAL: 'General',
  SIGNATURE_DETAIL: 'Firma',
  BACK: 'Reverso',
  DAMAGE_DETAIL: 'Daño',
  FRAME: 'Marco',
  OTHER: 'Otro',
}

/**
 * How the colour of a photograph was decided (RF-414). These are read as a
 * statement about the record, not as a menu: the cataloger does not pick
 * «AUTO_ADJUSTED», the editor writes it after the automatic value has been
 * touched by hand.
 */
export const COLOR_SOURCE_LABEL: Record<ColorSource, string> = {
  MANUAL: 'Ajustado a mano',
  NEUTRAL_PICKED: 'Gris tomado de la fotografía',
  AUTO: 'Ajuste automático',
  AUTO_ADJUSTED: 'Ajuste automático retocado a mano',
  PRESET: 'A partir del tipo de luz',
  REVIEWED_UNCHANGED: 'Revisado y dejado como estaba',
}

/** Where the neutral reference came from (RF-418). */
export const COLOR_REFERENCE_LABEL: Record<ColorReference, string> = {
  TARGET_CARD: 'Carta de gris',
  TARGET_PRINT: 'Hoja de grises impresa en casa',
  SCENE: 'Gris de la propia escena',
  NONE: 'Sin referencia, a ojo',
}

/**
 * How much each reference can be believed. It is shown next to the value and not
 * left implicit, because the difference matters and no label can carry it: a
 * detected target is not proof of a trustworthy grey when the target is printed
 * on a domestic printer.
 */
export const COLOR_REFERENCE_DESCRIPTION: Record<ColorReference, string> = {
  TARGET_CARD: 'Testigo de gris detectado, declarado como carta comprada: su gris es fiable',
  TARGET_PRINT:
    'Testigo declarado como hoja impresa en casa: su gris no vale de referencia, la tinta no es neutra',
  SCENE: 'Gris tomado de la escena —una pared, un cartón, un paño—: referencia razonable',
  NONE: 'Corregido a ojo, sin ninguna referencia neutra',
}

/**
 * Kinds of light on offer (RF-414). Each one is a STARTING POINT for temperature
 * and tint that can be moved afterwards, and the panel that shows this list has
 * to say exactly that: the application does not measure the light of the room,
 * and a suggestion presented as a measurement is worse than no suggestion
 * (docs/revision/deteccion-de-bordes-medicion.md).
 */
export const LIGHT_PRESET_LABEL: Record<LightPreset, string> = {
  DAYLIGHT: 'Luz de ventana',
  OVERCAST: 'Día nublado',
  FLUORESCENT_COOL: 'Fluorescente blanco frío',
  FLUORESCENT_WARM: 'Fluorescente cálido',
  LED_NEUTRAL: 'LED neutro',
  INCANDESCENT: 'Bombilla incandescente',
  MIXED_WINDOW_CEILING: 'Mezcla de ventana y techo',
  FLASH: 'Flash del móvil',
}

/**
 * Where the photograph comes from (RF-417). The labels describe the real case
 * and not an abstract category, because that is what lets the cataloger choose
 * without stopping to think what the word means.
 */
export const PHOTO_PROVENANCE_LABEL: Record<PhotoProvenance, string> = {
  OWN: 'Fotografía propia',
  OTHER_CATALOG: 'Tomada de otro catálogo',
  THIRD_PARTY: 'Recibida de un tercero',
}

/** Person or institution (RF-508). Two values that never grow, which is why it is an enum and not a vocabulary table. */
export const PARTY_TYPE_LABEL: Record<PartyType, string> = {
  PERSON: 'Persona',
  INSTITUTION: 'Institución',
}

/** How far the conversation with a party has got. Working data of the researcher, shown on the party record only. */
export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  NOT_CONTACTED: 'Sin contactar',
  CONTACTED: 'Contactada',
  INFO_RECEIVED: 'Ha enviado información',
  VISITED: 'Visitada',
  VERIFIED: 'Datos verificados',
}

/**
 * On what terms a party held the artwork (RF-509). The labels are written as the
 * provenance line reads them, because that is where they end up: «en depósito»,
 * not «depósito».
 */
export const PROVENANCE_CAPACITY_LABEL: Record<ProvenanceCapacity, string> = {
  OWNER: 'En propiedad',
  DEPOSIT: 'En depósito',
  LOAN: 'En préstamo',
  UNKNOWN: 'Se desconoce en qué calidad',
  UNREVIEWED: 'Sin revisar',
}

/**
 * How the artwork reached that party (RF-509). Separate from the capacity, and
 * not a duplicate of it: an artwork can be on deposit having arrived as a gift.
 */
export const PROVENANCE_ACQUISITION_LABEL: Record<ProvenanceAcquisition, string> = {
  PURCHASE: 'Compra',
  GIFT: 'Donación',
  INHERITANCE: 'Herencia',
  COMMISSION: 'Encargo',
  EXCHANGE: 'Permuta',
  UNKNOWN: 'Se desconoce cómo llegó',
  UNREVIEWED: 'Sin revisar',
}

/**
 * State of the research on a documentary block (RF-218). `NONE_FOUND` is spelled
 * out as a sentence and not as «No», because the whole point of the column is
 * that it is not the same thing: an empty block that nobody has looked at reads
 * «Sin revisar», and one that has been searched reads that it was searched.
 */
export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  UNREVIEWED: 'Sin revisar',
  IN_PROGRESS: 'Investigación en curso',
  NONE_FOUND: 'Investigado, sin resultados',
  COMPLETE: 'Investigación completa',
}

/** What each state of the research means, for the help text next to the selector (RF-218). */
export const RESEARCH_STATUS_DESCRIPTION: Record<ResearchStatus, string> = {
  UNREVIEWED: 'Nadie ha buscado todavía: el bloque vacío no dice nada',
  IN_PROGRESS: 'Se está buscando; lo que hay puede estar incompleto',
  NONE_FOUND: 'Se ha buscado y no hay nada que registrar. No se puede declarar con el bloque lleno',
  COMPLETE: 'La investigación de este bloque se da por cerrada',
}

/** Character of an exhibition. «Sin revisar» is the default: the title of a show is known long before its character. */
export const EXHIBITION_TYPE_LABEL: Record<ExhibitionTypeValue, string> = {
  INDIVIDUAL: 'Individual',
  COLLECTIVE: 'Colectiva',
  UNREVIEWED: 'Sin revisar',
}

/**
 * Kind of linked site (RF-1402). There is no label for the null value here on
 * purpose: «Sin clasificar» is the absence of a value and not a ninth kind, and
 * putting it in this map would let it be offered as one.
 */
export const EXTERNAL_LINK_TYPE_LABEL: Record<ExternalLinkType, string> = {
  MUSEUM_PAGE: 'Página de museo',
  ONLINE_CATALOG: 'Catálogo en línea',
  ART_DATABASE: 'Base de datos de arte',
  PRESS: 'Prensa',
  VIDEO: 'Vídeo',
  ARTIST_SITE: 'Web del artista',
  PHOTO_SOURCE: 'Origen de la fotografía',
  OTHER: 'Otro',
}

/**
 * Result of checking a link by hand (RF-1405). Read as what the person who
 * pressed the button just saw, which is how the question gets asked on returning
 * from the link.
 */
export const LINK_CHECK_STATUS_LABEL: Record<LinkCheckStatus, string> = {
  WORKING: 'Funciona',
  CHANGED: 'Ha cambiado',
  BROKEN: 'Ya no está',
}

/** What each answer means, for the help text beside the three buttons (RF-1405). */
export const LINK_CHECK_STATUS_DESCRIPTION: Record<LinkCheckStatus, string> = {
  WORKING: 'La página abre y muestra lo que se anotó',
  CHANGED: 'La página abre, pero ya no muestra lo que se anotó',
  BROKEN: 'La página ya no existe o da error',
}
