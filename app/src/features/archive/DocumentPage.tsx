import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { useAutoClear } from '../../components/useAutoClear'
import { NoteRow } from '../documentary/NoteText'
import { LoadingNotice, Toast } from '../../components/ui'
import { placePathText } from '../../lib/places'
import { displayStructuredDate } from '../documentary/documentaryFormat'
import { DocumentFileActions } from '../documentary/documents/DocumentFileActions'
import { documentFileOffer } from '../documentary/documents/documentFile'
import { fundText, missingFileNote } from '../documentary/documents/documentView'
import { usePhysicalPlaces } from '../artworks/usePhysicalPlaces'
import { useExhibitions } from '../exhibitions/useExhibitions'
import {
  DOCUMENT_MISSING_TEXT,
  documentReachSegments,
  type ReachSegment,
  linkedArtworkViews,
  linkedBlockNotice,
  linkedExhibitionViews,
  NO_LINKED_ARTWORKS,
  type LinkedExhibitionView,
} from './documentRecord'
import {
  linkedExhibitionIds,
  NO_LINKED_EXHIBITIONS_READONLY,
  NO_LINKED_EXHIBITIONS_WRITABLE,
  retireExhibitionLinkText,
} from './exhibitionLink'
import { linkDocumentToExhibition, setExhibitionLinkActive } from './exhibitionLinkActions'
import { LinkExhibitionSheet } from './LinkExhibitionSheet'
import { useDocumentRecord } from './useArchiveIndex'

/**
 * The record of an archive document (RF-309, RF-515, RF-516, RF-609).
 *
 * What it adds and could not be read anywhere: **what the document is hanging from**.
 * From an artwork's record only its hanging from THAT ONE is visible, so a clipping that speaks
 * of three pieces was read three times without ever knowing it, and a document hanging from
 * nothing was not read at all.
 *
 * **Two blocks and not one**, which is the difference from a reference's record: the
 * relationship is many-to-many with the artworks and with the exhibitions (RF-516), and
 * merging them would mix cataloguing codes with show titles in the same
 * column. Each block says its own thing when it is empty, and they do not say the same: linking to
 * an artwork is done from the artwork's record, and linking to an exhibition is done
 * **here**.
 *
 * **The only write this record owns is the link with an exhibition**
 * (RF-516, RF-517), and it is the reasoned exception to the archive being read-only: an
 * exhibition has no document block, so this screen is the only place where
 * the document and the show are together at once. Correcting the data and adding the scan are
 * done from the documentation of a linked artwork, where they already are and where the scope
 * warning says how many records it affects; withdrawing the whole document and recovering it belong to
 * the wastebasket. Bringing those buttons here would be a second way of doing the same, and for
 * a standalone document —the case that justifies the screen— there is no artwork record to
 * correct it from: that is said at the foot, instead of leaving it to be discovered.
 */
