import {
  buildPlaceTree,
  flattenPlaces,
  placeAncestry,
  placeKey,
  placePathText,
  placesInside,
} from '../../lib/places'
import type { ArchiveSeries } from '../../lib/types'

/**
 * The archive classification tree, on the client side (RF-515, RF-1106).
 *
 * `archive_series` is the `fondo_serie` of v11 — a hierarchy written inside one
 * text with a separator convention — resolved with the shape ADR-006 already
 * fixed for the places: a node with an identity, a mutable parent, no two
 * siblings with the same name, no cycles, and nothing ever deleted.
 *
 * **The tree arithmetic is NOT reimplemented here: it is the one in
 * `lib/places.ts`.** An `ArchiveSeries` row and a `PhysicalPlace` row are the
 * same four columns for the same reason, so the depth-first flattening, the
 * es-ES sibling order, the descendants set and the 100-hop belt against a
 * corrupt hierarchy all apply verbatim. What this module adds is the archive's
 * own vocabulary (a root is a *fondo*, not a building), the decisions this
 * screen has to make before spending a request, and the Spanish sentence that
 * corresponds to each answer the database can give.
 *
 * What is NOT here is any rule the database already holds — sibling uniqueness,
 * the no-cycle trigger, the refusal to retire a series with subseries or
 * documents inside. Those live next to the data, where they cannot be bypassed,
 * and this only turns their answer into something the cataloger can act on.
 *
 * There is no DOM and no network here, which is what makes it testable for real.
 */

// ── The tree, borrowed from the places and renamed ────────────

/**
 * The series indexed for reading: by identifier, and by parent. Roots — the
 * *fondos* — sit under the `null` key, the same way the database spells them.
 *
 * This is `PlaceTree` with the nodes called by their name. **The assignment in
 * `buildSeriesTree` compiles because the two row shapes are identical, and that
 * is the guard**: the day either table grows a column the other lacks, that line
 * stops compiling instead of this screen quietly reading a shelf as a series.
 */
export interface SeriesTree {
  byId: Map<string, ArchiveSeries>
  childrenOf: Map<string | null, ArchiveSeries[]>
}

export function buildSeriesTree(rows: readonly ArchiveSeries[]): SeriesTree {
  // No cast: `PhysicalPlace` and `ArchiveSeries` are mutually assignable, so the
  // maps are too. The objects that come out are the ones that went in — this
  // renames them, it does not convert them.
  return buildPlaceTree(rows)
}

/** A series, how deep it sits, and its whole branch as text. */
export interface FlatSeries {
  series: ArchiveSeries
  depth: number
  /** «Correspondencia, Cartas recibidas»: the branch is what identifies a node. */
  path: string
}

/**
 * The tree flattened depth first — every node right under its parent — which is
 * the only order a hierarchy can be read in.
 *
 * `keep` decides which nodes appear: this screen shows everything, retired
 * included, because it is the only place a retired series can be brought back
 * from; the parent picker hides the node being moved and everything inside it,
 * which would be a cycle.
 */
export function flattenSeries(
  tree: SeriesTree,
  keep?: (series: ArchiveSeries) => boolean,
): FlatSeries[] {
  return flattenPlaces(tree, keep).map(({ place, depth, path }) => ({
    series: place,
    depth,
    path,
  }))
}

/** `ids` plus everything inside them, at any depth. What must not be offered as a destination. */
export function seriesInside(tree: SeriesTree, ids: readonly string[]): Set<string> {
  return placesInside(tree, ids)
}

/** The branch from the fondo down, separated by commas. Empty when the node is unknown. */
export function seriesPathText(tree: SeriesTree, id: string | null): string {
  return placePathText(tree, id)
}

/**
 * How deep a node sits: 0 for a fondo, 1 for a series inside it, and −1 for
 * `null` — so that the depth of a new child is always `seriesDepth(parent) + 1`,
 * with no special case for the first level.
 */
export function seriesDepth(tree: SeriesTree, id: string | null): number {
  return id === null ? -1 : placeAncestry(tree, id).length - 1
}

/**
 * What a node at that depth is called: RF-515 names the three levels — fondo,
 * serie, subserie — and the depth is the only thing that tells them apart.
 * Showing the word teaches the shape of the classification instead of leaving
 * the indentation to be decoded.
 *
 * Deeper than a subseries is legal and nothing forbids it, so it is named by its
 * level rather than pretended away.
 */
