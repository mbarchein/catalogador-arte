/**
 * The chain of provenance read as a story (RF-509, RF-510).
 *
 * `provenance_events` is not a field with several values: it is a sequence of
 * dated hands the artwork passed through, and the only reason to store it that
 * way is to be able to READ it that way — who had it, on what terms, between
 * which years, and above all **where the chain stops saying anything**.
 *
 * That last part is what this module exists for. Three situations look identical
 * in a list of rows and mean different things to whoever judges a provenance:
 *
 *   · A GAP. Between 1971 and 1984 no link covers the artwork. The catalogue
 *     does not claim it stayed where it was, and does not claim it changed
 *     hands: it says nothing at all about those years.
 *   · A LINK WITH NO IDENTIFIED PARTY. «Colección particular, España» is a
 *     documented stretch whose holder has no record behind it — the research
 *     happened and this is its result, which is a different thing from a gap.
 *   · A STRETCH INVESTIGATED WITH NO RESULT. `capacity` or `acquisition` in
 *     `UNKNOWN` is «se buscó y no consta»; in `UNREVIEWED` it is «nobody has
 *     looked». The two must never read the same (RF-205, RF-218).
 *
 * Everything here is pure and takes plain rows: the battery runs in node, so the
 * sentence a curator reads is verified here and not inside a component.
 */

import {
  PROVENANCE_ACQUISITION_LABEL,
  PROVENANCE_CAPACITY_LABEL,
  type ProvenanceAcquisition,
  type ProvenanceCapacity,
  type ResearchStatus,
} from '../../../lib/types'
import { displayStructuredDate, partyName, partyPlace } from '../documentaryFormat'
import type { ProvenanceEventRow } from '../documentaryRows'
import type { BlockState } from '../researchState'
import type { DocumentarySectionSpec } from '../sections'
import { statusUnknownNotice } from './researchStatusChoice'

/** The year the reader is in. Injectable everywhere below, so the tests do not drift with the calendar. */
export function thisYear(): number {
  return new Date().getFullYear()
}

// ── One link, as the record reads it ─────────────────────────

/**
 * One link of the chain, resolved into what gets painted.
 *
 * `identified` and `retired` are separate on purpose: a link whose party record
 * was retired (RF-901) still names it — greyed out, never blank, for the reason
 * `usePhysicalPlaces` already wrote down — and a link that never had a record is
 * not a defect at all.
 */
export interface ChainLink {
  id: string
  /** Its place in the chain the cataloger arranged, 1..n. */
  position: number
  /** Its place in what is on screen, 1..n, which is the same thing once sorted. */
  ordinal: number
  /** Who held it: the record's name, or how the link says it consta. */
  name: string
  /** `Badajoz, España` of the party record. Empty when it has none, or the record does not say. */
  place: string
  /** The precision the link adds over the record: «propiedad de la tía de X». Empty when the note IS the name. */
  detail: string
  /** There is a party record behind this link. */
  identified: boolean
  /** The party record is in the trash. The name is still shown. */
  retired: boolean
  /** `c. 1985-1990`, or «Sin fecha» — never a gap (RF-304). */
  dates: string
  /** The link can be placed in time: it has a structured start year. */
  dated: boolean
  /** On what terms it was held, said so that it cannot be confused with the other «Sin revisar». */
  capacityText: string
  capacityUnreviewed: boolean
  /** How it got there. */
  acquisitionText: string
  acquisitionUnreviewed: boolean
  /** Source and reliability of the datum (RF-214). */
  note: string
  /** Last link of the chain: the one that answers «and now?». */
  last: boolean
}

/**
 * On what terms the party held the artwork, named so that the row says WHICH
 * question is unanswered.
 *
 * The bare label of `UNREVIEWED` is «Sin revisar», and a row carrying two chips
 * that both read «Sin revisar» tells the cataloger nothing: the value has to
 * carry its question. Everything else is read from the shared label map, so
 * renaming a term happens in one place.
 */
export function capacityText(capacity: ProvenanceCapacity): string {
  return capacity === 'UNREVIEWED'
    ? 'En qué calidad, sin revisar'
    : PROVENANCE_CAPACITY_LABEL[capacity]
}

