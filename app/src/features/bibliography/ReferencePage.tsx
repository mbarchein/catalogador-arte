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
 * La ficha de una referencia bibliográfica (RF-506, RF-309, RF-609).
 *
 * Lo que añade y no existía en ningún sitio: **leer la referencia por el otro lado**,
 * es decir qué obras del catálogo la citan y en qué página de ella sale cada una. Eso
 * es el bloque «Obras citadas» de RF-506, con el código enlazado y las páginas y las
 * notas, y **sin miniatura**, que lo dice el requisito.
 *
 * **Corregirla es el MISMO panel que abre la ficha de una obra**, tal cual: una
 * referencia se corrige igual desde donde se la cita que desde aquí, o son dos
 * formularios que tienen que ponerse de acuerdo. Y el planificador es el mismo, así
 * que el choque de la clave BibTeX y el «no has cambiado nada» se comportan igual por
 * los dos caminos.
 *
 * **No hay retirada desde aquí, y su ausencia es la decisión.** Una referencia se
 * retira desde la papelera, donde también se recupera; poner el botón en esta pantalla
 * dejaría media operación en un sitio y la otra media en otro. Lo dice el pie en vez de
 * dejar buscarlo.
 *
 * La lista entera de referencias se carga para esta ficha, y no es un descuido: es lo
 * que necesita la comprobación del choque de clave al corregir (`planReferenceEdit`),
 * y de paso es de donde sale la referencia de esta dirección sin una segunda consulta.
 * La decisión de cargarla entera está razonada en `useReferences`.
 */
export function ReferencePage() {
  const { id = '' } = useParams()
  const { canEdit } = useAuth()
  // El permiso para escribir se pregunta con su tercera respuesta y no con `canEdit` a
  // secas: el rol llega DESPUÉS de la sesión, así que decidir en el primer render echa
  // de aquí a la catalogadora a la que la pantalla pertenece, y solo al recargar su
  // dirección — el fallo que este proyecto ya pagó tres veces. La ficha que se LEE no
  // usa esto y no espera a nada.
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

  // Nunca una página en blanco: una dirección que no corresponde a ninguna referencia
  // lo dice y ofrece la salida, en vez de una pantalla vacía que parece un fallo de red.
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
          Esta referencia está retirada del catálogo: no se ofrece para citar. Se recupera desde la
          papelera, en Tablas.
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
        Una obra se cita en esta referencia desde la bibliografía de la obra, no desde aquí: la
        página y la nota son de esa cita en concreto. Y retirarla del catálogo o recuperarla se hace
        desde la papelera, en Tablas.
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
          // El aviso de alcance de la ficha de obra cuenta las OTRAS obras que la
          // citan, porque allí se corrige desde una de ellas. Aquí no se corrige desde
          // ninguna, así que el alcance es el número entero de citas vivas, que además
          // ya está contado y en pantalla justo encima.
          otherArtworks={views.length}
          onSave={(draft) => updateReference(reference.id, draft)}
        />
      )}
    </Layout>
  )
}

/** Una línea de la ficha. Nunca un hueco (RF-304): cuando no hay dato, se dice. */
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