export function seriesLevelLabel(depth: number): string {
  if (depth <= 0) return 'Fondo'
  if (depth === 1) return 'Serie'
  if (depth === 2) return 'Subserie'
  return `Subserie de nivel ${depth + 1}`
}

// ── Comparing names ──────────────────────────────────────────

/**
 * The comparison key of a series name.
 *
 * **Both unique indexes of the table are over `public.place_key(name)`** —
 * `archive_series_root_unique` among the fondos and
 * `archive_series_siblings_unique` inside each parent — so the screen has to
 * compare exactly as that function does, and `placeKey` is the mirror of it that
 * already exists. Two normalizers that disagreed would offer to create a series
 * the database then rejects, or swallow one it would have accepted.
 *
 * The tempting shortcut, `normalizeForSearch`, is NOT equivalent: it strips
 * combining marks, so it flattens the ñ and the ç as well. It would call
 * «Niñeces» and «Nineces» the same series and answer «ya está» to a name the
 * database would have taken.
 */
export function seriesKey(name: string): string {
  return placeKey(name)
}

/** The siblings a name has to be unique among: the fondos, or the children of one node. */
function siblingsOf(tree: SeriesTree, parentId: string | null): readonly ArchiveSeries[] {
  return tree.childrenOf.get(parentId) ?? []
}

// ── Adding ───────────────────────────────────────────────────

/**
 * What typing a name into «Añadir» means, with the parent already chosen.
 *
 * `restore` is the case that cannot be left to the insert: nothing is ever
 * deleted (RF-901), so a retired «Cartas recibidas» is still in the table and
 * inserting it comes back as a unique violation indistinguishable from «someone
 * added it a second ago». Reporting success there would say «añadida» and leave
 * the series hidden, which is the opposite of what typing its name means.
 *
 * `reuse` is the equivalent-and-active case: «cartas recibidas» when «Cartas
 * recibidas» is already inside that parent. It is a success and it writes
 * nothing — the node the cataloger meant is already on screen, one row below.
 */
export type SeriesAdditionPlan =
  | { action: 'blank' }
  | { action: 'insert'; name: string; parentId: string | null }
  | { action: 'reuse'; series: ArchiveSeries }
  | { action: 'restore'; series: ArchiveSeries }

export function planSeriesAddition(
  tree: SeriesTree,
  parentId: string | null,
  text: string,
): SeriesAdditionPlan {
  // Trimmed here and not only shown trimmed: `archive_series_name_not_blank`
  // demands that the name equal its own trim, so letting «Prensa » through would
  // answer with an English constraint name (checked against the base: 23514).
  const name = text.trim()
  if (name === '') return { action: 'blank' }

  const key = seriesKey(name)
  const twin = siblingsOf(tree, parentId).find((series) => seriesKey(series.name) === key)
  if (twin === undefined) return { action: 'insert', name, parentId }
  return twin.active ? { action: 'reuse', series: twin } : { action: 'restore', series: twin }
}

/** What the screen answers to an addition it can settle without asking. */
export function seriesAdditionProblem(plan: SeriesAdditionPlan): string | null {
  return plan.action === 'blank' ? 'Escribe el nombre de la serie' : null
}

/**
 * The line under the «Añadir» field: where the new node will hang and what it
 * will be called.
 *
 * It exists because the level is not visible from the form: the same two fields
 * create a fondo or a subseries depending on one tap made earlier, and «Se
 * creará como serie dentro de «Correspondencia»» is the difference between
 * filing a series and starting a second fondo by accident.
 */
export function seriesAdditionSummary(tree: SeriesTree, parentId: string | null): string {
  if (parentId === null) {
    return 'Se creará como un fondo, en el primer nivel de la clasificación.'
  }
  const path = seriesPathText(tree, parentId)
  // The chosen parent is gone from the list: retired out from under the form, or
  // the copy on screen is stale. Saying so beats creating a fondo by surprise.
  if (path === '') {
    return 'La serie que habías elegido ya no está en la lista: vuelve a elegir dónde va.'
  }
  const level = seriesLevelLabel(seriesDepth(tree, parentId) + 1).toLowerCase()
  return `Se creará como ${level} dentro de «${path}».`
}

/**
 * What the «Añadir» button says, which is the level of the node about to be
 * created — «Añadir fondo», «Añadir serie», «Añadir subserie».
 *
 * One button and three labels rather than one label for three outcomes: the level
 * depends on a tap made earlier, up in the form, and the button is the last thing
 * read before it happens. When the chosen parent has vanished it goes back to a
 * bare «Añadir», because naming a level there would be a guess (and
 * `canAddSeries` has already switched the button off).
 */