/** How the artwork got to that party, with the same rule as `capacityText`. */
export function acquisitionText(acquisition: ProvenanceAcquisition): string {
  return acquisition === 'UNREVIEWED'
    ? 'Cómo llegó, sin revisar'
    : PROVENANCE_ACQUISITION_LABEL[acquisition]
}

/** The links as the record paints them, in the order they arrive (already `position`-sorted). */
export function chainLinks(rows: readonly ProvenanceEventRow[]): ChainLink[] {
  return rows.map((row, index) => ({
    id: row.id,
    position: row.position,
    ordinal: index + 1,
    name: partyName(row.party, row.party_note),
    place: partyPlace(row.party),
    // When there is no record, `party_note` is already the name and repeating it
    // under itself would read as two different data.
    detail: row.party ? row.party_note.trim() : '',
    identified: row.party_id !== null,
    retired: row.party !== null && !row.party.active,
    dates: displayStructuredDate(row),
    dated: row.start_year !== null,
    capacityText: capacityText(row.capacity),
    capacityUnreviewed: row.capacity === 'UNREVIEWED',
    acquisitionText: acquisitionText(row.acquisition),
    acquisitionUnreviewed: row.acquisition === 'UNREVIEWED',
    note: row.note.trim(),
    last: index === rows.length - 1,
  }))
}

// ── Where the chain stops saying anything ────────────────────

/** The years a link covers. `to` null means the link does not say until when. */
export interface LinkSpan {
  from: number
  to: number | null
}

/**
 * The years a link can be placed in, or null when it cannot.
 *
 * The STRUCTURED years are what is measured, and not `date_text`: a link whose
 * date is «finales de los setenta» prints that sentence and is not a number, and
 * the reason ADR-004 keeps both is precisely that only one of the two can be
 * computed with.
 */
export function linkSpan(row: ProvenanceEventRow): LinkSpan | null {
  if (row.start_year === null) return null
  return { from: row.start_year, to: row.end_year }
}

/**
 * How far the chain documents the artwork.
 *
 * `covered` is a MAXIMUM over every link and not «the last one», because links
 * overlap legitimately: an owner from 1950 to 1995 and a museum holding the piece
 * on deposit from 1985 to 1990 are two true links at once, and when the deposit
 * closes the artwork is still documented — in the owner's hands — until 1995.
 *
 * `open` is sticky for the same reason read the other way: ONE link with no
 * closing year is enough for the chain not to close, whatever the links under it
 * say. That owner may still have it, and «la cadena termina en 1990» printed over
 * an open tenure would be the screen closing a chain nobody closed.
 */
export interface ChainReach {
  /** The furthest year the chain documents. Null when no link is dated. */
  covered: number | null
  /** The link that reaches that year. */
  coveringId: string | null
  /** Some dated link does not say until when: the chain does not demonstrably close. */
  open: boolean
  /** Who may have it now: the latest link left open, or the one at the frontier. */
  holderId: string | null
}

/** How far the whole chain documents the artwork. */
export function chainReach(rows: readonly ProvenanceEventRow[]): ChainReach {
  let covered: number | null = null
  let coveringId: string | null = null
  let openFrom: number | null = null
  let openId: string | null = null

  for (const row of rows) {
    const span = linkSpan(row)
    if (!span) continue
    const reach = span.to ?? span.from
    if (covered === null || reach > covered) {
      covered = reach
      coveringId = row.id
    }
    if (span.to === null && (openFrom === null || span.from > openFrom)) {
      openFrom = span.from
      openId = row.id
    }
  }

  return { covered, coveringId, open: openId !== null, holderId: openId ?? coveringId }
}

/** Why a stretch of the chain says nothing. */
export type GapReason =
  /** No link covers those years at all. */
  | 'unrecorded'
  /** The link before does not say until when it had the artwork. */
  | 'open-end'

/**
 * A stretch of years the chain does not document.
 *
 * `afterId` null is the gap that opens at the execution of the artwork — the
 * provenance of a catalogue raisonné starts at the artist — and `beforeId` null
 * is the one that reaches the present, which is the gap a curator asks about
 * first: «and where is it now?».
 */
