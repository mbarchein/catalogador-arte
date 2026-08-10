/**
 * What is withdrawn, turned into lines that are read and can be decided upon.
 *
 * A wastebasket that only says «there are five things» is of no use: what makes
 * it decidable whether something is recovered is **what it is, when it was withdrawn and who withdrew it**.
 * That is this module's job, and it is separate from the screen because that is where
 * the decisions are —what name is given to an author who no longer exists,
 * what is said about a date that is not recorded— and a screen cannot be tested in this
 * suite.
 *
 * **The signature is not worded here a second time.** The change history already settled
 * how whoever did something is named —name, and failing that e-mail, and failing that «El sistema»—, and
 * `authorName` is reused instead of rewritten: if the wastebasket and the history
 * signed the same person in two ways, one of the two would be wrong.
 */

import { authorName, type ChangeLogRow } from '../history/changeEntry'
import {
  cell,
  embeddedRetired,
  kindSpec,
  type TrashKindId,
  type TrashKindSpec,
  type TrashParent,
  type TrashRow,
} from './trashKinds'

/** The profile of whoever withdrew something, in the shape the history already has. */
export type TrashAuthor = NonNullable<ChangeLogRow['author']>

/**
 * Who withdrew the thing, as it is signed on screen.
 *
 * It delegates to the history on purpose. `authorName` only reads `row.author`, so it
 * is passed a row with that single field filled; the conversion is narrow and is
 * covered by a test that walks the fallback's three rungs, which is what
 * would warn if the history changed the ladder underneath.
 */
export function retiredByText(author: TrashAuthor | null): string {
  return authorName({ author } as Pick<ChangeLogRow, 'author'> as ChangeLogRow)
}

/**
 * When it was withdrawn, in Spanish and without the time when it adds nothing.
 *
 * Same wording as the change history: today and yesterday are named, because a
 * wastebasket is almost always opened to recover something just thrown away, and a
 * full date for that forces mental arithmetic about what day it is today.
 *
 * **And the date may not be recorded.** Measured: `deactivated_at` is stamped by the base on
 * every withdrawal, but a row moved by a migration was withdrawn by nobody and arrives
 * null. Saying «en una fecha que no consta» is the truth; putting today's date or
 * leaving the gap would be the two ways of lying.
 */
export function retiredWhenText(iso: string | null, now: Date): string {
  if (iso === null || iso.trim() === '') return 'en una fecha que no consta'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'en una fecha que no se ha podido leer'
  const hora = at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const dia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const ayer = new Date(now)
  ayer.setDate(ayer.getDate() - 1)
  if (dia(at) === dia(now)) return `hoy a las ${hora}`
  if (dia(at) === dia(ayer)) return `ayer a las ${hora}`
  const fecha = at.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return `el ${fecha} a las ${hora}`
}

/**
 * The trace's complete sentence: «Retirada por Victoria hoy a las 10:24».
 *
 * The participle comes from the class with its gender, because Spanish does not forgive it: deducing
 * it from the name gives «la fotografía retirado» and «el eslabón retirada».
 */
export function retiredTraceText(item: TrashItem, now: Date): string {
  const spec = kindSpec(item.kind)
  const participle = spec.retired.charAt(0).toUpperCase() + spec.retired.slice(1)
  return `${participle} por ${item.retiredBy} ${retiredWhenText(item.retiredAt, now)}`
}

/** A thing in the wastebasket, already ready to paint. */
export interface TrashItem {
  readonly kind: TrashKindId
  /** The key's value, for the `update` that recovers it. */
  readonly key: string
  /** What it is. Never empty. */
  readonly label: string
  /** What it hangs from or how it is told apart. Empty when it adds nothing. */
  readonly context: string
  readonly retiredAt: string | null
  /** Already resolved to a readable name. */
  readonly retiredBy: string
  /**
   * Why recovering it would not work yet, or `null` if it can be done.
   *
   * It is decided **before** writing, and it is not an excess of caution: measured against the
   * base, restoring something whose parent is still withdrawn does NOT fail —the row is active
   * again and still is not visible—. See `restoreBlock`.
   */
  readonly blocked: string | null
}

/**
 * Whether a row's parent is withdrawn, with the two ways of knowing it.
 *
 * `retiredKeys` is the set of withdrawn keys of the SAME table, which the
 * screen already has loaded. It is what resolves the two tables nested on
 * themselves, which PostgREST cannot embed.
 */
function parentRetired(
  parent: TrashParent,
  row: TrashRow,
  retiredKeys: ReadonlySet<string>,
): boolean | null {
  if (parent.via === 'embed') return embeddedRetired(row, parent.key)
  const id = cell(row, parent.column)
  // With no parent there is no withdrawn parent: a root location has a null `parent_id`.
  if (id === '') return null
  return retiredKeys.has(id)
}

