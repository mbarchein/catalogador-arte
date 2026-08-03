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

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
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
    'Testigo de gris detectado, declarado como hoja impresa en casa: la tinta doméstica no es ' +
    'neutra, así que sirve para los puntos negro y blanco, pero no como referencia de dominante',
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