export function seriesAddLabel(tree: SeriesTree, parentId: string | null): string {
  if (parentId !== null && !tree.byId.has(parentId)) return 'Añadir'
  return `Añadir ${seriesLevelLabel(seriesDepth(tree, parentId) + 1).toLowerCase()}`
}

/**
 * Whether «Añadir» can be pressed: a name, and a place that still exists.
 *
 * The second half is not paranoia about the impossible — it is a series retired or
 * moved from another session while this form was half filled in. Sending it anyway
 * would come back as a foreign-key violation, and the honest answer («la serie que
 * habías elegido ya no está») is one the screen can give without asking.
 */
export function canAddSeries(tree: SeriesTree, parentId: string | null, text: string): boolean {
  if (text.trim() === '') return false
  return parentId === null || tree.byId.has(parentId)
}

// ── Renaming ─────────────────────────────────────────────────

/**
 * What saving the rename field means.
 *
 * `unchanged` earns its place: opening the pencil and saving without touching
 * anything would otherwise be a write, a reload and a row of audit trail for
 * nothing.
 *
 * `taken` is predicted here on purpose, even though the database enforces it:
 * the colliding node is almost always visible on the screen, and «ya hay otra
 * serie llamada así en el mismo sitio» is a better answer than a round trip that
 * comes back naming an index. It excludes the node itself, so correcting
 * «correspondencia» to «Correspondencia» — which is exactly what the v11
 * migration left to be corrected — is still possible.
 */
export type SeriesRenamePlan =
  | { action: 'blank' }
  | { action: 'unchanged' }
  | { action: 'taken'; series: ArchiveSeries }
  | { action: 'rename'; name: string }

export function planSeriesRename(tree: SeriesTree, id: string, text: string): SeriesRenamePlan {
  const name = text.trim()
  if (name === '') return { action: 'blank' }

  const node = tree.byId.get(id)
  // Unknown node: the copy on screen is stale. The rename travels anyway and the
  // database answers with zero rows touched, which the screen already reads as
  // «nothing was saved» — inventing a second sentence for it here would be a
  // guess about why.
  if (node === undefined) return { action: 'rename', name }
  if (name === node.name) return { action: 'unchanged' }

  const key = seriesKey(name)
  const twin = siblingsOf(tree, node.parent_id).find(
    (series) => series.id !== id && seriesKey(series.name) === key,
  )
  return twin === undefined ? { action: 'rename', name } : { action: 'taken', series: twin }
}

export function seriesRenameProblem(plan: SeriesRenamePlan): string | null {
  if (plan.action === 'blank') return 'El nombre no puede quedar vacío'
  if (plan.action === 'taken') return takenText(plan.series, 'rename')
  return null
}

// ── Moving ───────────────────────────────────────────────────

/**
 * What choosing a new parent means.
 *
 * The three refusals are predicted and not left to the round trip because all
 * three are answerable from the tree already on screen, and because two of them
 * have a consequence worth naming: moving a fondo into its own subseries is the
 * cycle that makes a branch unreachable without deleting anything, and a name
 * already taken at the destination is a rename waiting to happen, not a dead
 * end. The database keeps the last word — its trigger is the one that cannot be
 * bypassed — and its sentences are mapped too.
 */
export type SeriesMovePlan =
  | { action: 'unchanged' }
  | { action: 'itself' }
  | { action: 'descendant' }
  | { action: 'taken'; series: ArchiveSeries }
  | { action: 'move'; parentId: string | null }

export function planSeriesMove(
  tree: SeriesTree,
  id: string,
  parentId: string | null,
): SeriesMovePlan {
  if (parentId === id) return { action: 'itself' }

  const node = tree.byId.get(id)
  // Stale copy again: let the database answer rather than guess.
  if (node === undefined) return { action: 'move', parentId }
  if (parentId === node.parent_id) return { action: 'unchanged' }
  if (parentId !== null && seriesInside(tree, [id]).has(parentId)) {
    return { action: 'descendant' }
  }

  const key = seriesKey(node.name)
  const twin = siblingsOf(tree, parentId).find(
    (series) => series.id !== id && seriesKey(series.name) === key,
  )
  return twin === undefined ? { action: 'move', parentId } : { action: 'taken', series: twin }
}

