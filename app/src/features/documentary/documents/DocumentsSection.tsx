import { useMemo, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { DownloadFailure } from '../../../lib/download'
import { DocumentarySection } from '../DocumentarySection'
import { blockState } from '../researchState'
import { sectionSpec } from '../sections'
import { useArtworkDocuments, type ArtworkDocumentaryQuery } from '../useDocumentary'
import {
  DOCUMENT_STEP_TEXT,
  runDocumentDownload,
  type DocumentDownloadStep,
  type DocumentFileOffer,
} from './documentFile'
import { documentViews, documentsSummary, type DocumentView } from './documentView'
import { ResearchStatusPicker } from './ResearchStatusPicker'
import { statusUnknownNotice, withStatusUnknown } from './researchStatusChoice'

/**
 * «Documentación relacionada» on the artwork record (RF-515, RF-516): the letters,
 * press cuttings, posters and archive photographs that speak about this artwork.
 *
 * Two things this block has to get right and the other four do not:
 *
 *   · the document carries a FILE, and the file has to leave the application as a
 *     file — saved with a readable name, not opened in a tab (RF-411). The path
 *     out of the private bucket is the one that already exists in `download.ts`;
 *     nothing is reimplemented here;
 *   · the file WEIGHS. A scanned expediente is tens of megabytes and this is used
 *     in a warehouse over mobile data, so the size is on the button and the open
 *     block says up front what the whole lot would cost. Nothing is asked for, or
 *     paid for, until somebody taps.
 *
 * What an EMPTY block says is not decided here (`blockState`), and neither is any
 * other sentence: the row, the summary, the file name and every explanation come
 * from the pure modules beside this one, which is where the battery reaches them —
 * it runs in node and cannot open a component.
 */
export function DocumentsSection({
  catalogId,
  documentary,
  placeText,
}: {
  catalogId: string
  /**
   * The documentary columns of the artwork, loaded ONCE for the five blocks by
   * `useArtworkDocumentary` and handed down: they are a single row, and a query
   * per block would be five requests for it.
   */
  documentary: ArtworkDocumentaryQuery
  /**
   * Where the paper is, out of the tree of places the record already has loaded
   * (ADR-006): `(id) => placePathText(placeTree, id)`. Without it the rows say
   * nothing about the location instead of guessing — this block is not going to
   * spend a sixth query of its own on one crumb.
   */
  placeText?: (placeId: string) => string | null | undefined
}) {
  const spec = sectionSpec('documents')
  const { canEdit } = useAuth()
  const { rows, loading, error } = useArtworkDocuments(catalogId)

  const status = documentary.documentary?.documentation_status ?? null
  const views = useMemo(() => documentViews(rows, { placeText }), [rows, placeText])
  const summary = documentsSummary(views)
  // The warning about an unreadable status goes INTO the state and not among the
  // rows: an empty block paints its sentence instead of the body, and that is
  // precisely the case where nobody must read the emptiness as an answer.
  const state = withStatusUnknown(
    blockState(spec, status, rows.length),
    statusUnknownNotice(spec, {
      status,
      loading: documentary.loading,
      error: documentary.error,
    }),
  )

  return (
    <DocumentarySection
      spec={spec}
      state={state}
      loading={loading || documentary.loading}
      error={error}
      actions={
        canEdit ? (
          <div className="space-y-2">
            <ResearchStatusPicker
              spec={spec}
              status={status}
              count={rows.length}
              onChange={(value) => documentary.setResearchStatus('documentation_status', value)}
            />
            {/* Said instead of left to be looked for: linking a document to an
                artwork needs the archive screen, which is not built yet. */}
            <p className="text-xs text-stone-500">
              Enlazar un documento del archivo con esta obra todavía no se hace desde aquí.
            </p>
          </div>
        ) : undefined
      }
    >
      {summary && <p className="mb-2 px-1 text-xs text-stone-500">{summary}</p>}
      <ul>
        {views.map((view) => (
          <DocumentRow key={view.id} view={view} />
        ))}
      </ul>
    </DocumentarySection>
  )
}

/**
 * One document: what it is, when it is from, and the way out of the application.
 *
 * The title leads because that is what is being looked for; the signature, the
 * kind and the date go underneath in one line, which is what identifies it in the
 * folder; and the button closes the row, under the thumb.
 */
function DocumentRow({ view }: { view: DocumentView }) {
  return (
    <li className="border-t border-stone-100 py-2 first:border-t-0">
      <p className={`text-sm font-medium ${view.unavailable ? 'text-stone-500' : ''}`}>
        {view.title}
        {view.retired && (
          <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-normal text-stone-600">
            Retirado del archivo
          </span>
        )}
      </p>

      {!view.unavailable && (
        <>
          <p className="text-xs text-stone-500">
            {view.code && <span className="font-medium text-stone-600">{view.code} · </span>}
            {/* A retired vocabulary entry is dimmed, never removed: hiding it
                would leave a blank where a name used to be. */}
            <span className={view.typeRetired ? 'text-stone-400 line-through' : ''}>
              {view.typeText}
            </span>
            {' · '}
            {view.dateText}
          </p>
          <p className="text-xs text-stone-500">
            {view.fundText}
            {' · '}
            <span className={view.seriesRetired ? 'text-stone-400 line-through' : ''}>
              {view.seriesText}
            </span>
          </p>
        </>
      )}

      {view.linkNote && (
        <p className="mt-1 text-xs text-stone-700">
          <span className="text-stone-500">Sobre esta obra: </span>
          {view.linkNote}
        </p>
      )}
      {view.documentNote && <p className="mt-1 text-xs text-stone-500">{view.documentNote}</p>}
      {view.placeText && !view.unavailable && view.file && (
        <p className="mt-1 text-xs text-stone-500">El papel está en {view.placeText}.</p>
      )}

      {view.file ? (
        <DocumentDownload offer={view.file} />
      ) : (
        /* RF-304: where the button would be, why there is none. */
        <p className="mt-1 text-xs text-stone-500">{view.fileNote}</p>
      )}
    </li>
  )
}

/**
 * The button that takes the file out, with its two silent waits and its answer.
 *
 * Its own state per row, so five documents in a block do not share one spinner and
 * one error strip. Nothing is signed or downloaded until it is tapped.
 */
function DocumentDownload({ offer }: { offer: DocumentFileOffer }) {
  const [busy, setBusy] = useState<DocumentDownloadStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function start() {
    // Both cleared before starting: a red strip left over from a previous attempt
    // on top of a download that has just worked is the screen contradicting itself.
    setError(null)
    setNotice(null)
    setBusy('signing')
    try {
      setNotice(await runDocumentDownload(offer, { onStep: setBusy }))
    } catch (cause) {
      // `DownloadFailure` already carries the sentence to show; anything else is a
      // bug and is shown as it is rather than swallowed, because a mute button is
      // worse.
      setError(cause instanceof DownloadFailure || cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void start()}
        className="btn-secondary w-full text-sm disabled:opacity-60"
      >
        {busy === null ? offer.label : DOCUMENT_STEP_TEXT[busy]}
      </button>
      <p className="mt-1 text-xs text-stone-500">{offer.kindText}</p>
      {/* Nothing is downloaded without asking, and what is being asked for says
          what it costs before the tap and not after it. */}
      {offer.weightWarning && (
        <p className="mt-1 text-xs text-amber-900">{offer.weightWarning}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-1 text-xs text-stone-700">
          {notice}
        </p>
      )}
    </div>
  )
}