export interface ChainGap {
  /** Link that closes before the gap; null when the gap opens at the artwork's execution. */
  afterId: string | null
  /** Link that opens after the gap; null when the gap reaches the present. */
  beforeId: string | null
  fromYear: number
  toYear: number
  reason: GapReason
  /** What the cataloger reads, in full. Never empty. */
  text: string
}

function yearsText(count: number): string {
  return count === 1 ? 'un año' : `${count} años`
}

/** `de 1971 a 1984`, or `el año 1971` when the stretch is a single one. */
function spanText(from: number, to: number): string {
  return from === to ? `el año ${from}` : `de ${from} a ${to}`
}

/**
 * The stretches the chain does not cover.
 *
 * A gap is claimed only when at least one whole year is left out — a handover in
 * 1985 between a link that closes in 1985 and one that opens in 1985 is not a
 * gap, and neither is 1984→1985. Anything less than that would flag every
 * ordinary chain and teach the eye to skip the notice.
 *
 * **An overlap is never reported, and it is not ignored either.** A link closing
 * in 1995 followed by one that opens in 1985 looks wrong and usually is not: an
 * owner keeping title from 1950 while a museum holds the piece on deposit from
 * 1985 is two true links at once, which is exactly why `capacity` exists.
 * Reporting it would fill a correct chain with warnings — but the years that
 * owner covers still count, so what is compared is the RUNNING COVERAGE of every
 * link so far and not the one immediately above. Comparing neighbours would
 * invent a gap from 1991 in the example, with the owner's line right there
 * saying otherwise.
 */
export function chainGaps(
  rows: readonly ProvenanceEventRow[],
  options: { originYear?: number | null; currentYear?: number } = {},
): ChainGap[] {
  const gaps: ChainGap[] = []
  const currentYear = options.currentYear ?? thisYear()
  const dated = rows.filter((row) => row.start_year !== null)
  if (dated.length === 0) return gaps

  // ── From the execution of the artwork to the earliest link ──
  const origin = options.originYear ?? null
  const earliest = dated.reduce((best, row) => (row.start_year! < best.start_year! ? row : best))
  if (origin !== null && earliest.start_year! - origin >= 2) {
    const from = origin + 1
    const to = earliest.start_year! - 1
    gaps.push({
      afterId: null,
      beforeId: earliest.id,
      fromYear: from,
      toYear: to,
      reason: 'unrecorded',
      text:
        `La obra es de ${origin} y el primer eslabón documentado empieza en ${earliest.start_year}: ` +
        `${spanText(from, to)} no consta por dónde pasó. Una procedencia empieza en el artista, ` +
        'así que este hueco es parte de la cadena y no un preámbulo.',
    })
  }

  // ── Between links ──
  // The FRONTIER as the reading advances: the furthest year reached so far, and
  // whether the link that reached it says until when. That second flag decides
  // the wording, so it is the frontier's and not the whole chain's — an earlier
  // open link does not make the gap after a later closed one read «no dice hasta
  // cuándo», because the one right above it did say.
  let covered: number | null = null
  let coveringId: string | null = null
  let frontierOpen = false

  for (const row of dated) {
    const span = linkSpan(row)!
    if (covered !== null && span.from - covered >= 2) {
      const from = covered + 1
      const to = span.from - 1
      gaps.push({
        afterId: coveringId,
        beforeId: row.id,
        fromYear: from,
        toYear: to,
        reason: frontierOpen ? 'open-end' : 'unrecorded',
        text: frontierOpen
          ? 'El eslabón anterior no dice hasta cuándo tuvo la obra, y el siguiente empieza en ' +
            `${span.from}: ${spanText(from, to)} la cadena no está documentada. Puede que no se ` +
            'moviera de sitio y puede que pasara por otras manos: el catálogo no lo afirma.'
          : `Hueco de ${yearsText(to - from + 1)} en la cadena: ${spanText(from, to)} no consta ` +
            'en qué manos estuvo la obra. No dice que se quedara donde estaba; dice que nadie lo ' +
            'ha documentado todavía.',
      })
    }
    const reachYear = span.to ?? span.from
    if (covered === null || reachYear > covered) {
      covered = reachYear
      coveringId = row.id
      frontierOpen = span.to === null
    } else if (reachYear === covered && span.to === null) {
      frontierOpen = true
    }
  }

  // ── From the end of the chain to today ──
  // Only when the chain actually closes, and that is the whole chain's question
  // and not the frontier's: one link left open anywhere is a tenure that may
  // still be running, and a gap asserted over it would be invented.
  const reach = chainReach(rows)
  if (reach.covered !== null && !reach.open && currentYear - reach.covered >= 2) {
    const from = reach.covered + 1
    gaps.push({
      afterId: reach.coveringId,
      beforeId: null,
      fromYear: from,
      toYear: currentYear,
      reason: 'unrecorded',
      text:
        `El último eslabón se cierra en ${reach.covered}: de ${from} a hoy no consta por dónde ha ` +
        'pasado la obra ni en qué manos está. Es el hueco que primero se pregunta.',
    })
  }

  return gaps
}

