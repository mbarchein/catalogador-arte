import { useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { ChevronRightIcon } from '../../../components/ui'
import type { ArtworkDocumentary, ResearchStatus } from '../../../lib/types'
import { DocumentarySection } from '../DocumentarySection'
import type { ProvenanceEventRow } from '../documentaryRows'
import { blockState } from '../researchState'
import { sectionSpec, statusOf, type ResearchStatusField, canWriteBlock } from '../sections'
import { useArtworkDocumentary, useProvenanceEvents } from '../useDocumentary'
import {
  chainBlockState,
  chainContinuity,
  chainLinks,
  chainLoadState,
  chainTimeline,
  currentHolderText,
  gapLabel,
  narrativeBlockState,
  provenanceNarrative,
  thisYear,
  type ChainLink,
  type ContinuityTone,
} from './provenanceChain'
import { ProvenanceLinkForm } from './ProvenanceLinkForm'
import {
  addBlockedReason,
  draftFromRow,
  emptyProvenanceDraft,
  reorderHint,
  retireConfirmText,
  stepTarget,
  type ProvenanceDraft,
} from './provenanceDraft'
import { ResearchStatusPicker } from './ResearchStatusPicker'
import { useParties } from './useParties'
import { useProvenanceEdits } from './useProvenanceEdits'

/**
 * «Procedencia», the block that says by whose hands the artwork has passed
 * (RF-509, RF-510).
 *
 * It is the block a catalogue raisonné is judged by, and it is the reason
 * `provenance_events` is a table and not a field: a chain of dated links can be
 * READ as a chain — and, above all, its SILENCES can be shown. What a curator
 * looks at first is not who owned it in 1985, it is whether anybody knows where
 * it was between 1971 and 1984.
 *
 * So this screen is built as one reading and not as a list. The links and the
 * gaps come interleaved from `chainTimeline`, and a gap takes up as much room as
 * a link, because in a provenance it weighs as much. Three emptinesses are kept
 * apart all the way down: a gap in the chain, a link whose holder has no record
 * behind it — «Colección particular, España» is a documented answer — and a
 * question investigated with no result, which is not the same as a question
 * nobody has asked (RF-205, RF-218).
 *
 * **The order is the cataloger's and not the dates'.** Half the links of a real
 * chain have no known year, and an order derived from what is missing is not an
 * order. Hence the arrows, and hence `reorderHint` explaining them: every other
 * list of this application sorts itself.
 *
 * **Nothing here decides anything.** What is shown, in what order, with what
 * words and what an empty block says are pure and live in `provenanceChain.ts` and
 * `provenanceDraft.ts`, verified by the battery — which runs in node and cannot
 * open a component. What is left here is the layout and the four writes.
 *
 * **`contact` never reaches this screen.** A party carries a contact detail that
 * is third-party personal data (RF-105): `PartyRef` does not declare it, no query
 * of this folder selects it, and the record never prints it.
 */
export function ProvenanceSection({
  catalogId,
  documentary,
  documentaryLoading = false,
  documentaryError = null,
  setResearchStatus,
  originYear = null,
  writable = false,
}: {
  catalogId: string
  /**
   * The documentary row of the artwork, out of the ONE query the record makes for
   * the five blocks. Null while unread or unreadable.
   */
  documentary: Pick<ArtworkDocumentary, ResearchStatusField | 'provenance'> | null
  documentaryLoading?: boolean
  documentaryError?: string | null
  /** From `useArtworkDocumentary`: answers null when it worked, the database's message when not. */
  setResearchStatus: (field: ResearchStatusField, value: ResearchStatus) => Promise<string | null>
  /**
   * The year the artwork was made (`artworks.start_year`), which is where a
   * provenance starts: without it the stretch between the artist and the first
   * documented link cannot be told, and nothing is invented in its place.
   */
  originYear?: number | null
  /**
   * Si este bloque puede escribir. Falso en la vista de la ficha y verdadero solo
   * en la zona de edición. Por omisión falso: un bloque nuevo que se olvide de
   * pasarlo nace de solo lectura, que es el lado seguro del olvido.
   */
  writable?: boolean
}) {
  const spec = sectionSpec('provenance')
  const { rows, loading, error, reload } = useProvenanceEvents(catalogId)
  const { canEdit } = useAuth()
  // RF-308: **escribir vive en la zona de edición y no en la vista.** La ficha que
  // se lee es de solo lectura, así que ningún control de este bloque ofrece cambiar
  // un dato salvo que la página diga que está editando. `canWrite` sigue siendo
  // necesario —el permiso manda sobre el modo— pero ya no es suficiente.
  const canWrite = canWriteBlock(writable, canEdit)
  const edits = useProvenanceEdits(catalogId, reload)

  // The chain is being written: only then is the register of people and
  // institutions worth a query. Reading the chain paints the record embedded in
  // each row.
  const [editing, setEditing] = useState<ProvenanceDraft | null>(null)
  const parties = useParties(editing !== null)

  const status = statusOf(spec, documentary)
  const load = chainLoadState(spec, {
    rowsLoading: loading,
    rowsError: error,
    status,
    statusLoading: documentaryLoading,
    statusError: documentaryError,
  })
  // One clock for the whole block: the continuity, the gap that reaches the
  // present and the sentence about where the artwork is today have to agree.
  const currentYear = thisYear()
  const continuity = chainContinuity(rows, { originYear, currentYear })
  const timeline = chainTimeline(chainLinks(rows), continuity.gaps)
  const holder = currentHolderText(rows, status, currentYear)
  const narrative = provenanceNarrative(documentary?.provenance ?? '', rows)
  const blocked = addBlockedReason(status)
  const hint = reorderHint(rows.length)

  // A written narrative with no links is ordinary and must not be hidden behind
  // the sentence that explains the empty chain: the two are stacked, not swapped.
  const state = narrativeBlockState(
    chainBlockState(blockState(spec, status, rows.length), load.statusUnknownNotice),
    narrative.source === 'written',
  )

  return (
    <>
      <DocumentarySection
        spec={spec}
        state={state}
        loading={load.loading}
        error={load.error}
        actions={
          canWrite && !load.loading && load.error === null ? (
            <div className="space-y-2">
              {blocked !== null && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{blocked}</p>
              )}
              <button
                type="button"
                disabled={edits.saving || blocked !== null}
                onClick={() => setEditing(emptyProvenanceDraft())}
                className="btn-secondary w-full text-sm"
              >
                Añadir un eslabón al final
              </button>
              <ResearchStatusPicker
                spec={spec}
                status={status}
                count={rows.length}
                onChange={(value) => setResearchStatus('provenance_status', value)}
                disabled={edits.saving}
              />
            </div>
          ) : undefined
        }
      >
        {/* The shape of the chain before the chain itself: on a phone the links
            are read one at a time, and «tiene un hueco» is what decides whether
            this provenance can be quoted at all. */}
        {continuity.text !== null && (
          <p className={`mb-2 rounded-lg p-2 text-xs ${CONTINUITY_CLASS[continuity.tone]}`}>
            {continuity.text}
          </p>
        )}

        <ol className="space-y-2">
          {timeline.map((entry) =>
            entry.kind === 'gap' ? (
              <li
                key={entry.key}
                className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-2"
              >
                {/* A gap is not a smaller thing than a link, and it is not painted
                    as one: it is what the catalogue does not claim. */}
                <p className="text-sm font-medium text-amber-900">{gapLabel(entry.gap)}</p>
                <p className="mt-1 text-xs text-amber-900">{entry.gap.text}</p>
              </li>
            ) : (
              <ChainLinkItem
                key={entry.key}
                link={entry.link}
                canEdit={canWrite}
                saving={edits.saving}
                hint={hint}
                up={stepTarget(rows, entry.link.ordinal - 1, -1)}
                down={stepTarget(rows, entry.link.ordinal - 1, 1)}
                row={rows[entry.link.ordinal - 1]}
                onEdit={(row) => setEditing(draftFromRow(row))}
                onMove={(to) => edits.reorder(rows, entry.link.ordinal - 1, to)}
                onRetire={() => edits.retireLink(entry.link.id)}
              />
            ),
          )}
        </ol>

        {/* Where the artwork is TODAY, which is the question the block gets
            opened for — and the one place where saying it wrong publishes a
            claim nobody made. */}
        {holder !== null && (
          <p className="mt-3 rounded-lg bg-stone-100 p-2 text-sm text-stone-700">{holder}</p>
        )}

        {/* RF-510: the publishable line. Written by somebody, or composed from
            the links above and labelled as the draft it is. */}
        {narrative.source !== 'none' && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <span className="label">Procedencia redactada</span>
            <p className="rounded-lg border border-stone-200 bg-white p-2 text-sm">
              {narrative.text}
            </p>
            {narrative.caveat !== null && (
              <p className="mt-1 text-xs text-stone-500">{narrative.caveat}</p>
            )}
          </div>
        )}
      </DocumentarySection>

      {/* Over the record and not on a page of its own: a link is written with the
          chain in front, «and after the family, the museum». */}
      {editing !== null && (
        <ProvenanceLinkForm
          initial={editing}
          catalogId={catalogId}
          parties={parties.parties}
          partiesLoading={parties.loading}
          partiesError={parties.error}
          saving={edits.saving}
          onCreateParty={parties.addParty}
          onCancel={() => setEditing(null)}
          onSave={async (draft) => {
            const failure = draft.id === null ? await edits.addLink(draft) : await edits.saveLink(draft)
            if (failure === null) setEditing(null)
            return failure
          }}
        />
      )}
    </>
  )
}

