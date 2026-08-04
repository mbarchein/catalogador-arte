import { useMemo, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import type { ArtworkDocumentary, ResearchStatus } from '../../../lib/types'
import { DocumentarySection } from '../DocumentarySection'
import type { ParticipationRow } from '../documentaryRows'
import { blockState } from '../researchState'
import { sectionSpec, statusOf, type ResearchStatusField, canWriteBlock } from '../sections'
import { useArtworkExhibitions } from '../useDocumentary'
import {
  catalogueNumberText,
  catalogueText,
  exhibitionCitationParts,
  exhibitionKindPending,
  exhibitionKindSummary,
  exhibitionKindText,
  exhibitionVenueNote,
  historyBlockState,
  historyLoadState,
  retirementNotice,
} from './exhibitionHistory'
import { ExhibitionPicker } from './ExhibitionPicker'
import { addBlockedReason, participatingExhibitionIds, retireConfirmText } from './participationEdits'
import { ResearchStatusPicker } from './ResearchStatusPicker'
import { useParticipationActions } from './useParticipations'

/**
 * «Historial expositivo», the block of the record that says where this artwork
 * has been shown (RF-501, RF-502).
 *
 * It is the block that gives the rule its name: an artwork with no exhibitions
 * recorded is NOT an artwork that has never been exhibited, and on this screen
 * the difference is visible without opening anything — the heading carries the
 * count and the state of the research, and an empty block says in words which of
 * the two emptinesses it is.
 *
 * Everything that decides — the order, the line, the venue, the character of the
 * show, what an empty block says — is pure and lives in `exhibitionHistory.ts`
 * and in the foundations shared by the five blocks. What is left here is the
 * layout and the two writes.
 *
 * **The state of the research is not read here.** It arrives as a prop, out of
 * the ONE query `useArtworkDocumentary` makes for the whole record: five blocks
 * asking for the same row would be four requests too many.
 */
export function ExhibitionHistorySection({
  catalogId,
  documentary,
  documentaryLoading = false,
  documentaryError = null,
  setResearchStatus,
  writable = false,
}: {
  catalogId: string
  /** The four research statuses of the artwork. Null while unread or unreadable. */
  documentary: Pick<ArtworkDocumentary, ResearchStatusField> | null
  documentaryLoading?: boolean
  documentaryError?: string | null
  /** From `useArtworkDocumentary`: answers null when it worked, the database's message when not. */
  setResearchStatus: (field: ResearchStatusField, value: ResearchStatus) => Promise<string | null>
  /**
   * Si este bloque puede escribir. Falso en la vista de la ficha y verdadero solo
   * en la zona de edición. Por omisión falso: un bloque nuevo que se olvide de
   * pasarlo nace de solo lectura, que es el lado seguro del olvido.
   */
  writable?: boolean
}) {
  const spec = sectionSpec('exhibitions')
  const { rows, loading, error, reload } = useArtworkExhibitions(catalogId)
  const { canEdit } = useAuth()
  // RF-308: **escribir vive en la zona de edición y no en la vista.** La ficha que
  // se lee es de solo lectura, así que ningún control de este bloque ofrece cambiar
  // un dato salvo que la página diga que está editando. `canWrite` sigue siendo
  // necesario —el permiso manda sobre el modo— pero ya no es suficiente.
  const canWrite = canWriteBlock(writable, canEdit)
  const actions = useParticipationActions(catalogId)

  const status = statusOf(spec, documentary)
  const load = historyLoadState({
    rowsLoading: loading,
    rowsError: error,
    status,
    statusLoading: documentaryLoading,
    statusError: documentaryError,
  })
  const state = historyBlockState(blockState(spec, status, rows.length), load.statusUnknownNotice)
  const summary = exhibitionKindSummary(rows)
  // Kept stable across renders: it is the dependency of the chooser's ranking,
  // and a fresh Set on every render would rank the whole list again for nothing.
  const taken = useMemo(() => participatingExhibitionIds(rows), [rows])

  return (
    <DocumentarySection
      spec={spec}
      state={state}
      loading={load.loading}
      error={load.error}
      actions={
        canWrite && !load.loading && load.error === null ? (
          <div className="space-y-2">
            <ExhibitionPicker
              taken={taken}
              blockedReason={addBlockedReason(status)}
              saving={actions.saving}
              onAdd={async (exhibitionId, catalogueNumber, note) => {
                const failure = await actions.add(exhibitionId, catalogueNumber, note)
                if (failure === null) await reload()
                return failure
              }}
            />
            <ResearchStatusPicker
              spec={spec}
              status={status}
              count={rows.length}
              onChange={(value) => setResearchStatus('exhibition_history_status', value)}
            />
          </div>
        ) : undefined
      }
    >
      {/* What the history is made of, before the list itself: on a phone the
          rows below the fold are read one at a time, and «1 individual y 2
          colectivas» is the shape of a career in one line. */}
      {summary !== null && <p className="mb-2 text-xs text-stone-500">{summary}</p>}

      <ol className="space-y-2">
        {rows.map((row) => (
          <ParticipationItem
            key={row.id}
            row={row}
            canEdit={canWrite}
            saving={actions.saving}
            onRetire={async () => {
              const failure = await actions.retire(row.id)
              if (failure === null) await reload()
              return failure
            }}
          />
        ))}
      </ol>
    </DocumentarySection>
  )
}

/**
 * One participation, as RF-502 fixes it: when, what, where — the chronology
 * first, because this list is read as a career, and the title in italics.
 *
 * The line is composed out of the same three pieces `exhibitionCitationLine`
 * joins, which is what the row announces to a screen reader: the layout can never
 * say something different from the sentence the battery verifies.
 */
function ParticipationItem({
  row,
  canEdit,
  saving,
  onRetire,
}: {
  row: ParticipationRow
  canEdit: boolean
  saving: boolean
  onRetire: () => Promise<string | null>
}) {
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const exhibition = row.exhibition
  const { dates, title, venue } = exhibitionCitationParts(row)
  const retired = exhibition !== null && !exhibition.active
  const notice = retirementNotice(exhibition)
  const number = catalogueNumberText(row)
  const venueNote = exhibitionVenueNote(exhibition)

  return (
    <li className={`rounded-lg border border-stone-100 p-2 ${retired ? 'opacity-60' : ''}`}>
      <p className="text-sm">
        {dates !== '' && <span className="text-stone-600">{dates}, </span>}
        {/* In italics, as RF-502 fixes the format for both the record and the
            listing of exhibitions. */}
        <em className="font-medium italic">{title}</em>
        {venue !== '' && <span className="text-stone-600">, {venue}</span>}
      </p>

      {venueNote !== null && (
        <p className="text-xs text-stone-500">Consta también como «{venueNote}».</p>
      )}

      {exhibition !== null && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {/* «Sin revisar» in amber and the two answers in stone: the character of
              a show is a datum, and not having decided it is a pending task. */}
          <span
            className={`rounded px-2 py-0.5 text-[11px] ${
              exhibitionKindPending(exhibition.exhibition_type)
                ? 'bg-amber-100 text-amber-900'
                : 'bg-stone-200 text-stone-700'
            }`}
          >
            {exhibitionKindText(exhibition.exhibition_type)}
          </span>
          <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
            {catalogueText(exhibition)}
          </span>
          {number !== null && (
            <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
              {number}
            </span>
          )}
        </div>
      )}

      {notice !== null && <p className="mt-1 text-xs text-stone-500">{notice}</p>}

      {/* The circumstances of THIS participation — lent by the family, unframed —
          which are not a fact about the exhibition and do not belong on its
          record. */}
      {row.note.trim() !== '' && <p className="mt-1 text-xs text-stone-600">{row.note}</p>}

      {failure !== null && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          No se ha podido retirar: {failure}
        </p>
      )}

      {canEdit &&
        (confirming ? (
          /* Two taps to retire, like removing a photograph from the gallery: on a
             touch screen, one tap is an accident waiting to happen, and the
             sentence says what does and does not disappear. */
          <div className="mt-2">
            <p className="text-xs text-stone-700">{retireConfirmText(row)}</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  void (async () => {
                    const message = await onRetire()
                    setFailure(message)
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
          <button
            type="button"
            onClick={() => {
              setFailure(null)
              setConfirming(true)
            }}
            className="mt-1 text-xs text-stone-600 underline"
          >
            Retirar del historial
          </button>
        ))}
    </li>
  )
}