/**
 * How the chain reads as a whole, as a name and not a colour — the same choice
 * `BlockTone` makes, so the wording and the palette can move independently.
 *
 * `undated` and `continuous` are the pair that matters: «no se puede medir» is not
 * «está bien», and a palette that painted both green would turn three undated
 * links into a guarantee nobody gave.
 */
export type ContinuityTone = 'gaps' | 'undated' | 'continuous' | 'single' | 'empty'

/** What the chain as a whole can and cannot say about its own continuity. */
export interface ChainContinuity {
  gaps: ChainGap[]
  /** Links with no structured year: they cannot be placed in time. */
  undated: number
  /** The sentence above the links. Null when the chain has nothing to warn about. */
  text: string | null
  tone: ContinuityTone
}

/**
 * Whether the chain reads as continuous, and — when it does not — why it cannot
 * be told.
 *
 * The distinction that matters is between «hay un hueco» and «no se puede
 * medir». A chain of three undated links has no gaps and is not continuous
 * either: nothing is known about its shape, and saying «sin huecos» there would
 * be the screen inventing a guarantee. The two get different sentences and
 * different tones.
 */
export function chainContinuity(
  rows: readonly ProvenanceEventRow[],
  options: { originYear?: number | null; currentYear?: number } = {},
): ChainContinuity {
  const gaps = chainGaps(rows, options)
  const undated = rows.filter((row) => row.start_year === null).length

  if (rows.length === 0) {
    return { gaps: [], undated: 0, text: null, tone: 'empty' }
  }

  if (gaps.length > 0) {
    const many = gaps.length > 1
    return {
      gaps,
      undated,
      tone: 'gaps',
      text:
        `La cadena tiene ${many ? `${gaps.length} huecos` : 'un hueco'} sin documentar. Cada ` +
        `${many ? 'uno' : 'hueco'} es un tramo sobre el que el catálogo no afirma nada: no dice ` +
        'que la obra no se moviera, dice que no se ha investigado todavía. ' +
        `${many ? 'Están señalados' : 'Está señalado'} entre los eslabones.`,
    }
  }

  if (undated > 0) {
    return {
      gaps,
      undated,
      tone: 'undated',
      text:
        `Sin huecos medibles, pero ${
          undated === rows.length
            ? `ninguno de los ${rows.length === 1 ? 'eslabones' : `${rows.length} eslabones`} lleva`
            : `${undated} de los ${rows.length} eslabones no llevan`
        } fecha: no se puede decir si la cadena es continua.`,
    }
  }

  if (rows.length === 1) {
    return {
      gaps,
      undated,
      tone: 'single',
      text:
        'Un solo eslabón fechado: la cadena no cuenta todavía un recorrido, solo un punto de él.',
    }
  }

  return {
    gaps,
    undated,
    tone: 'continuous',
    text:
      'Los eslabones están fechados y encadenados sin huecos entre ellos. Que la procedencia esté ' +
      'completa es otra cosa, y la dice el estado de la investigación.',
  }
}

