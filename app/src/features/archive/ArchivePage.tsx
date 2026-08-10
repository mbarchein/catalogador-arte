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
 * The archive's listing, with its dedicated search (RF-515, RF-606, RF-609).
 *
 * **It closes the last gap of this kind.** An archive document could be uploaded,
 * linked, downloaded, corrected and digitised, all from the record of an artwork
 * that had it linked; one that no artwork had linked was not reachable from
 * anywhere — the poster of a show that does not speak of a particular piece, or the
 * document whose link was withdrawn —. It is the same gap the bibliography had.
 *
 * **It is read by anybody who can read**, like the bibliography and the exhibitions: a
 * document is catalogue content and not a maintenance list, and the RLS already
 * hands a Reader only the live ones.
 *
 * **There is no creation here, and its absence is the decision.** Uploading a document is done from an
 * artwork's documentation, with «Subir un documento del archivo», because that way it ends up
 * uploaded and linked in one go — and that is the normal case, the letter that speaks of the artwork
 * in front of you. A standalone creation from here would produce unlinked documents, which
 * is exactly what this screen exists to be able to find.
 *
 * The count says **how many are not digitised**, which is the figure that only makes
 * sense on this screen: here it is a work list for scanning, whereas in an
 * artwork's block the question is «can I read this paper?».
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
        <div className="mb-2 flex items-start gap-1 text-sm text-stone-600">
          <p className="min-w-0">
            {archiveCountText({
              total,
              shown: entries.length,
              searching: query.trim() !== '',
              withoutFile: withoutFileCount(entries),
            })}
          </p>
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
        </div>
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
