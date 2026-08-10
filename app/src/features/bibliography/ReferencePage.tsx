import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useAuth, useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { LoadingNotice } from '../../components/ui'
import {
  referenceAuthorText,
  referenceSourceText,
  referenceYearText,
} from '../documentary/bibliography/citationFormat'
import { ReferenceSheet } from '../documentary/bibliography/ReferenceSheet'
import { referenceTitleText } from '../documentary/bibliography/referenceEdit'
import { usePublicationTypes } from '../tables/usePublicationTypes'
import {
  citedArtworkViews,
  citedArtworksNotice,
  citedArtworksSummary,
  REFERENCE_MISSING_TEXT,
} from './referenceRecord'
import { useCitedArtworks } from './useCitedArtworks'
import { useReferences } from './useReferences'

/**
 * The record of a bibliographic reference (RF-506, RF-309, RF-609).
 *
 * What it adds and did not exist anywhere: **reading the reference from the other side**,
 * that is, which artworks of the catalogue cite it and on which of its pages each one appears. That
 * is RF-506's «Obras citadas» block, with the code linked and the pages and the
 * notes, and **with no thumbnail**, which the requirement states.
 *
 * **Correcting it is the SAME panel an artwork's record opens**, exactly: a
 * reference is corrected the same from where it is cited as from here, or they are two
 * forms that have to agree with each other. And the planner is the same, so
 * the BibTeX key clash and the «you have not changed anything» behave alike by
 * both paths.
 *
 * **There is no withdrawal from here, and its absence is the decision.** A reference is
 * withdrawn from the wastebasket, where it is also recovered; putting the button on this screen
 * would leave half an operation in one place and the other half in another. The foot says so instead of
 * letting it be hunted for.
 *
 * The whole reference list is loaded for this record, and it is not an oversight: it is what
 * the key clash check on correcting needs (`planReferenceEdit`),
 * and incidentally it is where this address's reference comes from with no second query.
 * The decision to load it whole is reasoned in `useReferences`.
 */
export function ReferencePage() {
  const { id = '' } = useParams()
  const { canEdit } = useAuth()
  // The permission to write is asked about with its third answer and not with a bare
  // `canEdit`: the role arrives AFTER the session, so deciding on the first render throws
  // out of here the cataloguer the screen belongs to, and only on reloading its
  // address — the failure this project has already paid for three times. The record that is READ does not
  // use this and waits for nothing.
  const editAccess = useEditingAccess()

  const { references, loading, error, updateReference } = useReferences()
  const cited = useCitedArtworks(id)
  const types = usePublicationTypes()
  const [editing, setEditing] = useState(false)

  const reference = useMemo(() => references.find((row) => row.id === id) ?? null, [references, id])
  const views = useMemo(() => citedArtworkViews(cited.rows), [cited.rows])
  const summary = citedArtworksSummary(views)
  const notice = citedArtworksNotice({
    loading: cited.loading,
    error: cited.error,
    count: views.length,
  })

  if (loading && reference === null) return <LoadingNotice>Cargando la referencia…</LoadingNotice>

  // Never a blank page: an address matching no reference says so and offers the way
  // out, instead of an empty screen that looks like a network failure.
  if (reference === null) {
    return (
      <Layout title="Referencia" back="/bibliography">
        <p role="alert" className="card text-sm text-stone-700">
          {error ?? REFERENCE_MISSING_TEXT}
        </p>
      </Layout>
    )
  }

  const author = referenceAuthorText(reference)
  const source = referenceSourceText(reference)
  const type = reference.publication_type?.name.trim() || null

  return (
    <Layout
      title={referenceTitleText(reference)}
      back="/bibliography"
      action={
        canEdit ? (
          <button
            type="button"
            className="flex min-h-[2.5rem] items-center rounded-lg bg-stone-800 px-2.5 text-sm font-medium text-white"
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!reference.active && (
        <p className="card mb-3 bg-stone-100 text-sm text-stone-700">
          Está retirada del catálogo: no se ofrece para citar. Se recupera desde la papelera.
        </p>
      )}

      {/* La ficha, corta y sin galería, como pide RF-309 para todo lo que no es una
          obra. El orden es el de una entrada de bibliografía: quién, cuándo, qué y
          dónde salió. */}
      <section className="card">
        <dl>
          <RecordRow label="Autoría" value={author} />
          <RecordRow label="Año" value={referenceYearText(reference)} />
          <RecordRow label="Tipo" value={type} />
          <RecordRow label="Publicación" value={source} />
          <RecordRow label="Clave de cita" value={reference.bibtex_key?.trim() || null} mono />
          <RecordRow label="Nota" value={reference.note.trim() || null} />
        </dl>
      </section>

      {/* «Obras citadas» (RF-506): el código enlazado, las páginas y las notas. Sin
          miniatura, que lo dice el requisito — lo que se pregunta aquí es en qué página
          sale, y eso es texto. */}
      <section className="mt-3">
        <h2 className="mb-2 px-1 text-sm font-medium uppercase tracking-wide text-stone-500">
          Obras citadas
        </h2>
        {summary && <p className="mb-2 px-1 text-xs text-stone-500">{summary}</p>}
        {notice && <p className="card text-sm text-stone-600">{notice}</p>}
        <ul className="space-y-2">
          {views.map((view) => {
            const body = (
              <>
                <span className="block font-mono text-xs text-stone-500">{view.catalogId}</span>
                <span className="mt-0.5 block break-words font-medium">{view.title}</span>
                {view.pages !== null && (
                  <span className="mt-0.5 block text-xs text-stone-600">{view.pages}</span>
                )}
                {view.note !== null && (
                  <span className="mt-0.5 block break-words text-xs text-stone-500">
                    {view.note}
                  </span>
                )}
                {view.retired && (
                  <span className="mt-1 inline-block rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600">
                    En la papelera
                  </span>
                )}
              </>
            )
            return (
              <li key={view.id}>
                {/* La fila entera es el enlace, como en el listado de exposiciones: en
                    un móvil, un código de siete caracteres como única zona pulsable es
                    un objetivo que se falla. Y una obra que no se puede leer no se
                    enlaza a una ficha que no va a abrir. */}
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
        </ul>
      </section>

      <p className="mt-3 text-xs text-stone-500">
        Las obras se citan desde su propia ficha. Retirar la referencia, desde la papelera.
      </p>

      {/* La corrección espera a saber el rol: «todavía no se sabe» no es «no». */}
      {editing && editAccess === 'loading' && <LoadingNotice />}
      {editing && editAccess === 'denied' && <Navigate to={`/bibliography/${id}`} replace />}
      {editing && editAccess === 'allowed' && (
        <ReferenceSheet
          open
          onClose={() => setEditing(false)}
          reference={reference}
          publicationTypes={types.entries}
          // The artwork record's scope warning counts the OTHER artworks that
          // cite it, because there it is corrected from one of them. Here it is not corrected from
          // any, so the scope is the whole number of live citations, which besides
          // is already counted and on screen right above.
          otherArtworks={views.length}
          onSave={(draft) => updateReference(reference.id, draft)}
        />
      )}
    </Layout>
  )
}

/** One line of the record. Never a gap (RF-304): when there is no datum, it is said. */
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
      <dt className="w-28 shrink-0 text-sm text-stone-500">{label}</dt>
      <dd className={`min-w-0 break-words text-sm ${mono ? 'font-mono' : ''}`}>
        {value === null ? <span className="text-stone-400">Sin dato</span> : value}
      </dd>
    </div>
  )
}