/**
 * The four words that head a gap, for the thumb scrolling past it.
 *
 * The gap's own `text` is a paragraph, and it has to be: it says what the
 * catalogue is NOT claiming, which cannot be said in four words. But a paragraph
 * is not scannable, and this block is read standing up — so the years go in a
 * heading above it, and the paragraph stays for whoever stops.
 *
 * The gap that reaches the present says «a hoy» and not the year: that year is
 * today's, it changes on its own, and printing it makes the record look like it
 * asserts something about 2026 when what it asserts is «desde 1991 no consta».
 */
export function gapLabel(gap: ChainGap): string {
  const until = gap.beforeId === null ? 'hoy' : String(gap.toYear)
  const span = gap.fromYear === gap.toYear ? `en ${gap.fromYear}` : `de ${gap.fromYear} a ${until}`
  return gap.reason === 'open-end' ? `Cadena abierta ${span}` : `Hueco ${span}`
}

/** The gaps that go immediately BEFORE a given link, so the timeline can print them in place. */
export function gapsBefore(gaps: readonly ChainGap[], linkId: string): ChainGap[] {
  return gaps.filter((gap) => gap.beforeId === linkId)
}

/** The gap that reaches the present, which closes the timeline instead of sitting inside it. */
export function trailingGap(gaps: readonly ChainGap[]): ChainGap | null {
  return gaps.find((gap) => gap.beforeId === null) ?? null
}

// ── The chain as one thing to read, in order ─────────────────

/** A link of the chain, in its place in the reading. */
export interface TimelineLink {
  kind: 'link'
  /** Stable across reloads, because it is the row's identifier. */
  key: string
  link: ChainLink
}

/** A stretch the chain does not document, in the place where it is missed. */
export interface TimelineGap {
  kind: 'gap'
  key: string
  gap: ChainGap
}

export type TimelineEntry = TimelineLink | TimelineGap

function gapEntry(gap: ChainGap): TimelineGap {
  // The years and the link it hangs from identify a gap: two gaps of the same
  // chain cannot share both, because they are separated by at least one link.
  return { kind: 'gap', key: `gap-${gap.afterId ?? 'origen'}-${gap.fromYear}-${gap.toYear}`, gap }
}

/**
 * The links and the gaps as ONE sequence, which is what makes this block a story
 * and not a table (RF-509).
 *
 * A list of links with the gaps summarised somewhere above it reads as a table
 * with a footnote, and the footnote is the part a curator came for. Interleaved,
 * the silence sits between the two hands it separates and takes up room on the
 * screen, which is what a hole in a provenance actually is.
 *
 * **No gap is ever dropped.** Whatever cannot be placed before a link — the one
 * that reaches the present, and a gap hanging off a link that is not on screen —
 * closes the sequence instead of disappearing from it. A gap the screen decides
 * not to paint is the screen asserting a continuity nobody documented, which is
 * the one mistake this whole module exists to prevent.
 */