export function DocumentPage() {
  const { id = '' } = useParams()
  const { canEdit } = useAuth()
  const record = useDocumentRecord(id)
  // The tree of places, to say where the paper is with its whole branch (ADR-006).
  const { tree: placeTree } = usePhysicalPlaces()
  const [linking, setLinking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useAutoClear(notice, () => setNotice(null))
  // The exhibitions catalog is fetched ONLY with the panel open: this screen is opened many
  // times just to read a document, and whoever only reads should not pay for it.
  const catalogue = useExhibitions(linking)

  const artworks = useMemo(() => linkedArtworkViews(record.artworks), [record.artworks])
  const exhibitions = useMemo(() => linkedExhibitionViews(record.exhibitions), [record.exhibitions])
  const linked = useMemo(() => linkedExhibitionIds(record.exhibitions), [record.exhibitions])

  if (record.loading && record.document === null) {
    return <LoadingNotice>Cargando el documento…</LoadingNotice>
  }

  // Never a blank page: an address that is no document says so and offers the way out.
  if (record.document === null) {
    return (
      <Layout title="Documento" back="/archive">
        <p role="alert" className="card text-sm text-stone-700">
          {record.error ?? DOCUMENT_MISSING_TEXT}
        </p>
      </Layout>
    )
  }

  const document = record.document
  const place = document.physical_place_id
    ? placePathText(placeTree, document.physical_place_id)
    : null
  const file = documentFileOffer(document)
  const code = (document.archive_code ?? '').trim() || null

  return (
    <Layout title={document.title.trim() || 'Documento sin título'} back="/archive">
      {/* Lo que acaba de pasar, flotando y unos segundos: enlazar o quitar una
          exposición se hace desde una hoja, así que al cerrarse la vista puede estar
          en cualquier parte de la pantalla y este aviso vivía al final del bloque. */}
      {notice !== null && <Toast>{notice}</Toast>}

      {record.error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {record.error}
        </p>
      )}

      {!document.active && (
        <p className="card mb-3 bg-stone-100 text-sm text-stone-700">
          Está retirado del archivo: no se ofrece para enlazar. Se recupera desde la papelera.
        </p>
      )}

      {/* De qué cuelga, lo primero y antes de los campos: es lo que esta ficha
          añade, y nombra las fichas del otro lado para poder ir a ellas. */}
      <p className="card mb-3 text-sm text-stone-700">
        <Reach segments={documentReachSegments({ artworks, exhibitions })} />
      </p>

      <section className="card">
        <dl>
          <RecordRow label="Signatura" value={code} mono />
          <RecordRow label="Tipo" value={document.document_type?.name.trim() || null} />
          <RecordRow label="Fecha" value={displayStructuredDate(document)} />
          <RecordRow label="Fondo" value={fundText(document.artist_fund)} />
          <RecordRow label="Serie" value={document.archive_series?.name.trim() || null} />
          <RecordRow label="El papel está en" value={place} />
          <NoteRow label="Nota" value={document.note} />
        </dl>
      </section>

      {/* El fichero: la salida de la aplicación, o por qué no la hay. */}
      <section className="mt-3">
        {file !== null ? (
          <DocumentFileActions offer={file} title={document.title} className="" />
        ) : (
          <p className="card text-sm text-stone-600">{missingFileNote({ code, placeText: place })}</p>
        )}
      </section>

      <LinkedBlock title="Obras enlazadas" notice={linkedBlockNotice({ loading: record.loading, error: record.linksError, count: artworks.length, empty: NO_LINKED_ARTWORKS })}>
        {artworks.map((view) => {
          const body = (
            <>
              <span className="block font-mono text-xs text-stone-500">{view.catalogId}</span>
              <span className="mt-0.5 block break-words font-medium">{view.title}</span>
              {view.note !== null && (
                <span className="mt-0.5 block break-words text-xs text-stone-500">{view.note}</span>
              )}
              {view.retired && <Badge>En la papelera</Badge>}
            </>
          )
          return (
            <li key={view.id}>
              {view.linked ? (
                <Link
                  to={`/artwork/${view.catalogId}`}
                  className={`card block active:bg-stone-50 ${view.retired ? 'opacity-60' : ''}`}
                >
                  {body}
                </Link>
              ) : (
                <div className="card text-stone-500">{body}</div>
              )}
            </li>
          )
        })}
      </LinkedBlock>

      <LinkedBlock
        title="Exposiciones enlazadas"
        notice={linkedBlockNotice({
          loading: record.loading,
          error: record.linksError,
          count: exhibitions.length,
          // The empty block's sentence changes with who reads it: sending someone with no
          // button to link down here would be sending them to look for what is not there.
          empty: canEdit ? NO_LINKED_EXHIBITIONS_WRITABLE : NO_LINKED_EXHIBITIONS_READONLY,
        })}
      >
        {exhibitions.map((view) => (
          <ExhibitionLinkRow
            key={view.id}
            view={view}
            canWrite={canEdit && document.active}
            onDone={async (message) => {
              setNotice(message)
              await record.reload()
            }}
          />
        ))}
      </LinkedBlock>


      {/* La única escritura de esta pantalla, y solo sobre un documento vivo: enlazar
          uno retirado lo devolvería a circulación por la puerta de atrás, que es lo
          mismo que el selector evita al no ofrecer las muestras retiradas. */}
      {canEdit && document.active && (
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setLinking(true)
          }}
          className="btn-secondary mt-2 w-full text-sm"
        >
          Enlazar con una exposición
        </button>
      )}

      {linking && (
        <LinkExhibitionSheet
          exhibitions={catalogue.exhibitions}
          linked={linked}
          loading={catalogue.loading}
          loadError={catalogue.error}
          onLink={(exhibitionId, note) =>
            linkDocumentToExhibition({
              p_exhibition_id: exhibitionId,
              p_document_id: document.id,
              p_note: note,
            })
          }
          onClose={() => setLinking(false)}
          onDone={async (message) => {
            setNotice(message)
            await record.reload()
          }}
        />
      )}

      {/* Lo que no se hace aquí, dicho una vez y al pie: es lo que evita buscar botones
          que no están, y para un documento suelto es información necesaria — no hay
          ficha de obra desde la que corregirlo. */}
      {canEdit && (
        <p className="mt-3 text-xs text-stone-500">
          Los datos y el escaneo se corrigen desde una obra enlazada.
        </p>
      )}
    </Layout>
  )
}