/**
 * The sentence explaining why recovering something would not work yet, or `null`.
 *
 * **This is the reason the wastebasket is not a mute button.** The base accepts
 * restoring a link whose artwork is still withdrawn: the `update` affects one row,
 * answers 200 and the user sees «recovered» while nothing appears in the record,
 * because what is not visible is the artwork. Checked in the local base. So the case is
 * stopped here, what has to be recovered first is said, and nothing is written.
 *
 * ALL the withdrawn parents are named and not only the first: recovering the artwork only to
 * discover afterwards that the reference is missing too is making the same trip
 * twice.
 */
export function restoreBlock(
  spec: TrashKindSpec,
  row: TrashRow,
  retiredKeys: ReadonlySet<string>,
): string | null {
  const missing = spec.parents
    .filter((parent) => parentRetired(parent, row, retiredKeys) === true)
    .map((parent) => `${parent.what} (${parent.name(row)})`)
  if (missing.length === 0) return null
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`
  const head =
    missing.length === 1
      ? `Todavía no se puede recuperar: ${list} sigue en la papelera.`
      : `Todavía no se puede recuperar: ${list} siguen en la papelera.`
  return `${head} Recupera eso primero y esto volverá a verse; hacerlo al revés lo devolvería a un sitio que nadie mira.`
}

/**
 * Turns a class's rows into wastebasket lines.
 *
 * `authors` arrives resolved from a single query to `profiles` for the whole screen,
 * as in the history: they are a few people and not the whole team.
 */
export function toTrashItems(
  spec: TrashKindSpec,
  rows: readonly TrashRow[],
  authors: ReadonlyMap<string, TrashAuthor>,
): readonly TrashItem[] {
  // The set is computed once per class, not once per row: it is what resolves
  // the parent of the tables nested on themselves.
  const retiredKeys = new Set(rows.map((row) => cell(row, spec.key)))
  return rows.map((row) => {
    const by = cell(row, 'deactivated_by')
    const at = row['deactivated_at']
    return {
      kind: spec.id,
      key: cell(row, spec.key),
      label: spec.label(row),
      context: spec.context(row),
      retiredAt: typeof at === 'string' && at.trim() !== '' ? at : null,
      retiredBy: retiredByText(by === '' ? null : (authors.get(by) ?? null)),
      blocked: restoreBlock(spec, row, retiredKeys),
    }
  })
}

/**
 * «3 obras», «1 obra», «Nada retirado».
 *
 * The empty case is a sentence and not a zero, for the same reason as in the record's
 * blocks: «0 obras» reads as an answer about the catalogue, and here the answer
 * is that there is nothing of that class in the wastebasket.
 */
export function kindCountText(spec: TrashKindSpec, count: number): string {
  if (count <= 0) return 'Nada retirado'
  return `${count} ${count === 1 ? spec.one : spec.many}`
}

/** A class with what it has inside, to paint its block. */
export interface TrashKindView {
  readonly spec: TrashKindSpec
  readonly items: readonly TrashItem[]
  /** Whether the base had more than fit on one page. */
  readonly truncated: boolean
  /** What went wrong reading this class in particular, if anything did. */
  readonly error: string | null
}

/**
 * How many things there are in the wastebasket, counting every class.
 *
 * It is the first thing read on opening the screen, and that is why it counts things and not classes:
 * «5 cosas retiradas» answers the question one comes in with.
 */
export function trashTotalText(views: readonly TrashKindView[]): string {
  const total = views.reduce((sum, view) => sum + view.items.length, 0)
  if (total === 0) return 'No hay nada en la papelera.'
  const suffix = views.some((view) => view.truncated) ? ' o más' : ''
  return total === 1
    ? '1 cosa retirada, y nada se ha borrado de verdad.'
    : `${total}${suffix} cosas retiradas, y nada se ha borrado de verdad.`
}

/**
 * How many of them cannot be recovered yet.
 *
 * It is said at the top and not only line by line: if of thirty things twenty are
 * blocked by a withdrawn artwork, what has to be done is recover the artwork, and that
 * is not visible reading thirty identical warnings.
 */
export function blockedCountText(views: readonly TrashKindView[]): string | null {
  const blocked = views.reduce(
    (sum, view) => sum + view.items.filter((item) => item.blocked !== null).length,
    0,
  )
  if (blocked === 0) return null
  return blocked === 1
    ? 'Una de ellas no se puede recuperar todavía: hay que recuperar antes de lo que cuelga.'
    : `${blocked} de ellas no se pueden recuperar todavía: hay que recuperar antes de lo que cuelgan.`
}