export function chainTimeline(
  links: readonly ChainLink[],
  gaps: readonly ChainGap[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const placed = new Set<ChainGap>()

  for (const link of links) {
    for (const gap of gapsBefore(gaps, link.id)) {
      placed.add(gap)
      entries.push(gapEntry(gap))
    }
    entries.push({ kind: 'link', key: `link-${link.id}`, link })
  }

  for (const gap of gaps) {
    if (!placed.has(gap)) entries.push(gapEntry(gap))
  }

  return entries
}

// ── What the block can say while it is still arriving ────────

export interface ChainLoadInput {
  /** The chain's own query. */
  rowsLoading: boolean
  rowsError: string | null
  /** The state of the research, out of the artwork's row. Null when unread. */
  status: ResearchStatus | null
  statusLoading: boolean
  statusError?: string | null
}

export interface ChainLoadState {
  loading: boolean
  /** The database's own message. The Spanish frame goes around it in the component. */
  error: string | null
  /** The links arrived and the state of the research did not (RF-304). */
  statusUnknownNotice: string | null
}

/**
 * The two queries this block reads from, reduced to one state.
 *
 * The chain and the state of its research arrive separately — one query per
 * block, one for the artwork's row — and the four combinations do not weigh the
 * same. Without the CHAIN there is nothing to show and the block says so. Without
 * the STATE OF THE RESEARCH there is a chain and no way to know whether anybody
 * finished looking, and showing it as if it were settled is how «sin revisar»
 * becomes «no»: that case gets a sentence, not an error.
 */
export function chainLoadState(
  spec: DocumentarySectionSpec,
  input: ChainLoadInput,
): ChainLoadState {
  if (input.rowsError !== null) {
    return { loading: false, error: input.rowsError, statusUnknownNotice: null }
  }
  if (input.rowsLoading || input.statusLoading) {
    return { loading: true, error: null, statusUnknownNotice: null }
  }
  return {
    loading: false,
    error: null,
    statusUnknownNotice: statusUnknownNotice(spec, {
      status: input.status,
      loading: false,
      error: input.statusError ?? null,
    }),
  }
}

/**
 * The block's state with that notice put where it will actually be read.
 *
 * It cannot just be painted among the links, and that is the whole reason this
 * function exists: `DocumentarySection` paints its children only when the block
 * HAS rows, so on an empty chain — precisely the case where the distinction
 * decides how the emptiness is read — a notice among the children would never
 * appear. It takes the place of the empty text when there are no links, and rides
 * above them when there are.
 */
export function chainBlockState(state: BlockState, notice: string | null): BlockState {
  if (notice === null) return state
  return {
    ...state,
    emptyText: state.count === 0 ? notice : null,
    partialText: state.count === 0 ? null : notice,
  }
}

/**
 * The block state of an artwork whose provenance is WRITTEN and whose chain has
 * no links (RF-510).
 *
 * It is a real and ordinary situation — the provenance of half the funds arrived
 * as a paragraph in a document long before anybody broke it into dated links — and
 * without this it would be invisible: `DocumentarySection` paints its children
 * only when the block has rows, so the published narrative would sit behind an
 * empty block that reads «nadie ha buscado todavía».
 *
 * The explanation of the empty CHAIN is not dropped, because it is still true and
 * it is the more important of the two: what changes is that it rides ABOVE the
 * narrative instead of taking its place. Nothing is claimed about the chain that
 * the chain does not say — a written paragraph is not a chain of links, and the
 * count on the heading keeps saying «Ninguno registrado».
 */
export function narrativeBlockState(state: BlockState, written: boolean): BlockState {
  if (!written || state.count > 0 || state.emptyText === null) return state
  return { ...state, emptyText: null, partialText: state.emptyText }
}

// ── Who has it now ──────────────────────────────────────────

/** The last link of the chain: the one that answers «and now?». Null when there is none. */
export function currentHolder(rows: readonly ProvenanceEventRow[]): ProvenanceEventRow | null {
  if (rows.length === 0) return null
  // Defensive against an unsorted array: `position` is the order, not the index.
  return rows.reduce((best, row) => (row.position > best.position ? row : best), rows[0]!)
}

/**
 * What the record may say about where the artwork is TODAY, given the chain and
 * the state of the research (RF-218).
 *
 * Three sentences, and choosing the wrong one publishes a claim nobody made:
 *
 *   · The chain does not close, and the research does → the artwork is there.
 *     This is the ONLY case where «hoy» is used.
 *   · The chain does not close and the research is not closed either → it is the
 *     last place the artwork is on record, which is not the same thing.
 *   · The chain closes in a past year → it ENDS, and where the artwork went
 *     afterwards is not documented. The last link is not the current holder, and
 *     that is exactly the mistake this sentence exists to prevent.
 *
 * Which link is named comes from the coverage and not from the position, for the
 * overlap reason above: with an owner running to 1995 and a deposit that closed
 * in 1990 below it, the owner is who has it.
 *
 * Null when there are no links: the empty block already explains itself, and a
 * second sentence over it would be noise.
 */
export function currentHolderText(
  rows: readonly ProvenanceEventRow[],
  status: ResearchStatus | null,
  currentYear: number = thisYear(),
): string | null {
  if (rows.length === 0) return null
  const reach = chainReach(rows)
  const holder =
    rows.find((row) => row.id === (reach.holderId ?? '')) ?? currentHolder(rows)
  if (!holder) return null
  const name = partyName(holder.party, holder.party_note)

  if (reach.covered !== null && !reach.open && reach.covered < currentYear) {
    return (
      `La cadena documentada termina en ${reach.covered}, en ${name}. De ahí en adelante no ` +
      'consta por dónde ha pasado la obra: el último eslabón no es el poseedor actual.'
    )
  }
  if (status === 'COMPLETE') {
    return `La obra consta hoy en ${name}, que cierra la cadena.`
  }
  return (
    `El último eslabón documentado es ${name}. La investigación de la procedencia no está ` +
    'cerrada, así que puede no ser donde está la obra ahora.'
  )
}

// ── The publishable narrative (RF-510) ──────────────────────

/**
 * The provenance line composed out of the links, in the form a catalogue
 * raisonné prints it: hands separated by semicolons, each with its place and its
 * years.
 *
 * **What it leaves out, and why.** `UNREVIEWED` is not written: this is a draft
 * of something publishable, and «Sin revisar» is a note about the catalogue's
 * work, not about the artwork. `OWNER` is not written either, because a
 * provenance entry already reads as «this party had it» and repeating «en
 * propiedad» eight times buries the one line that says «en depósito». The cost
 * is that the composed line cannot tell an owner from an unreviewed link — which
 * is why it is a DRAFT, `provenanceSource` says so, and the structured chain
 * above it keeps the two apart.
 */
export function composeProvenanceLine(rows: readonly ProvenanceEventRow[]): string {
  const parts = rows.map((row) => {
    const bits = [partyName(row.party, row.party_note)]
    const place = partyPlace(row.party)
    if (place !== '') bits.push(place)
    // `capacity` reads inside the entry and not as a separate datum: «Museo X,
    // Badajoz, en depósito, 1985-1990».
    if (row.capacity !== 'UNREVIEWED' && row.capacity !== 'OWNER') {
      bits.push(PROVENANCE_CAPACITY_LABEL[row.capacity].toLocaleLowerCase('es-ES'))
    }
    const dates = (row.date_text ?? '').trim()
    if (dates !== '') bits.push(dates)
    return bits.join(', ')
  })
  return parts.length === 0 ? '' : `${parts.join('; ')}.`
}

/** Where the provenance the record prints comes from. */
export type ProvenanceSource =
  /** Somebody wrote it (RF-510). It is what gets published, verbatim. */
  | 'written'
  /** Composed here out of the links, as a draft of what could be published. */
  | 'composed'
  /** There is neither narrative nor links. */
  | 'none'

export interface ProvenanceNarrative {
  text: string
  source: ProvenanceSource
  /** What the reader has to know about the text above. Null for a written narrative. */
  caveat: string | null
}

/**
 * The provenance as the record prints it (RF-510): the written narrative when
 * there is one, and otherwise the line composed from the links.
 *
 * The hierarchy is the one ADR-004 already set between `date_note` and the
 * structured date: the structure feeds the search and the prose wins when
 * printing, because the prose of a catalogue raisonné cannot be generated. What
 * is generated is offered as a draft and labelled as one — a composed line
 * presented as the catalogue's own text would end up quoted as if somebody had
 * written it.
 */
export function provenanceNarrative(
  narrative: string,
  rows: readonly ProvenanceEventRow[],
): ProvenanceNarrative {
  const written = narrative.trim()
  if (written !== '') return { text: written, source: 'written', caveat: null }
  if (rows.length === 0) return { text: '', source: 'none', caveat: null }
  return {
    text: composeProvenanceLine(rows),
    source: 'composed',
    caveat:
      'Redactado automáticamente con los eslabones de arriba, para copiar y corregir: no lo ha ' +
      'escrito nadie. Omite lo que está sin revisar, así que no distingue un propietario de un ' +
      'eslabón cuya calidad de tenencia nadie ha mirado.',
  }
}
