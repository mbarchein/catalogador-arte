import { useMemo, useState } from 'react'
import { useAutoClear } from '../../../components/useAutoClear'
import { Link } from 'react-router'
import { useAuth } from '../../../auth/AuthContext'
import { PlusIcon } from '../../../components/ui'
import { DocumentarySection } from '../DocumentarySection'
import { blockState } from '../researchState'
import { sectionSpec, canWriteBlock } from '../sections'
import { useArtworkDocuments, type ArtworkDocumentaryQuery } from '../useDocumentary'
import {
  attachDocumentFile,
  createArchiveDocument,
  editDocumentLinkNote,
  linkDocumentToArtwork,
  setDocumentLinkActive,
  updateArchiveDocument,
  uploadDocumentFile,
} from './documentActions'
import { DocumentFileActions } from './DocumentFileActions'
import {
  documentLinkArgs,
  linkBlockedReason,
  linkedDocumentIds,
  retireLinkConfirmText,
  TWO_ACTS_TEXT,
} from './documentLink'
import { documentViews, documentsSummary, type DocumentView } from './documentView'
import { AddScanSheet } from './AddScanSheet'
import { EditDocumentSheet } from './EditDocumentSheet'
import { LinkDocumentSheet } from './LinkDocumentSheet'
import { ResearchStatusPicker } from './ResearchStatusPicker'
import { statusUnknownNotice, withStatusUnknown } from './researchStatusChoice'
import { useArchiveCatalog } from './useArchiveCatalog'
import { UploadDocumentSheet } from './UploadDocumentSheet'
import type { PickedFile } from './documentUpload'

/**
 * «Documentación relacionada» on the artwork record (RF-515, RF-516): the letters,
 * press cuttings, posters and archive photographs that speak about this artwork.
 *
 * Three things this block has to get right and the other four do not:
 *
 *   · the document carries a FILE, and the file has to leave the application as a
 *     file — saved with a readable name, not opened in a tab (RF-411). The path
 *     out of the private bucket is the one that already exists in `download.ts`;
 *     nothing is reimplemented here;
 *   · the file WEIGHS. A scanned expediente is tens of megabytes and this is used
 *     in a warehouse over mobile data, so the size is on the button and the open
 *     block says up front what the whole lot would cost. Nothing is asked for, or
 *     paid for, until somebody taps;
 *   · **subir y enlazar son dos actos distintos, y la pantalla lo dice.** One
 *     document belongs to the archive and hangs off as many artworks as it speaks
 *     about, through a bridge table (RF-516), which is precisely so that the PDF is
 *     stored once. Two buttons, and a sentence above them explaining which is
 *     which: folded into one «Añadir», the second artwork of a press cutting gets a
 *     second copy of the same scan and the catalogue grows a duplicate nobody can
 *     reconcile afterwards.
 *
 * What an EMPTY block says is not decided here (`blockState`), and neither is any
 * other sentence: the row, the summary, the file name, the two refusals and every
 * explanation come from the pure modules beside this one, which is where the battery
 * reaches them — it runs in node and cannot open a component.
 */
