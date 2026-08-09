import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { InfoNote, Toggle } from '../../components/ui'
import {
  bibliographyListNotice,
  rankReferences,
  referenceCountText,
  retiredReferenceCount,
} from './bibliographyIndex'
import { useReferences } from './useReferences'

/**
 * El listado de la bibliografía, con su búsqueda dedicada (RF-606, RF-506, RF-609).
 *
 * **Es la mitad barata de un hueco que la ficha de obra declaraba en voz alta.** Una
 * referencia se creaba y se corregía solo desde una obra que la citara, así que a una
 * referencia sin citas no se llegaba desde ningún sitio: seguía en el catálogo,
 * seguía ocupando su clave BibTeX, y era invisible. Desde aquí se encuentra.
 *
 * **Lo legible por cualquiera que pueda leer, como las exposiciones y al contrario
 * que las tablas maestras.** Una referencia es contenido del catálogo y no una lista
 * de mantenimiento: un Lector la consulta igual que consulta una obra, y la RLS ya le
 * entrega solo las vivas.
 *
 * **No hay botón de «nueva referencia», y su ausencia es la decisión.** Una referencia
 * existe porque algo la cita: se crea desde la bibliografía de una obra, al citarla, y
 * un alta suelta desde aquí produciría referencias que nadie cita — exactamente lo
 * que esta pantalla existe para poder encontrar. Lo dice el aviso del catálogo vacío,
 * en vez de dejar un hueco donde se busca un botón.
 *
 * **La fila entera es el enlace a su ficha** (RF-506), como en el listado de
 * exposiciones: en un móvil, un trozo de texto pequeño como única zona pulsable es un
 * objetivo que se falla. Mientras no existió la ficha, la fila no era pulsable a
 * propósito —un `card` que no lleva a ningún sitio se toca una vez y se aprende que no
 * responde—; ahora lleva.
 */
export function BibliographyPage() {
  const { canEdit } = useAuth()
  const { references, loading, error } = useReferences()
  const [query, setQuery] = useState('')
  const [includingRetired, setIncludingRetired] = useState(false)

  const entries = useMemo(
    () => rankReferences(references, query, { includeRetired: includingRetired }),
    [references, query, includingRetired],
  )
  const retired = retiredReferenceCount(references)
  const total = includingRetired ? references.length : references.length - retired

  const notice = bibliographyListNotice({
    loading,
    error,
    total: references.length,
    shown: entries.length,
    query,
    includingRetired,
  })

  return (
    <Layout
      title="Bibliografía"
      back="/"
      headerContent={
        <input
          className="field min-h-[2.5rem] py-1"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Autor, título, año, revista o lugar"
          aria-label="Buscar en la bibliografía"
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

      {/* El contador va arriba y siempre: un listado filtrado que parece completo es
          cómo se pierde una referencia. */}
      {entries.length > 0 && (
        <div className="mb-2 flex items-start gap-1 text-sm text-stone-600">
          <p className="min-w-0">
            {referenceCountText({
              total,
              shown: entries.length,
              searching: query.trim() !== '',
            })}
          </p>
          {/* De dónde sale una referencia, detrás del icono: con la bibliografía
              llena, el estado vacío —que era quien lo decía— ya no se lee. */}
          <InfoNote title="La bibliografía" className="-mt-1 shrink-0">
            <p>
              Una referencia se da de alta al citarla desde la bibliografía de una obra.
            </p>
            <p>
              Aquí están todas, también las que ya no cita ninguna, y desde su ficha se
              corrigen para todas las obras que las citen.
            </p>
          </InfoNote>
        </div>
      )}

      {/* La papelera solo para quien puede editar, y solo cuando hay algo dentro: un
          interruptor que no cambia nada parece roto, y el Lector no recibe las
          retiradas. */}
      {canEdit && retired > 0 && (
        <div className="mb-3">
          <Toggle
            active={includingRetired}
            onChange={setIncludingRetired}
            label="Ver también las retiradas"
            help={`${
              retired === 1 ? '1 referencia retirada' : `${retired} referencias retiradas`
            }. Se recuperan desde la papelera, en Tablas.`}
          />
        </div>
      )}

      {/* Nunca una página en blanco: sin resultados se explica por qué, y con el
          catálogo vacío se dice de dónde salen las referencias. */}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.row.id}>
            <Link
              to={`/bibliography/${entry.row.id}`}
              className={`card block active:bg-stone-50 ${entry.retired ? 'opacity-60' : ''}`}
            >
              {/* El año encabeza y en su columna: es lo que se lee en vertical al
                  recorrer una bibliografía, y «s.f.» ocupa el mismo sitio que un año
                  para que la columna no se descuadre con las referencias sin fecha. */}
              <span className="block text-xs tabular-nums text-stone-500">
                {entry.year}
                {entry.bibtexKey !== null && (
                  <span className="ml-2 font-mono text-stone-400">{entry.bibtexKey}</span>
                )}
              </span>
              {/* Sin resaltar las letras que encontró la búsqueda, por el mismo motivo
                  escrito en el listado de exposiciones: los índices de `fuzzyRankBy`
                  son posiciones dentro de la línea entera, y esta fila la parte en
                  tres. Un resaltado desplazado una letra es peor que ninguno. */}
              <span className="mt-0.5 block break-words font-medium">{entry.title}</span>
              <span className="mt-0.5 block break-words text-xs text-stone-600">{entry.hint}</span>
              {entry.retired && (
                <span className="mt-1 inline-block rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600">
                  Retirada del catálogo
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {/* Dicho al pie y una sola vez, no en cada fila: de dónde sale una referencia
          nueva, que es lo que no se hace desde aquí. Prometer menos de lo que hay es lo
          que evita buscar un botón que no está. */}
      {entries.length > 0 && (
        <p className="mt-3 text-xs text-stone-500">
          Todas las referencias del catálogo. Se crean citándolas desde la bibliografía de una obra.
        </p>
      )}
    </Layout>
  )
}