/**
 * A linked exhibition, with the link's way out.
 *
 * Two taps to remove it, as in the rest of the project: on a touch screen, one
 * alone and what somebody researched disappears. And what is warned about is **what does NOT happen** —the
 * document stays in the archive with its file—, which is the half that makes it possible to
 * decide; `retireExhibitionLinkText` words it, which is pure and tested.
 */
function ExhibitionLinkRow({
  view,
  canWrite,
  onDone,
}: {
  view: LinkedExhibitionView
  canWrite: boolean
  onDone: (message: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function retire() {
    setError(null)
    setBusy(true)
    const problem = await setExhibitionLinkActive(view.id, false)
    setBusy(false)
    if (problem !== null) {
      setError(problem)
      return
    }
    setConfirming(false)
    await onDone(`Documento quitado de «${view.title}».`)
  }

  const body = (
    <>
      <span className="block text-xs text-stone-500">{view.dates}</span>
      <span className="mt-0.5 block break-words font-medium italic">{view.title}</span>
      {view.note !== null && (
        <span className="mt-0.5 block break-words text-xs text-stone-500">{view.note}</span>
      )}
      {view.retired && <Badge>En la papelera</Badge>}
    </>
  )

  return (
    <li>
      <div className={`card ${view.retired ? 'opacity-60' : ''}`}>
        {/* El enlace envuelve solo el cuerpo, no la fila entera: un botón dentro de un
            enlace navega en cuanto se toca, y el toque que estaba destinado a «Quitar»
            se convertiría en un salto a la exposición. */}
        {view.linked ? (
          <Link to={`/exhibitions/${view.exhibitionId}`} className="block active:opacity-70">
            {body}
          </Link>
        ) : (
          <div className="text-stone-500">{body}</div>
        )}

        {error !== null && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            {error}
          </p>
        )}

        {canWrite &&
          (confirming ? (
            <div className="mt-2 rounded-lg bg-stone-100 p-2">
              <p className="text-xs text-stone-700">{retireExhibitionLinkText(view.title)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void retire()}
                  className="btn min-h-touch bg-red-700 text-white disabled:opacity-60"
                >
                  {busy ? 'Quitando…' : 'Sí, quitar'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setConfirming(true)
              }}
              className="mt-1 min-h-touch text-xs text-stone-600 underline"
            >
              Quitar de esta exposición
            </button>
          ))}
      </div>
    </li>
  )
}

/** One line of the record. Never a gap (RF-304): with no datum, it is said. */
/**
 * El aviso de de qué cuelga el documento, con sus referencias pulsables.
 *
 * Los trozos los decide `documentReachSegments`, que es donde se puede probar sin
 * navegador; aquí solo se pintan. Un `Link` y no un ancla: son pantallas de la
 * propia aplicación y salir al navegador perdería la sesión y el sitio.
 */
function Reach({ segments }: { segments: readonly ReachSegment[] }) {
  return (
    <>
      {segments.map((segment, at) =>
        segment.kind === 'link' ? (
          <Link key={at} to={segment.to} className="font-medium underline">
            {segment.text}
          </Link>
        ) : (
          <span key={at}>{segment.text}</span>
        ),
      )}
    </>
  )
}

function RecordRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-32 shrink-0 text-sm text-stone-500">{label}</dt>
      <dd className={`min-w-0 break-words text-sm ${mono ? 'font-mono' : ''}`}>
        {value === null ? <span className="text-stone-400">Sin dato</span> : value}
      </dd>
    </div>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <span className="mt-1 inline-block rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600">
      {children}
    </span>
  )
}

/** One of the two link blocks, with its notice when empty. */
function LinkedBlock({
  title,
  notice,
  children,
}: {
  title: string
  notice: string | null
  children: React.ReactNode
}) {
  return (
    <section className="mt-3">
      <h2 className="mb-2 px-1 text-sm font-medium uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}