export function seriesMoveProblem(plan: SeriesMovePlan): string | null {
  if (plan.action === 'itself') return 'Una serie no puede estar dentro de sí misma.'
  if (plan.action === 'descendant') {
    return (
      'Ese destino está dentro de la serie que estás moviendo, y la rama dejaría de verse. Saca antes lo que quieras conservar.'
    )
  }
  if (plan.action === 'taken') return takenText(plan.series, 'move')
  return null
}

// ── The name that is already taken ───────────────────────────

/**
 * The sentence for a name a sibling already has, shared by the local prediction
 * and by the `23505` the database sends: the same collision has to read the same
 * before and after the request, or the screen looks like it changed its mind.
 *
 * Whether the twin is retired changes the advice, and that is the whole reason
 * this takes the row and not just its name: a retired one can be brought back —
 * with its subseries and its documents — and creating a second one with the same
 * name instead is how a classification ends up with two «Cartas recibidas», one
 * of them empty.
 */
export function takenText(twin: ArchiveSeries, action: 'add' | 'rename' | 'move'): string {
  const head = `Ya hay otra serie llamada «${twin.name}» en ese mismo sitio.`
  const spelling = 'Las mayúsculas y las tildes no cuentan para distinguirlas.'
  if (!twin.active) {
    return `${head} ${spelling} Está retirada: recupérala en vez de crear una segunda con el mismo nombre, y así vuelve con lo que tenía dentro.`
  }
  if (action === 'move') {
    return `${head} ${spelling} Cambia antes uno de los dos nombres, o elige otro destino.`
  }
  if (action === 'rename') {
    return `${head} ${spelling} Si lo que quieres es unirlas, mueve antes lo que hay dentro de la que sobra y retírala.`
  }
  return `${head} ${spelling}`
}

// ── What the database answers ────────────────────────────────

/** Everything this screen asks of the database, for the message each answer deserves. */
export type SeriesAction = 'load' | 'add' | 'rename' | 'move' | 'retire' | 'restore'

/**
 * A refusal as PostgREST sends it: the SQLSTATE, the message and the hint, in
 * three separate fields.
 *
 * Declared here instead of importing `PostgrestError` so this module stays free
 * of the client, and because only these three fields are read. A `PostgrestError`
 * fits the shape.
 */
export interface DatabaseRefusal {
  code?: string | null
  message: string
  hint?: string | null
}

const VERB: Record<SeriesAction, string> = {
  load: 'cargar la clasificación archivística',
  add: 'crear la serie',
  rename: 'renombrar la serie',
  move: 'mover la serie',
  retire: 'retirar la serie',
  restore: 'recuperar la serie',
}

/**
 * The sentence the screen shows when the database says no.
 *
 * **Every case below was provoked against the local database and read, not
 * imagined** — by psql with BEGIN/ROLLBACK and again over HTTP through the same
 * PostgREST the application talks to, as a real Cataloger and as a real Reader:
 *
 *  - `23505` twice, because the table has TWO partial unique indexes and they
 *    are different mistakes: `archive_series_root_unique` means a second fondo
 *    with that name, `archive_series_siblings_unique` means a second child
 *    inside the same parent. The raw message names the index and nothing else,
 *    so the index name is the only thing that tells them apart.
 *  - `23514` for `archive_series_name_not_blank`, which fires both for a blank
 *    name and for one with a space around it.
 *  - `P0001` for the four trigger refusals — the two cycles and the two «no se
 *    puede retirar». **Their messages are already in Spanish** («Ese movimiento
 *    metería la serie dentro de una de sus subseries», «No se puede retirar una
 *    serie que todavía tiene documentos dentro») **and the hint is the half that
 *    says what to do** («Mueve antes los documentos a otra serie.»), and the two
 *    arrive in separate fields. Rewriting them here would be a second copy of a
 *    sentence that already lives next to the rule; both halves are shown, joined.
 *  - `42501` when the session may no longer write.
 *  - `23503` on `archive_series_parent_id_fkey` or on the documents' key: it
 *    cannot come from this screen, which never deletes, but a mapped code costs
 *    a line and an unmapped one shows English.
 *  - no code at all, which is the network: the request never reached the
 *    catalog, and saying so also says the change is not lost, just not sent.
 *
 * `null` is the quiet failure and the one worth the most: **an update the
 * policies deny comes back 204, or 200 with an empty list, and NO error**
 * (checked with a Reader's token). Without asking for the affected rows the
 * screen would report «guardado» and change nothing, which is the one mistake a
 * maintenance screen cannot make.
 */
