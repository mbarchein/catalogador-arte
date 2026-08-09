import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { InfoNote, Toggle } from '../../components/ui'
import {
  archiveCountText,
  archiveListNotice,
  rankArchiveDocuments,
  retiredDocumentCount,
  withoutFileCount,
} from './documentIndex'
import { useArchiveIndex } from './useArchiveIndex'

/**
 * El listado del archivo, con su búsqueda dedicada (RF-515, RF-606, RF-609).
 *
 * **Cierra el último hueco de este tipo.** Un documento del archivo se subía, se
 * enlazaba, se descargaba, se corregía y se digitalizaba, todo desde la ficha de una obra
 * que lo tuviera enlazado; a uno que ninguna obra tuviera enlazado no se llegaba desde
 * ningún sitio — el cartel de una muestra que no habla de una pieza concreta, o el
 * documento cuyo vínculo se retiró —. Es el mismo hueco que tenía la bibliografía.
 *
 * **Lo lee cualquiera que pueda leer**, como la bibliografía y las exposiciones: un
 * documento es contenido del catálogo y no una lista de mantenimiento, y la RLS ya
 * entrega a un Lector solo los vivos.
 *
 * **No hay alta aquí, y su ausencia es la decisión.** Subir un documento se hace desde la
 * documentación de una obra, con «Subir un documento del archivo», porque así queda
 * subido y enlazado de una vez — y ese es el caso normal, la carta que habla de la obra
 * que se tiene delante. Un alta suelta desde aquí produciría documentos sin enlazar, que
 * es justo lo que esta pantalla existe para poder encontrar.
 *
 * El recuento dice **cuántos están sin digitalizar**, que es la cifra que solo tiene
 * sentido en esta pantalla: aquí es una lista de trabajo del escaneo, mientras que en el
 * bloque de una obra la pregunta es «¿puedo leer este papel?».
 */
export function ArchivePage() {
  const { canEdit } = useAuth()
  const { documents, loading, error } = useArchiveIndex()
  const [query, setQuery] = useState('')
  const [includingRetired, setIncludingRetired] = useState(false)

  const entries = useMemo(
    () => rankArchiveDocuments(documents, query, { includeRetired: includingRetired }),
    [documents, query, includingRetired],
  )
  const retired = retiredDocumentCount(documents)
  const total = includingRetired ? documents.length : documents.length - retired

  const notice = archiveListNotice({
    loading,
    error,
    total: documents.length,
    shown: entries.length,
    query,
    includingRetired,
  })

  return (
    <Layout
      title="Archivo"
      back="/"
      headerContent={
        <input
          className="field min-h-[2.5rem] py-1"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Signatura, título, tipo o año"
          aria-label="Buscar en el archivo"
          autoComplete="off"
          autoCapitalize="none"
        />
      }
    >
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* El recuento, y detrás del icono de dónde salen los documentos: con el
          archivo lleno, el estado vacío ya no se lee nunca más, y esa era la única
          frase que lo decía. */}
      {entries.length > 0 && (
        <p className="mb-2 flex items-start gap-1 text-sm text-stone-600">
          <span className="min-w-0">
            {archiveCountText({
              total,
              shown: entries.length,
              searching: query.trim() !== '',
              withoutFile: withoutFileCount(entries),
            })}
          </span>
          <InfoNote title="El archivo" className="-mt-1 shrink-0">
            <p>
              Los documentos se suben desde la documentación de una obra: así quedan
              subidos y enlazados con ella de una vez.
            </p>
            <p>
              Aquí están todos, también los que no tiene enlazados ninguna obra, y de
              cada uno se ve si está digitalizado.
            </p>
          </InfoNote>
        </p>
      )}

      {canEdit && retired > 0 && (
        <div className="mb-3">
          <Toggle
            active={includingRetired}
            onChange={setIncludingRetired}
            label="Ver también los retirados"
            help={`${
              retired === 1 ? '1 documento retirado' : `${retired} documentos retirados`
            }. Se recuperan desde la papelera, en Tablas.`}
          />
        </div>
      )}

      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.row.id}>
            <Link
              to={`/archive/${entry.row.id}`}
              className={`card block active:bg-stone-50 ${entry.retired ? 'opacity-60' : ''}`}
            >
              {/* La signatura encabeza, y es lo que se lee en vertical al recorrer un
                  archivo: es la etiqueta escrita en la carpeta. El que no la tiene lo
                  dice, porque «sin signatura» significa «todavía no archivado» y es una
                  respuesta, no un hueco. */}
              <span className="block font-mono text-xs text-stone-500">
                {entry.code ?? <span className="font-sans italic">Sin signatura</span>}
              </span>
              <span className="mt-0.5 block break-words font-medium">{entry.title}</span>
              <span className="mt-0.5 block break-words text-xs text-stone-600">
                {entry.kind} · {entry.date}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                {/* Digitalizado o no, en la fila y no un toque más adentro: es lo que
                    decide si el papel hay que ir a buscarlo. */}
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    entry.digitized ? 'bg-stone-100 text-stone-700' : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {entry.fileText}
                </span>
                {entry.retired && (
                  <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600">
                    Retirado del archivo
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {entries.length > 0 && (
        <p className="mt-3 text-xs text-stone-500">
          Todos los documentos del archivo. Se suben desde la documentación de una obra.
        </p>
      )}
    </Layout>
  )
}
