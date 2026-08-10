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
 * La ficha de un documento del archivo (RF-309, RF-515, RF-516, RF-609).
 *
 * Lo que añade y no se podía leer en ningún sitio: **de qué está colgando el documento**.
 * Desde la ficha de una obra solo se ve que cuelga de ELLA, así que un recorte que habla
 * de tres piezas se leía tres veces sin saberlo nunca, y un documento que no cuelga de
 * nada no se leía.
 *
 * **Dos bloques y no uno**, que es la diferencia con la ficha de una referencia: la
 * relación es de muchos a muchos con las obras y con las exposiciones (RF-516), y
 * fundirlos mezclaría códigos de catalogación con títulos de muestra en la misma
 * columna. Cada bloque dice lo suyo cuando está vacío, y no dicen lo mismo: enlazar con
 * una obra se hace desde la ficha de la obra, y enlazar con una exposición se hace
 * **aquí**.
 *
 * **La única escritura que esta ficha posee es el vínculo con una exposición**
 * (RF-516, RF-517), y es la excepción razonada a que el archivo sea de solo lectura: una
 * exposición no tiene bloque de documentos, así que esta pantalla es el único sitio donde
 * el documento y la muestra están a la vez. Corregir los datos y añadir el escaneo se
 * hacen desde la documentación de una obra enlazada, donde ya están y donde el aviso de
 * alcance cuenta a cuántas fichas afecta; retirar el documento entero y recuperarlo son de
 * la papelera. Traer esos botones aquí sería una segunda forma de hacer lo mismo, y para
 * un documento suelto —el caso que justifica la pantalla— no hay ficha de obra desde la
 * que corregirlo: eso se dice al pie, en vez de dejarlo descubrir.
 */
export function DocumentPage() {
  const { id = '' } = useParams()
  const { canEdit } = useAuth()
  const record = useDocumentRecord(id)
  // El árbol de sitios, para decir dónde está el papel con su rama entera (ADR-006).
  const { tree: placeTree } = usePhysicalPlaces()
  const [linking, setLinking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useAutoClear(notice, () => setNotice(null))
  // El catálogo de exposiciones se pide SOLO con el panel abierto: esta pantalla se abre
  // muchas veces para leer un documento, y quien solo lee no tiene por qué pagarlo.
  const catalogue = useExhibitions(linking)

  const artworks = useMemo(() => linkedArtworkViews(record.artworks), [record.artworks])
  const exhibitions = useMemo(() => linkedExhibitionViews(record.exhibitions), [record.exhibitions])
  const linked = useMemo(() => linkedExhibitionIds(record.exhibitions), [record.exhibitions])

  if (record.loading && record.document === null) {
    return <LoadingNotice>Cargando el documento…</LoadingNotice>
  }

  // Nunca una página en blanco: una dirección que no es ningún documento lo dice y
  // ofrece la salida.
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
          // La frase del bloque vacío cambia con quien la lee: mandar a enlazar aquí
          // abajo a quien no tiene el botón sería mandarlo a buscar lo que no está.
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
 * Una exposición enlazada, con la salida del vínculo.
 *
 * Dos toques para quitarlo, como en el resto del proyecto: en una pantalla táctil, uno
 * solo y desaparece lo que alguien investigó. Y lo que se avisa es **lo que NO pasa** —el
 * documento se queda en el archivo con su fichero—, que es la mitad que hace que se pueda
 * decidir; lo redacta `retireExhibitionLinkText`, que es puro y está probado.
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

/** Una línea de la ficha. Nunca un hueco (RF-304): sin dato, se dice. */
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

/** Uno de los dos bloques de vínculos, con su aviso cuando está vacío. */
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