export function describeArchiveSeriesFailure(
  action: SeriesAction,
  refusal: DatabaseRefusal | null,
): string {
  if (refusal === null) {
    return (
      'No se ha guardado nada: o tu sesión no puede mantener las tablas, o la serie ya no está. Vuelve a entrar.'
    )
  }

  const message = refusal.message.trim()

  if (refusal.code === '23505') {
    const spelling = 'Las mayúsculas y las tildes no cuentan para distinguirlas.'
    if (message.includes('archive_series_root_unique')) {
      return `Ya hay un fondo con ese nombre en el primer nivel. ${spelling} Si el que buscas está retirado, vuelve a escribir su nombre para recuperarlo.`
    }
    return `Ya hay otra serie con ese nombre dentro de la misma. ${spelling} Cambia el nombre, o mira si la que ya está es la que buscabas.`
  }

  if (refusal.code === '23514') {
    return 'El nombre no puede quedar vacío, ni empezar ni acabar con un espacio.'
  }

  if (refusal.code === 'P0001') {
    // The trigger writes for the cataloger, in Spanish. What it says is shown,
    // and the hint with it: joined with a full stop, without doubling the one
    // the message may already end with.
    const hint = refusal.hint?.trim() ?? ''
    const head = message.replace(/[.\s]+$/, '')
    return hint === '' ? `${head}.` : `${head}. ${hint}`
  }

  if (refusal.code === '42501') {
    return (
      'Tu sesión no tiene permiso para mantener la clasificación archivística. Vuelve a ' +
      'entrar en la aplicación; si sigue igual, es que tu cuenta ya no es de catalogación.'
    )
  }

  if (refusal.code === '23503') {
    // Only one foreign key can fail from this screen — `parent_id` — and only in
    // one direction, because nothing here deletes: the parent that was chosen is
    // no longer in the catalog. Checked against the base, which answers
    // «insert or update on table "archive_series" violates foreign key
    // constraint "archive_series_parent_id_fkey"» with the detail «Key is not
    // present in table "archive_series"». Nothing was written.
    return (
      'La serie que habías elegido ya no está en el catálogo, así que no hay dónde ponerla. ' +
      'Vuelve a la lista, elige otra vez dónde va y repítelo.'
    )
  }

  if (message === '' || /failed to fetch|networkerror|network error|load failed/i.test(message)) {
    return `No se ha podido ${VERB[action]}: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.`
  }

  return `No se ha podido ${VERB[action]}: ${message}`
}

// ── Retiring: how much is inside, and where to look ──────────

/**
 * What a series holds, asked of the database AFTER it refused to retire it.
 *
 * `subseriesCount` and `documentCount` are the totals; the two lists are the
 * first few, for naming them. The counts can be larger than the lists.
 */
export interface SeriesContents {
  subseries: readonly { name: string }[]
  subseriesCount: number
  documents: readonly { archive_code: string | null; title: string }[]
  documentCount: number
}

/** How a document is named in a sentence: by its signature when it has one. */
function documentText(document: { archive_code: string | null; title: string }): string {
  const code = document.archive_code?.trim() ?? ''
  const title = document.title.trim()
  if (code === '') return `«${title}»`
  return `«${code} · ${title}»`
}

/**
 * ««A», «B» y 3 más», or nothing when there is nothing to name.
 *
 * `total` is what the database counted and the list is only the first few, so the
 * tail is what was not named. `oneMore` is asked for because the two things being
 * counted here do not share a gender — one series more is «una más», one document
 * more is «uno más» — and a screen in Spanish that gets that wrong reads like a
 * translation.
 */
function nameList(texts: readonly string[], total: number, oneMore: string): string {
  const shown = texts.slice(0, Math.max(total, 0))
  const rest = total - shown.length
  if (shown.length === 0) return ''
  if (rest > 0) return `${shown.join(', ')} y ${rest === 1 ? oneMore : `${rest} más`}`
  if (shown.length === 1) return shown[0]!
  return `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]!}`
}

/**
 * How to find the documents a series is holding.
 *
 * **The archive has no screen of its own yet**, so «dónde mirarlos» cannot be a
 * link: a document is read from the record of each artwork it is attached to,
 * and its signature is how it is found among the papers. Saying that is more use
 * than saying nothing, and it is the honest state of the application today.
 */
export const WHERE_TO_LOOK =
  'Los documentos del archivo se consultan hoy desde la ficha de las obras a las que están ' +
  'vinculados, y su signatura es la que los localiza entre los papeles.'