export function DocumentsSection({
  catalogId,
  documentary,
  placeText,
  writable = false,
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
  /**
   * Whether this block can write. False in the record's view and true only
   * in the editing area. False by default: a new block that forgets to
   * pass it is born read-only, which is the safe side of forgetting.
   */
  writable?: boolean
}) {
  const spec = sectionSpec('documents')
  const { canEdit } = useAuth()
  // RF-308: **writing lives in the editing area and not in the view.** The record that
  // is read is read-only, so no control of this block offers to change
  // a datum unless the page says it is editing. `canWrite` is still
  // necessary —the permission rules over the mode— but it is no longer sufficient.
  const canWrite = canWriteBlock(writable, canEdit)
  const { rows, loading, error, reload } = useArtworkDocuments(catalogId)

  /**
   * Which sheet is open. The first two belong to the block; the last two belong to ONE
   * row, so they carry the identifier of the link that opened them: the document being
   * corrected is taken from the rows already loaded and not from a new query, because
   * `DOCUMENT_LINK_COLUMNS` already brings the twelve columns the form writes.
   */
  const [panel, setPanel] = useState<
    { kind: 'link' | 'upload' } | { kind: 'edit' | 'scan'; linkId: string } | null
  >(null)
  const [notice, setNotice] = useState<string | null>(null)
  // It confirms something that already happened, so it leaves on its own: see `useAutoClear`.
  useAutoClear(notice, () => setNotice(null))
  const [actionError, setActionError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  // The archive and its master tables are asked for only when a panel is opened: this block
  // is mounted in EVERY record of the catalogue, and four queries per artwork —for a
  // finder opened with one tap and only in the editing area— would be four
  // requests for every artwork flicked past with the thumb.
  const archive = useArchiveCatalog(canWrite && panel !== null)

  /** The row that opened a document sheet, if it is still there. */
  const acting = panel !== null && 'linkId' in panel ? rows.find((row) => row.id === panel.linkId) : undefined
  const actingDocument = acting?.document ?? null

  const status = documentary.documentary?.documentation_status ?? null
  const views = useMemo(() => documentViews(rows, { placeText }), [rows, placeText])
  const summary = documentsSummary(views)
  const linked = useMemo(() => linkedDocumentIds(rows), [rows])
  const blockedReason = linkBlockedReason(status)
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

  /**
   * Every write ends here. These rows are not live — `useLiveChanges` knows
   * `artworks` and `images` only — so what is on screen has to come back from the
   * database and not from what this component believes it just did.
   */
  async function afterWrite(failure: string | null, said: string | null = null) {
    setActionError(failure)
    setNotice(failure === null ? said : null)
    if (failure === null) await reload()
  }

  async function remove(id: string) {
    setRemoving(null)
    // Logical deletion of the LINK (RF-517, RF-901): the document stays in the
    // archive, with its file, and the other linked artworks keep seeing it.
    await afterWrite(await setDocumentLinkActive(id, false))
  }

  const sheets = (
    <>
      {panel?.kind === 'link' && (
        <LinkDocumentSheet
          documents={archive.documents}
          linked={linked}
          loading={archive.loading}
          error={archive.error}
          onLink={async (documentId, note) => {
            const failure = await linkDocumentToArtwork(
              documentLinkArgs(catalogId, documentId, note),
            )
            if (failure === null) {
              await afterWrite(null, 'Documento enlazado con esta obra.')
            }
            return failure
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {panel?.kind === 'upload' && (
        <UploadDocumentSheet
          catalogId={catalogId}
          documentTypes={archive.documentTypes}
          seriesTree={archive.seriesTree}
          placeTree={archive.placeTree}
          mastersError={archive.mastersError}
          // The three impure edges are passed from here and not imported inside the
          // form: this way the panel knows nothing about the network and the whole flow —the
          // order of the three steps and what is said when the middle one fails— is
          // verified in `documentUpload.test.ts`, with no browser.
          deps={{
            upload: (path, file) => uploadDocumentFile(path, file as Blob & PickedFile),
            insert: createArchiveDocument,
            link: (documentId, note) =>
              linkDocumentToArtwork({
                p_catalog_id: catalogId,
                p_document_id: documentId,
                p_note: note.trim(),
              }),
          }}
          onClose={() => setPanel(null)}
          onDone={(said) => afterWrite(null, said)}
        />
      )}

      {/* Las dos hojas de una fila. `actingDocument` puede ser null aunque el vínculo
          esté: es el documento que esta sesión no puede leer, y sobre ese no se abre un
          formulario que enseñaría campos vacíos como si fueran los suyos. */}
      {panel?.kind === 'edit' && actingDocument !== null && (
        <EditDocumentSheet
          catalogId={catalogId}
          document={actingDocument}
          linkNote={acting?.note ?? ''}
          documentTypes={archive.documentTypes}
          seriesTree={archive.seriesTree}
          placeTree={archive.placeTree}
          mastersError={archive.mastersError}
          onSave={(payload) => updateArchiveDocument(actingDocument.id, payload)}
          onSaveLinkNote={(note) => editDocumentLinkNote(panel.linkId, note)}
          onClose={() => setPanel(null)}
          onDone={(said) => afterWrite(null, said)}
        />
      )}

      {panel?.kind === 'scan' && actingDocument !== null && (
        <AddScanSheet
          document={actingDocument}
          onAdd={{
            upload: (path, file) => uploadDocumentFile(path, file as Blob & PickedFile),
            attach: (columns) => attachDocumentFile(actingDocument.id, columns),
          }}
          onClose={() => setPanel(null)}
          onDone={(said) => afterWrite(null, said)}
        />
      )}
    </>
  )

  return (
    <DocumentarySection
      spec={spec}
      state={state}
      loading={loading || documentary.loading}
      error={error}
      actions={
        canWrite ? (
          <div className="space-y-2">
            {actionError !== null && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {actionError}
              </p>
            )}
            {notice !== null && (
              <p role="status" className="rounded-lg bg-stone-100 p-2 text-xs text-stone-700">
                {notice}
              </p>
            )}

            {blockedReason !== null ? (
              /* The base would reject the link (RF-218), so it is said here and not
                 after a round trip: the selector below changes the
                 state, which is what has to be done first. Both buttons are
                 explained, not hidden: a missing button reads as a missing
                 permission, and this is neither one thing nor the other. */
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blockedReason}</p>
            ) : (
              <>
                {/* La frase que sostiene toda la pantalla: por qué hay dos botones. */}
                <p className="text-xs text-stone-500">{TWO_ACTS_TEXT}</p>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null)
                    setNotice(null)
                    setPanel({ kind: 'link' })
                  }}
                  className="btn-secondary flex w-full items-center justify-center gap-2 text-sm"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span>Enlazar un documento del archivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null)
                    setNotice(null)
                    setPanel({ kind: 'upload' })
                  }}
                  className="btn-secondary flex w-full items-center justify-center gap-2 text-sm"
                >
                  <span>Subir un documento del archivo</span>
                </button>
              </>
            )}

            <ResearchStatusPicker
              spec={spec}
              status={status}
              count={rows.length}
              onChange={(value) => documentary.setResearchStatus('documentation_status', value)}
            />
            {sheets}
          </div>
        ) : undefined
      }
    >
      {summary && <p className="mb-2 px-1 text-xs text-stone-500">{summary}</p>}
      <ul>
        {views.map((view) => (
          <DocumentRow
            key={view.id}
            view={view}
            canWrite={canWrite}
            confirming={removing === view.id}
            onAskRemove={() => {
              setActionError(null)
              setRemoving(view.id)
            }}
            onCancelRemove={() => setRemoving(null)}
            onRemove={() => void remove(view.id)}
            onEdit={() => {
              setActionError(null)
              setNotice(null)
              setPanel({ kind: 'edit', linkId: view.id })
            }}
            onAddScan={() => {
              setActionError(null)
              setNotice(null)
              setPanel({ kind: 'scan', linkId: view.id })
            }}
          />
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
function DocumentRow({
  view,
  canWrite,
  confirming,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onEdit,
  onAddScan,
}: {
  view: DocumentView
  canWrite: boolean
  confirming: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
  onEdit: () => void
  onAddScan: () => void
}) {
  return (
    <li className="border-t border-stone-100 py-2 first:border-t-0">
      {/* El título lleva a la ficha del documento en el archivo, que es donde se ve de
          qué MÁS cuelga: desde aquí solo se ve que cuelga de esta obra, y un recorte que
          habla de tres piezas se leería tres veces sin saberlo nunca. Un documento que
          esta sesión no puede leer no se enlaza a una ficha que no va a abrir. */}
      <p className={`text-sm font-medium ${view.unavailable ? 'text-stone-500' : ''}`}>
        {view.unavailable ? (
          view.title
        ) : (
          <Link to={`/archive/${view.documentId}`} className="underline decoration-stone-300">
            {view.title}
          </Link>
        )}
        {view.retired && (
          <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-2xs font-normal text-stone-600">
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
        <DocumentFileActions offer={view.file} title={view.title} />
      ) : (
        /* RF-304: where the button would be, why there is none. */
        <p className="mt-1 text-xs text-stone-500">{view.fileNote}</p>
      )}

      {canWrite &&
        (confirming ? (
          /* Two taps to remove it, as in the other records: on a touch
             screen, one tap and the link somebody researched disappears. And what
             is warned about is what does NOT happen: the document stays in the archive. */
          <div className="mt-2 rounded-lg bg-stone-100 p-2">
            <p className="text-xs text-stone-700">{retireLinkConfirmText(view)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRemove}
                className="btn min-h-touch bg-red-700 text-white"
              >
                Sí, quitar
              </button>
              <button type="button" onClick={onCancelRemove} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* Three ways out of the row and in this order, which is that of what is done most
             often: correcting what is badly written, giving it the scan it is missing, and
             only at the end removing it from the record, which is what one does not want to press
             by accident. «Añadir el escaneo» only appears when it is really missing: a button
             that is always painted and sometimes answers that it cannot be done is a button that
             stops being read.

             Over a document this session cannot read, neither of the
             first two is offered: the form would show empty fields as if they were
             its own, and storing them would erase what lies behind. Removing it from the record yes,
             because that belongs to the link and the link is visible. */
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {!view.unavailable && (
              <button
                type="button"
                onClick={onEdit}
                className="min-h-touch text-xs text-stone-600 underline"
              >
                Corregir los datos del documento
              </button>
            )}
            {!view.unavailable && view.file === null && (
              <button
                type="button"
                onClick={onAddScan}
                className="min-h-touch text-xs text-stone-600 underline"
              >
                Añadir el escaneo
              </button>
            )}
            <button
              type="button"
              onClick={onAskRemove}
              className="min-h-touch text-xs text-stone-600 underline"
            >
              Quitar de la ficha
            </button>
          </div>
        ))}
    </li>
  )
}

