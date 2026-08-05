import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { LoadingNotice } from '../../components/ui'
import { DownloadFailure } from '../../lib/download'
import { placePathText } from '../../lib/places'
import { displayStructuredDate, fileSizeText } from '../documentary/documentaryFormat'
import {
  DOCUMENT_STEP_TEXT,
  documentFileOffer,
  runDocumentDownload,
  type DocumentDownloadStep,
} from '../documentary/documents/documentFile'
import { fundText, missingFileNote } from '../documentary/documents/documentView'
import { usePhysicalPlaces } from '../artworks/usePhysicalPlaces'
import {
  DOCUMENT_MISSING_TEXT,
  documentReachSummary,
  linkedArtworkViews,
  linkedBlockNotice,
  linkedExhibitionViews,
  NO_LINKED_ARTWORKS,
  NO_LINKED_EXHIBITIONS,
} from './documentRecord'
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
 * una obra se hace desde la ficha de la obra, y enlazar con una exposición **todavía no
 * se hace desde ninguna pantalla**.
 *
 * **Sin corregir desde aquí, y sin retirar.** Corregir los datos y añadir el escaneo se
 * hacen desde la documentación de una obra enlazada, donde ya están y donde el aviso de
 * alcance cuenta a cuántas fichas afecta; retirar y recuperar son de la papelera. Traer
 * esos botones aquí sería una segunda forma de hacer lo mismo, y para un documento suelto
 * —el caso que justifica la pantalla— no hay ficha de obra desde la que corregirlo: eso
 * se dice al pie, en vez de dejarlo descubrir.
 */
export function DocumentPage() {
  const { id = '' } = useParams()
  const { canEdit } = useAuth()
  const record = useDocumentRecord(id)
  // El árbol de sitios, para decir dónde está el papel con su rama entera (ADR-006).
  const { tree: placeTree } = usePhysicalPlaces()

  const artworks = useMemo(() => linkedArtworkViews(record.artworks), [record.artworks])
  const exhibitions = useMemo(() => linkedExhibitionViews(record.exhibitions), [record.exhibitions])

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
      {record.error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {record.error}
        </p>
      )}

      {!document.active && (
        <p className="card mb-3 bg-stone-100 text-sm text-stone-700">
          Este documento está retirado del archivo: no se ofrece para enlazar. Se recupera desde la
          papelera, en Tablas.
        </p>
      )}

      {/* De qué cuelga, lo primero y antes de los campos: es lo que esta ficha añade. */}
      <p className="card mb-3 text-sm text-stone-700">
        {documentReachSummary({ artworks: artworks.length, exhibitions: exhibitions.length })}
      </p>

      <section className="card">
        <dl>
          <RecordRow label="Signatura" value={code} mono />
          <RecordRow label="Tipo" value={document.document_type?.name.trim() || null} />
          <RecordRow label="Fecha" value={displayStructuredDate(document)} />
          <RecordRow label="Fondo" value={fundText(document.artist_fund)} />
          <RecordRow label="Serie" value={document.archive_series?.name.trim() || null} />
          <RecordRow label="El papel está en" value={place} />
          <RecordRow label="Nota" value={document.note.trim() || null} />
        </dl>
      </section>

      {/* El fichero: la salida de la aplicación, o por qué no la hay. */}
      <section className="mt-3">
        {file !== null ? (
          <DocumentDownload label={file.label} offer={file} />
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

      <LinkedBlock title="Exposiciones enlazadas" notice={linkedBlockNotice({ loading: record.loading, error: record.linksError, count: exhibitions.length, empty: NO_LINKED_EXHIBITIONS })}>
        {exhibitions.map((view) => {
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
            <li key={view.id}>
              {view.linked ? (
                <Link
                  to={`/exhibitions/${view.exhibitionId}`}
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

      {/* Lo que no se hace aquí, dicho una vez y al pie: es lo que evita buscar botones
          que no están, y para un documento suelto es información necesaria — no hay
          ficha de obra desde la que corregirlo. */}
      {canEdit && (
        <p className="mt-3 text-xs text-stone-500">
          Corregir los datos y añadir el escaneo se hacen desde la documentación de una obra
          enlazada, donde el aviso dice a cuántas fichas afecta el cambio. Si este documento no
          tiene ninguna obra enlazada, enlázalo primero con la obra a la que corresponda. Retirarlo o
          recuperarlo se hace desde la papelera, en Tablas.
        </p>
      )}
    </Layout>
  )
}

/** Una línea de la ficha. Nunca un hueco (RF-304): sin dato, se dice. */
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
      <dd className={`break-words text-sm ${mono ? 'font-mono' : ''}`}>
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

/**
 * El botón que saca el fichero, con sus dos esperas silenciosas y su respuesta.
 *
 * Es el mismo camino que el bloque de la ficha de obra: `runDocumentDownload` firma y
 * descarga, y nada se pide ni se paga hasta que alguien toca.
 */
function DocumentDownload({
  offer,
  label,
}: {
  offer: Parameters<typeof runDocumentDownload>[0]
  label: string
}) {
  const [busy, setBusy] = useState<DocumentDownloadStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function start() {
    setError(null)
    setNotice(null)
    setBusy('signing')
    try {
      setNotice(await runDocumentDownload(offer, { onStep: setBusy }))
    } catch (cause) {
      setError(
        cause instanceof DownloadFailure || cause instanceof Error ? cause.message : String(cause),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void start()}
        className="btn-secondary w-full text-sm disabled:opacity-60"
      >
        {busy === null ? label : DOCUMENT_STEP_TEXT[busy]}
      </button>
      {offer.weightWarning && <p className="mt-1 text-xs text-amber-900">{offer.weightWarning}</p>}
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
      <p className="mt-1 text-xs text-stone-500">
        {offer.kindText}
        {offer.bytes !== null && ` · ${fileSizeText(offer.bytes) ?? ''}`}
      </p>
    </div>
  )
}