/**
 * How much is inside a series, in a sentence — or null when the answer is
 * «nothing», which after a refusal means somebody emptied it in between.
 *
 * **This is the half the database does not say.** Its trigger answers «No se
 * puede retirar una serie que todavía tiene documentos dentro» and a hint about
 * moving them, and both are shown; what it never says is HOW MANY and WHICH,
 * which is the difference between a wall and a list of things to do. Two
 * documents get moved on the spot; two hundred is a decision for another day.
 *
 * **It is asked for after the refusal and never before, and that is what keeps
 * it from being a second copy of the rule.** No count on this side decides
 * anything: the «Retirar» button always asks the database, and the database
 * always answers. A number read one request later cannot be stale enough to
 * matter, and cannot disagree with the refusal it is explaining.
 */
export function describeSeriesContents(contents: SeriesContents): string | null {
  const parts: string[] = []

  if (contents.subseriesCount > 0) {
    const named = nameList(
      contents.subseries.map((series) => `«${series.name.trim()}»`),
      contents.subseriesCount,
      'una más',
    )
    const count =
      contents.subseriesCount === 1 ? '1 serie dentro' : `${contents.subseriesCount} series dentro`
    parts.push(named === '' ? `Tiene ${count}.` : `Tiene ${count}: ${named}.`)
  }

  if (contents.documentCount > 0) {
    const named = nameList(contents.documents.map(documentText), contents.documentCount, 'uno más')
    const count =
      contents.documentCount === 1 ? '1 documento' : `${contents.documentCount} documentos`
    const head = contents.subseriesCount > 0 ? `Y ${count}` : `Tiene ${count}`
    parts.push(named === '' ? `${head}.` : `${head}: ${named}.`)
    parts.push(WHERE_TO_LOOK)
  }

  return parts.length === 0 ? null : parts.join(' ')
}

/**
 * The whole answer to a «Retirar» that the database refused: its own sentence,
 * and then how much is inside.
 *
 * `contents` is null when the follow-up question could not be asked or found
 * nothing — a lost race, or a Reader who may not read the trash. Then the
 * database's sentence stands alone, which is still a complete answer.
 */
export function retireRefusalText(
  refusal: DatabaseRefusal,
  contents: SeriesContents | null,
): string {
  const said = describeArchiveSeriesFailure('retire', refusal)
  const inside = contents === null ? null : describeSeriesContents(contents)
  return inside === null ? said : `${said} ${inside}`
}

// ── What the screen says about the list ──────────────────────

/**
 * The line under the title: how many fondos, how many series inside them, and
 * how many are retired.
 *
 * The shape of a classification is a number nobody can count off an indented
 * list on a phone, and «3 fondos y 24 series dentro» is also the sanity check
 * that a move did what it looked like it did.
 */
export function summarizeSeriesTree(tree: SeriesTree): string | null {
  const all = [...tree.byId.values()]
  if (all.length === 0) return null

  const roots = tree.childrenOf.get(null)?.length ?? 0
  const inside = all.length - roots
  const retired = all.filter((series) => !series.active).length

  let text = roots === 1 ? '1 fondo' : `${roots} fondos`
  if (inside > 0) text += inside === 1 ? ' y 1 serie dentro' : ` y ${inside} series dentro`
  if (retired > 0) text += retired === 1 ? ', 1 retirada' : `, ${retired} retiradas`
  return text
}

/**
 * What a list with no rows says. Never a blank page, and never a lie either:
 * the other screens of the section paint «todavía no hay ninguno» whenever the
 * list is empty and not loading, **which also happens when the load failed** —
 * claiming the table is empty when nobody knows. Here, while it loads it says
 * so; if it failed it keeps quiet, because the error already has its own
 * paragraph above; and it only states the emptiness when it is true.
 *
 * And the empty case is the normal one today, not an edge: RF-515 gave this
 * table no seed on purpose — «nace opcional: si la clasificación archivística no
 * se adopta nunca, se queda vacía y no estorba» — so this text is the whole
 * screen the first time it is opened, and it has to explain what the thing is.
 */
export function seriesListNotice(state: {
  loading: boolean
  error: string | null
  count: number
}): string | null {
  if (state.loading) return 'Cargando la clasificación archivística…'
  if (state.error !== null) return null
  if (state.count > 0) return null
  return (
    'Todavía no hay ninguna serie: fondos, series y subseries, unos dentro de otros. El primero se crea aquí arriba.'
  )
}