/**
 * One link of the chain: who, in what capacity, how it got there, between which
 * years, and where the datum comes from.
 *
 * The ordinal is printed because the order is manual and it is the thing being
 * rearranged: without it, two arrows move something the eye cannot count.
 */
function ChainLinkItem({
  link,
  row,
  canEdit,
  saving,
  hint,
  up,
  down,
  onEdit,
  onMove,
  onRetire,
}: {
  link: ChainLink
  /** The row behind the link, for the edit and the confirmation. Absent only if the two lists drifted. */
  row: ProvenanceEventRow | undefined
  canEdit: boolean
  saving: boolean
  /** Why the order is manual. Printed once, under the first link. */
  hint: string | null
  /** Where the link would land moving up, or null at the end of the chain. */
  up: number | null
  down: number | null
  onEdit: (row: ProvenanceEventRow) => void
  onMove: (to: number) => Promise<string | null>
  onRetire: () => Promise<string | null>
}) {
  const [confirming, setConfirming] = useState(false)
  // The whole sentence, not just the database's message: a reorder and a
  // retirement fail for different reasons and the frame around the message has to
  // say which one was being attempted. The RPC refuses a STALE chain — somebody
  // else added a link meanwhile — and swallowing that refusal would leave the
  // cataloger tapping an arrow that does nothing.
  const [failure, setFailure] = useState<string | null>(null)

  function report(prefix: string) {
    return (message: string | null) => setFailure(message === null ? null : `${prefix}: ${message}`)
  }

  return (
    <li className="rounded-lg border border-stone-100 p-2">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                     bg-stone-200 text-2xs font-medium text-stone-700"
        >
          {link.ordinal}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className={`font-medium ${link.retired ? 'text-stone-500' : ''}`}>
              {link.name}
            </span>
            {link.place !== '' && <span className="text-stone-600">, {link.place}</span>}
          </p>

          {/* A link with no record behind it is not a defect: it is how the
              provenance consta. Only a RETIRED record is worth a word. */}
          {link.retired && (
            <p className="text-xs text-stone-500">
              La ficha de esta persona o institución está retirada del catálogo. El eslabón sigue
              contando, y el nombre se conserva.
            </p>
          )}

          {link.detail !== '' && <p className="text-xs text-stone-600">{link.detail}</p>}

          <div className="mt-1 flex flex-wrap gap-1.5">
            <span
              className={`rounded px-2 py-0.5 text-2xs ${
                link.dated ? 'bg-stone-100 text-stone-600' : 'bg-stone-100 text-stone-500'
              }`}
            >
              {link.dates}
            </span>
            {/* Amber for what nobody has looked at yet, stone for an answer —
                «Se desconoce» included, because having looked and found nothing
                IS an answer (RF-205). */}
            <span
              className={`rounded px-2 py-0.5 text-2xs ${
                link.capacityUnreviewed
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {link.capacityText}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-2xs ${
                link.acquisitionUnreviewed
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {link.acquisitionText}
            </span>
          </div>

          {/* Where the datum comes from and how much it is worth (RF-214): it is
              what lets the link be checked again in ten years. */}
          {link.note !== '' && <p className="mt-1 text-xs text-stone-600">{link.note}</p>}
        </div>

        {canEdit && (
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              disabled={saving || up === null}
              aria-label="Subir el eslabón en la cadena"
              onClick={() => {
                if (up !== null) void onMove(up).then(report('No se ha podido cambiar el orden'))
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200
                         text-stone-600 disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4 -rotate-90" />
            </button>
            <button
              type="button"
              disabled={saving || down === null}
              aria-label="Bajar el eslabón en la cadena"
              onClick={() => {
                if (down !== null) void onMove(down).then(report('No se ha podido cambiar el orden'))
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200
                         text-stone-600 disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-90" />
            </button>
          </div>
        )}
      </div>

      {hint !== null && link.ordinal === 1 && canEdit && (
        <p className="mt-1 text-xs text-stone-500">{hint}</p>
      )}

      {failure !== null && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {failure}
        </p>
      )}

      {canEdit &&
        row !== undefined &&
        (confirming ? (
          /* Two taps to retire, like removing a photograph from the gallery: on a
             touch screen one tap is an accident waiting to happen, and the
             sentence says what the chain looks like afterwards. */
          <div className="mt-2">
            <p className="text-xs text-stone-700">{retireConfirmText(row)}</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  void (async () => {
                    const message = await onRetire()
                    report('No se ha podido retirar')(message)
                    if (message === null) setConfirming(false)
                  })()
                }}
                className="btn-secondary min-h-touch text-sm"
              >
                {saving ? 'Retirando…' : 'Sí, retirar'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirming(false)}
                className="btn-secondary min-h-touch text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => onEdit(row)}
              className="text-xs text-stone-600 underline"
            >
              Corregir
            </button>
            <button
              type="button"
              onClick={() => {
                setFailure(null)
                setConfirming(true)
              }}
              className="text-xs text-stone-600 underline"
            >
              Retirar de la cadena
            </button>
          </div>
        ))}
    </li>
  )
}

/**
 * The colours the record already speaks, and no new one: amber for a notice,
 * stone for the neutral, green for what is settled.
 *
 * A chain WITHOUT measurable gaps is not green, and that is the point of the
 * pair: «no se puede medir» is not «está bien». Only a dated, unbroken chain gets
 * the colour that says nothing is pending — and even then the sentence itself
 * refuses to promise the provenance is complete, because that is what the state
 * of the research says and not the shape of the chain.
 */
const CONTINUITY_CLASS: Record<ContinuityTone, string> = {
  gaps: 'bg-amber-50 text-amber-900',
  undated: 'bg-stone-100 text-stone-600',
  single: 'bg-stone-100 text-stone-600',
  continuous: 'bg-green-50 text-green-900',
  empty: 'bg-stone-100 text-stone-600',
}

/**
 * The block mounted on its own for a caller that has no documentary row yet.
 *
 * The record loads that row ONCE for the five blocks — five requests for the same
 * row would be four too many — so this is not the way the record mounts it. It
 * exists for a screen that shows the chain of one artwork and nothing else.
 */
export function StandaloneProvenanceSection({
  catalogId,
  originYear = null,
}: {
  catalogId: string
  originYear?: number | null
}) {
  const { documentary, loading, error, setResearchStatus } = useArtworkDocumentary(catalogId)
  return (
    <ProvenanceSection
      catalogId={catalogId}
      documentary={documentary}
      documentaryLoading={loading}
      documentaryError={error}
      setResearchStatus={setResearchStatus}
      originYear={originYear}
    />
  )
}
