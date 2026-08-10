import { useState } from 'react'
import { useAutoClear } from '../../components/useAutoClear'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { PlusIcon } from '../../components/ui'
import {
  linkDocumentToExhibition,
  setExhibitionLinkActive,
} from '../archive/exhibitionLinkActions'
import type { ExhibitionDocumentLinkRow } from '../documentary/documentaryRows'
import { DocumentFileActions } from '../documentary/documents/DocumentFileActions'
import { LinkDocumentSheet } from '../documentary/documents/LinkDocumentSheet'
import { documentViews, documentsSummary, type DocumentView } from '../documentary/documents/documentView'
import { useArchiveIndex } from '../archive/useArchiveIndex'
import {
  documentLinkedNotice,
  documentTitleText,
  documentUnlinkedNotice,
  exhibitionDocumentCountText,
  exhibitionDocumentsNotice,
  linkedDocumentIds,
  retireDocumentLinkText,
  EXHIBITION_DOCUMENTS_HINT,
} from './exhibitionDocuments'

/**
 * «Otros documentos relacionados» (RF-516, RF-517): las notas de prensa, los carteles,
 * los dípticos y las cartas que hablan de esta exposición.
 *
 * Lo que decide y lo que se lee está en `exhibitionDocuments.ts` y en `documentView.ts`,
 * que es el mismo módulo que pinta las filas del bloque de una obra: un documento se lee
 * igual desde los dos lados del puente, y copiarlo habría sido dos sitios donde arreglar
 * la fecha de una carta sin año.
 *
 * **Se enlaza aquí y se sube desde una obra.** El motivo está escrito en el módulo: la
 * misma escritura repartida por dos pantallas con dos juegos de controles es cómo una de
 * las dos acaba dejando pasar algo. Y se dice en la pantalla en vez de dejar buscar el
 * botón que no está.
 *
 * El catálogo del archivo se pide **solo al abrir el panel**: esta ficha se abre muchas
 * veces para leer una muestra, y la lista entera de documentos solo la necesita quien va a
 * enlazar. Es la decisión que ya toman el bloque del catálogo y la documentación de una
 * obra.
 */
export function ExhibitionDocuments({
  exhibitionId,
  rows,
  loading,
  error,
  onReload,
}: {
  exhibitionId: string
  rows: readonly ExhibitionDocumentLinkRow[]
  loading: boolean
  /** El mensaje de la base, ya en español. */
  error: string | null
  onReload: () => Promise<void>
}) {
  const { canEdit } = useAuth()
  const [linking, setLinking] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Confirma algo que ya ha pasado, así que se va sola: ver `useAutoClear`.
  useAutoClear(notice, () => setNotice(null))
  const [failure, setFailure] = useState<string | null>(null)
  const archive = useArchiveIndex(linking)

  const views = documentViews(rows, { owner: 'exhibition' })
  const summary = documentsSummary(views)
  const empty = exhibitionDocumentsNotice({ loading, error, count: views.length })

  async function afterWrite(problem: string | null, said?: string) {
    setFailure(problem)
    if (problem !== null) return
    setNotice(said ?? null)
    await onReload()
  }

  async function remove(view: DocumentView) {
    setRemoving(null)
    await afterWrite(
      await setExhibitionLinkActive(view.id, false),
      documentUnlinkedNotice(documentTitleText(view.title)),
    )
  }

  return (
    <section className="mt-4">
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 font-semibold">
        Otros documentos relacionados
        {views.length > 0 && (
          <span className="text-sm font-normal text-stone-500">
            {exhibitionDocumentCountText(views.length)}
          </span>
        )}
      </h2>

      {empty !== null ? (
        <p className={`card text-sm ${error !== null ? 'text-red-700' : 'text-stone-600'}`}>
          {empty}
        </p>
      ) : (
        <>
          {/* Cuánto de esto está digitalizado y qué costaría bajarlo entero: las dos
              preguntas que se hacen antes de recorrer una lista en el móvil. */}
          {summary && <p className="mb-2 px-1 text-xs text-stone-500">{summary}</p>}
          <ul className="space-y-2">
            {views.map((view) => (
              <li key={view.id} className="card">
                <DocumentEntry
                  view={view}
                  canEdit={canEdit}
                  confirming={removing === view.id}
                  onAskRemove={() => {
                    setFailure(null)
                    setNotice(null)
                    setRemoving(view.id)
                  }}
                  onCancelRemove={() => setRemoving(null)}
                  onRemove={() => void remove(view)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {failure !== null && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {failure}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="mt-2 rounded-lg bg-stone-100 p-2 text-xs text-stone-700">
          {notice}
        </p>
      )}

      {canEdit && (
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={() => {
              setFailure(null)
              setNotice(null)
              setLinking(true)
            }}
            className="btn-secondary flex w-full items-center justify-center gap-2 text-sm"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Enlazar un documento del archivo</span>
          </button>
          <p className="text-xs text-stone-500">{EXHIBITION_DOCUMENTS_HINT}</p>
        </div>
      )}

      {linking && (
        <LinkDocumentSheet
          documents={archive.documents}
          linked={linkedDocumentIds(rows)}
          loading={archive.loading}
          error={archive.error}
          onLink={async (documentId, note) => {
            const problem = await linkDocumentToExhibition({
              p_exhibition_id: exhibitionId,
              p_document_id: documentId,
              p_note: note.trim(),
            })
            if (problem === null) {
              const chosen = archive.documents.find((row) => row.id === documentId)
              await afterWrite(null, documentLinkedNotice(documentTitleText(chosen?.title)))
            }
            return problem
          }}
          onClose={() => setLinking(false)}
        />
      )}
    </section>
  )
}

/**
 * Un documento: qué es, de cuándo, y las dos salidas — su ficha y su fichero.
 *
 * El título enlaza con la ficha del documento, que es donde se corrige y se digitaliza.
 * Sin ese enlace este bloque sería un final de camino: se vería que la nota de prensa
 * existe y no habría por dónde tocarla.
 */
function DocumentEntry({
  view,
  canEdit,
  confirming,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  view: DocumentView
  canEdit: boolean
  confirming: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}) {
  const line = [view.code, view.typeText, view.dateText].filter(Boolean).join(' · ')

  return (
    <>
      <p className="font-medium">
        {view.unavailable ? (
          view.title
        ) : (
          <Link to={`/archive/${view.documentId}`} className="underline">
            {view.title}
          </Link>
        )}
        {view.retired && (
          <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-2xs text-stone-600">
            En la papelera
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-stone-500">{line}</p>

      {/* Lo que el documento dice DE ESTA EXPOSICIÓN, que es la nota del vínculo y no la
          del documento: la segunda habla del papel, la primera de la muestra. */}
      {view.linkNote && <p className="mt-1 text-sm text-stone-700">{view.linkNote}</p>}

      {view.file !== null ? (
        <DocumentFileActions offer={view.file} title={view.title} />
      ) : (
        view.fileNote && <p className="mt-1 text-xs text-stone-500">{view.fileNote}</p>
      )}

      {canEdit &&
        (confirming ? (
          <div className="mt-2 space-y-2">
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              {retireDocumentLinkText(view.title)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onCancelRemove} className="btn-secondary text-sm">
                Dejarlo
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="btn min-h-touch bg-red-700 text-sm text-white"
              >
                Quitar de esta exposición
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAskRemove}
            className="mt-2 min-h-touch text-xs text-stone-500 underline"
          >
            Quitar de esta exposición
          </button>
        ))}
    </>
  )
}
