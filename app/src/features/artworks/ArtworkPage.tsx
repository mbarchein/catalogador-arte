import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { useAuth, useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { NoteRow } from '../documentary/NoteText'
import { WhenNearby } from '../../components/WhenNearby'
import { supabase } from '../../lib/supabase'
import { displayDate } from '../../lib/dates'
import { existenceNotice, attributedTitleNotice, displayMeasurements, displayTitle } from '../../lib/title'
import {
  ARTIST_LABEL,
  CONSERVATION_LABEL,
  EXISTENCE_LABEL,
  ATTRIBUTED_TITLE_LABEL,
  ATTRIBUTED_TITLE_DESCRIPTION,
  TRI_STATE_LABEL,
  type Artwork,
  type AttributedTitleValue,
} from '../../lib/types'
import {
  MIN_YEAR,
  adjustYear,
  parseManualDate,
  maxYear,
  composeDate,
} from '../../lib/structuredDate'
import { draftDirty } from '../../components/formDirty'
import { useUnloadGuard } from '../../components/useUnloadGuard'
import {
  ActionBar,
  BanIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Chips,
  ComboBox,
  EllipsisIcon,
  FieldGroup,
  OptionCards,
  PenIcon,
  TagIcon,
  Toggle,
  ToggleChip,
  TriStateIcons,
  UnreviewedIcon,
  YearStepper,
} from '../../components/ui'
import { useLiveChanges } from '../../lib/live'
import { useArtworkDocumentary } from '../documentary/useDocumentary'
import { ProvenanceSection } from '../documentary/provenance'
import { ExhibitionHistorySection } from '../documentary/exhibitions'
import { BibliographySection } from '../documentary/bibliography'
import { DocumentsSection } from '../documentary/documents'
import { ExternalLinksSection } from '../documentary/links'
import { RelationshipsSection } from '../documentary/relationships'
import { ChangeHistorySection } from '../history/ChangeHistorySection'
import { ArtworkGallery } from './ArtworkGallery'
import { parseView } from './listView'
import { decideSwipe, dragOffset, swipeAxis } from './sequence'
import { useArtwork } from './useArtworks'
import { useArtworkSequence, type ArtworkSequence } from './useArtworkSequence'
import { useArtworkTypes } from './useArtworkTypes'
import { useSeries } from './useSeries'
import { placePathText, placesInside, type PlaceTree } from '../../lib/places'
import { usePhysicalPlaces } from './usePhysicalPlaces'
import { PlacePicker } from './PlacePicker'

/** Which way the record was left, for the animation that brings the next one. */
type Direction = 'previous' | 'next'

/**
 * Strip of the screen edges left to the system's own back gesture, in pixels.
 * Disputing it there would make both gestures unreliable, and one of the two is
 * the way out of the application.
 */
const SYSTEM_EDGE = 24

const AUTHORSHIP_ICON: Record<AttributedTitleValue, typeof PenIcon> = {
  NO: PenIcon,
  YES: TagIcon,
  UNCONFIRMED: UnreviewedIcon,
  NOT_APPLICABLE: BanIcon,
  UNREVIEWED: EllipsisIcon,
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-32 shrink-0 text-sm text-stone-500">{label}</dt>
      {/* Never an empty gap (RF-304): when there is no datum, it is said. */}
      <dd className="text-sm">{value.trim() === '' ? <span className="text-stone-400">Sin dato</span> : value}</dd>
    </div>
  )
}

export function ArtworkPage() {
  const { id } = useParams<{ id: string }>()
  // The list's view travels in the URL of the record, and it is what defines
  // the sequence this record belongs to: its filters, its search and its order
  // (RF-311). Entering cold — the printed QR — there are no parameters and the
  // sequence is the whole catalog.
  const [searchParams] = useSearchParams()
  const view = useMemo(() => parseView(searchParams), [searchParams])
  // The tree of places: the record reads the location off it, and the sequence
  // needs the reach of the location filter when the list was filtered by one.
  const { tree: placeTree, loading: placesLoading } = usePhysicalPlaces()
  const placeScope = useMemo(
    () => (placesLoading ? null : placesInside(placeTree, view.places)),
    [placesLoading, placeTree, view.places],
  )
  const sequence = useArtworkSequence(view, id, placeScope)
  const { artwork, loading, error, reload } = useArtwork(id, sequence.rows)
  const { canEdit } = useAuth()
  // La zona de edición necesita la tercera respuesta —«todavía no se sabe»— y la
  // vista no: ver el guardián de más abajo.
  const editAccess = useEditingAccess()
  const navigate = useNavigate()
  // Editing lives in the URL (/artwork/:id/edit), not in local state (see the
  // route comment in App.tsx).
  const editing = useMatch('/artwork/:id/edit') !== null
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [entering, setEntering] = useState<Direction | null>(null)

  // Every route change from here carries the view along, so the queue survives
  // going to the photos, editing and coming back.
  const query = searchParams.toString()
  const recordPath = useCallback(
    (target: string | undefined) => ({ pathname: `/artwork/${target}`, search: query }),
    [query],
  )
  const listPath = query === '' ? '/' : `/?${query}`

  /**
   * Passing to another artwork REPLACES the history entry, like the filters of
   * the list do: swiping through thirty records must not bury the list under
   * thirty entries — «atrás» has to come back to the list, which is what the
   * cataloger means by it.
   *
   * With one exception: entering cold, by scanning the printed QR, there is no
   * in-app history behind, and replacing it would leave «Volver» pointing out of
   * the application (see Layout.goBack, which reads this same `key`). So the
   * first jump from a cold record pushes, and the ones after that replace.
   */
  const cold = useLocation().key === 'default'
  const goTo = useCallback(
    (target: string | null, direction: Direction) => {
      if (!target) return
      setEntering(direction)
      navigate(recordPath(target), { replace: !cold })
    },
    [cold, navigate, recordPath],
  )

  // A record starts at its beginning, not halfway down the previous one.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [id])

  // Arrow keys: phase 2, documentation and research, happens sitting at a desk.
  useEffect(() => {
    if (editing) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      // Not while typing, and not inside a control that uses the arrows itself.
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      // Con la galería a pantalla completa, las flechas son suyas: ahí mueven
      // entre las fotografías de esta obra. Pasar de ficha por debajo dejaría al
      // visor enseñando las fotos de otra pieza.
      if (document.querySelector('[data-photo-viewer]')) return
      if (event.key === 'ArrowLeft') goTo(sequence.previous, 'previous')
      if (event.key === 'ArrowRight') goTo(sequence.next, 'next')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing, goTo, sequence.previous, sequence.next])

  // pdf-lib loads only when the record is requested: it must not bloat the
  // initial bundle.
  async function printRecord(theArtwork: Artwork) {
    setGeneratingPdf(true)
    setPdfError('')
    try {
      const { generateRecordPdf } = await import('../../lib/recordPdf')
      const blob = await generateRecordPdf(theArtwork, placePathText(placeTree, theArtwork.physical_place_id))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${theArtwork.catalog_id}-ficha.pdf`
      link.click()
      // Generous margin: some browsers download deferred.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setPdfError('No se ha podido generar el PDF. Vuelve a intentarlo.')
    } finally {
      setGeneratingPdf(false)
    }
  }

  // The record in view mode refreshes when someone else changes it. While
  // editing it does NOT: overwriting a half-filled form with foreign data
  // would destroy work — the concurrent-edit conflict belongs to the edit lock
  // (RF-700), pending.
  useLiveChanges('artworks', () => {
    if (!editing) void reload()
  }, id ? `catalog_id=eq.${id}` : undefined)

  if (loading) {
    return (
      <Layout title={id} back={listPath}>
        <p className="text-sm text-stone-600">Cargando…</p>
      </Layout>
    )
  }

  if (!artwork) {
    return (
      <Layout title={id} back={listPath}>
        {/* Two different things, and confusing them sends the cataloger looking
            for a record that is perfectly fine: the catalog answered that this
            record is not available to her, or the catalog did not answer. */}
        <div className="card text-sm">
          {error ? (
            <>
              <p className="font-medium">No se ha podido cargar la ficha {id}.</p>
              <p className="mt-1 text-stone-600">
                Sin conexión, y esta ficha no está descargada. Inténtalo donde haya cobertura.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No se ha encontrado la ficha {id}.</p>
              <p className="mt-1 text-stone-600">
                Puede que esté dada de baja, o que no tengas permiso para verla.
              </p>
            </>
          )}
        </div>
      </Layout>
    )
  }

  // Reaching /edit by URL without permission falls back to the view: the
  // Reader must never see an editable form, even a doomed one (RF-109).
  //
  // Y hay TRES respuestas, no dos. El rol llega después de la sesión, así que
  // preguntar por `canEdit` en el primer render contestaba «no» a la catalogadora a
  // la que la zona de edición pertenece: recargar /artwork/:id/edit —o abrir esa
  // dirección en frío— devolvía a la vista, y con ella se perdían los seis bloques
  // documentales, que solo se escriben ahí. Es el fallo que `useEditingAccess`
  // documenta y que aquí seguía sin corregir. Solo espera la zona de edición: la
  // ficha que se lee no depende del rol y no debe retrasarse por él.
  if (editing && editAccess === 'loading') {
    return (
      <Layout title={`Editando ${artwork.catalog_id}`} back={`/artwork/${id}`}>
        <p className="text-sm text-stone-600">Cargando…</p>
      </Layout>
    )
  }
  if (editing && editAccess === 'denied') {
    return <Navigate to={recordPath(id)} replace />
  }

  if (editing) {
    return (
      <Layout title={`Editando ${artwork.catalog_id}`} back={`/artwork/${id}`}>
        <EditForm
          artwork={artwork}
          onDone={async () => {
            await reload()
            navigate(recordPath(id), { replace: true })
          }}
          onCancel={() => navigate(recordPath(id), { replace: true })}
        />
        {/* Los bloques documentales, y aquí es donde se pueden escribir: la
            ficha que se lee no ofrece cambiar nada (RF-308).

            Van DESPUÉS de la botonera de guardar y con su propio aviso, y eso no es
            maquetación: estos bloques guardan cada cambio en el momento, mientras que
            el formulario de arriba guarda al pulsar «Guardar» y se descarta al
            cancelar. Dos formas de guardar en la misma pantalla se confunden si nada
            lo dice, y quien cancele esperando deshacer un eslabón de procedencia se
            va a llevar una sorpresa. Se dice. */}
        <div className="mt-8 border-t border-stone-200 pt-6">
          <h2 className="text-base font-semibold text-stone-800">Documentación de la obra</h2>
          <p className="mt-1 text-sm text-stone-600">
            La procedencia, las exposiciones, la bibliografía, los documentos del archivo, los
            enlaces a sitios externos y las obras relacionadas{' '}
            <strong>se guardan al momento</strong>, cada una por su cuenta. No hace falta pulsar
            «Guardar», y «Cancelar» no las deshace.
          </p>
          <div className="mt-4">
            <DocumentaryBlocks
              artwork={artwork}
              placeTree={placeTree}
              search={query}
              writable
            />
          </div>
        </div>
      </Layout>
    )
  }

  const titleNotice = attributedTitleNotice(artwork.attributed_title)
  const statusNotice = existenceNotice(artwork)

  return (
    <Layout
      title={artwork.catalog_id}
      back={listPath}
      // The navigation goes in the FIXED header: passing to the next artwork is
      // the most repeated action of a session, and up here it never scrolls
      // away, however long the record. The header splits in two: which artwork
      // is being read on the left, where to go on the right.
      headerContent={
        sequence.index > 0 ? (
          <SequenceBar sequence={sequence} catalogId={artwork.catalog_id} onGo={goTo} />
        ) : undefined
      }
    >
      {/* Everything the gesture moves goes inside, remounted per record so it
          slides in from the side the finger went. */}
      <SwipeArea
        key={artwork.catalog_id}
        entering={entering}
        hasPrevious={sequence.previous !== null}
        hasNext={sequence.next !== null}
        onSwipe={(direction) =>
          goTo(direction === 'previous' ? sequence.previous : sequence.next, direction)
        }
      >
        {canEdit && (
          /* Photographing and editing head the record, in two full-width
             buttons: they are what one comes to do with the artwork in front,
             and in the header they had to fit in a corner next to everything
             else. Down here the thumb cannot miss them. */
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate({ pathname: `/artwork/${id}/edit`, search: query })}
              className="btn-primary"
            >
              <PenIcon className="h-5 w-5" />
              Editar ficha
            </button>
            <button
              onClick={() => navigate({ pathname: `/artwork/${id}/photos`, search: query })}
              className="btn-secondary"
            >
              <CameraIcon className="h-5 w-5" />
              Editar fotos
            </button>
          </div>
        )}

        {error && (
          /* The query failed but the mirror had the record: outdated data plus a
             notice beats a blank page in a storage room, the same choice the
             list makes. */
          <p role="status" className="mb-3 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
            Sin conexión con el catálogo: se muestra la última copia descargada en este dispositivo.
          </p>
        )}

        <header className="mb-4">
          <p className="font-mono text-sm text-stone-500">{artwork.catalog_id}</p>
          <h1 className="text-xl font-semibold">{displayTitle(artwork.title)}</h1>
          <p className="text-sm text-stone-600">
            {ARTIST_LABEL[artwork.artist]} · {displayDate(artwork.execution_date)}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge
              active={artwork.inventory_phase_completed}
              text={artwork.inventory_phase_completed ? 'Fase 1 completa' : 'Fase 1 en curso'}
            />
            <Badge
              active={artwork.documentation_phase_completed}
              text={artwork.documentation_phase_completed ? 'Fase 2 completa' : 'Fase 2 en curso'}
            />
            {/* RF-306 and RF-307: the notices that change how the record reads
                go at the top, not buried among the data. */}
            {statusNotice && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                {statusNotice}
              </span>
            )}
            {titleNotice && (
              <span className="rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
                {titleNotice}
              </span>
            )}
          </div>

        </header>

        <ArtworkGallery catalogId={artwork.catalog_id} />

        <section className="card mb-3">
          <h2 className="mb-2 font-medium">Identificación</h2>
          <dl className="divide-y divide-stone-100">
            <DataRow label="Tipo" value={artwork.artwork_type} />
            <DataRow label="Serie" value={artwork.series} />
            <DataRow label="Técnica" value={artwork.technique} />
            <DataRow label="Soporte" value={artwork.support} />
            <DataRow label="Medidas" value={displayMeasurements(artwork)} />
            <DataRow
              label="Firmada"
              value={
                artwork.signed === 'YES' && artwork.signature_description
                  ? `Sí, ${artwork.signature_description}`
                  : TRI_STATE_LABEL[artwork.signed]
              }
            />
            <DataRow label="Fecha en la obra" value={TRI_STATE_LABEL[artwork.dated_on_artwork]} />
            <DataRow label="Título" value={ATTRIBUTED_TITLE_LABEL[artwork.attributed_title]} />
          </dl>
        </section>

        <section className="card mb-3">
          <h2 className="mb-2 font-medium">Conservación y localización</h2>
          <dl className="divide-y divide-stone-100">
            <DataRow label="Conservación" value={CONSERVATION_LABEL[artwork.conservation_status]} />
            <DataRow label="Existencia" value={EXISTENCE_LABEL[artwork.existence_status]} />
            <DataRow label="Ubicación" value={placePathText(placeTree, artwork.physical_place_id)} />
          </dl>
        </section>

        {/* The documentary half of the record (RF-303): by whose hands it has
            passed, where it has been shown, where it is published, what paper
            speaks about it, where else on the web it is documented, and which
            artworks it belongs with.

            After the two blocks that are read with the artwork in front and
            before the internal ones, in the order RF-303 stacks them. They arrive
            when the scroll gets near — see WhenNearby: six tables read on every
            record of a session over mobile data, for blocks nobody may open, is
            not a cost this earns. */}
        <WhenNearby
          placeholder={(reveal) => (
            <section className="card mb-3">
              <h2 className="font-medium">Documentación de la obra</h2>
              <p className="mt-1 text-sm text-stone-600">
                Procedencia, exposiciones, bibliografía, archivo, enlaces y obras relacionadas. Se cargan al llegar aquí.
              </p>
              <button type="button" onClick={reveal} className="btn-secondary mt-3 w-full text-sm">
                Cargar la documentación ahora
              </button>
            </section>
          )}
        >
          <DocumentaryBlocks artwork={artwork} placeTree={placeTree} search={query} />
        </WhenNearby>

        <section className="card mb-3">
          <h2 className="mb-2 font-medium">Estado del proceso</h2>
          <dl className="divide-y divide-stone-100">
            <DataRow label="Fotografiada" value={artwork.photographed ? 'Sí' : 'No'} />
            <DataRow label="Medidas verificadas" value={artwork.measurements_verified ? 'Sí' : 'No'} />
            <DataRow
              label="Ficha publicable"
              value={artwork.catalog_record_complete ? 'Sí' : 'No'}
            />
            {/* La única de texto libre, y la única que trae direcciones pegadas: a
                ancho completo, o una dirección larga se sale por el lado. */}
            <NoteRow label="Notas" value={artwork.inventory_process_notes} />
            <DataRow
              label="Actualizada"
              value={new Date(artwork.updated_at).toLocaleString('es-ES')}
            />
            <DataRow
              label="Toma de datos"
              value={
                artwork.basic_updated_at
                  ? new Date(artwork.basic_updated_at).toLocaleString('es-ES')
                  : ''
              }
            />
          </dl>
        </section>

        <section className="card mb-3">
          <h2 className="mb-2 font-medium">Etiqueta e impresión</h2>
          <p className="mb-3 text-sm text-stone-600">
            Ficha en A5 con los datos principales, la fotografía de la obra y un código QR que abre
            esta misma página — para acompañar a la etiqueta física {artwork.catalog_id}.
          </p>
          {pdfError && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {pdfError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void printRecord(artwork)}
            disabled={generatingPdf}
            className="btn-secondary w-full"
          >
            {generatingPdf ? 'Generando…' : 'Descargar ficha en PDF (A5)'}
          </button>
        </section>

        {/* El historial: es un dato de la obra. Solo lectura, así que su sitio es la
            ficha que se lee —es donde se hace la pregunta que contesta— y no la zona de
            edición. */}
        <ChangeHistorySection catalogId={artwork.catalog_id} />

        {/* Lo que no se puede hacer aquí, en UNA línea y con un enlace.
            
            Era media pantalla de advertencias al pie de la ficha que más se usa, leídas
            cien veces al día por quien ya sabe lo que dicen — y encima envejecida cuatro
            veces, porque una lista de carencias escrita en la pantalla equivocada nadie la
            revisa cuando construye una de ellas. El texto entero está en «Sobre la
            aplicación», donde se consulta cuando se busca: una vez. */}
        <p className="mt-3 px-1 text-xs text-stone-500">
          ¿Falta algo en esta ficha?{' '}
          <Link to="/about" className="underline">
            Lo que todavía no se puede hacer desde aquí
          </Link>
          .
        </p>

        {/* And at the end, the two neighbors with their code and title: reading
            a record and continuing with the next one is the whole working day,
            and here it takes one thumb and no scrolling back up. */}
        {sequence.index > 0 && (
          <nav aria-label="Obras contiguas" className="mt-3 flex items-stretch gap-2">
            <NeighborButton direction="previous" row={sequence.previousRow} onGo={goTo} />
            <NeighborButton direction="next" row={sequence.nextRow} onGo={goTo} />
          </nav>
        )}
      </SwipeArea>
    </Layout>
  )
}

/**
 * The documentary blocks of the record, stacked (RF-303).
 *
 * Six blocks and only FIVE of them are documentary sections: «Enlaces a sitios
 * externos» (RF-1400) hangs here with the same shape and the same `writable`, but it
 * has no research-status column in `artworks` and is not going to have one, so it is
 * not in `DOCUMENTARY_SECTIONS` and brings its own folding. The change-history block
 * did the same, for the same reason.
 *
 * **One query for the four research statuses, not five.** They live in a single
 * row of the artwork, and it is read here and handed down: a block asking for it
 * on its own would be four requests for the same row, and every heading reads it —
 * it is what keeps «Sin revisar» from being read as «no».
 *
 * The order is the one RF-303 fixes, and it is also the order the research is done
 * in: where the piece came from, where it has been shown, where it has been
 * published, what paper the archive keeps about it, where else on the web it is
 * documented, and last the block that talks about the catalogue itself instead of
 * about the world.
 *
 * Each block is COLLAPSED, decided by the foundations (`opensByDefault`) and not
 * repeated here: the exception — a block whose declared state contradicts what it
 * holds — arrives open, which is the one case where reading the heading alone
 * would mislead.
 */
function DocumentaryBlocks({
  artwork,
  placeTree,
  search,
  writable = false,
}: {
  artwork: Artwork
  placeTree: PlaceTree
  /** The list's view as it travels in the URL, so a related artwork keeps the queue (RF-311). */
  search: string
  /**
   * Si los bloques pueden escribir. Verdadero solo en la zona de edición
   * (RF-308): la ficha que se lee no ofrece cambiar ningún dato. Por omisión falso,
   * que es el lado seguro del olvido.
   */
  writable?: boolean
}) {
  const documentary = useArtworkDocumentary(artwork.catalog_id)
  // The tree the record already has loaded, so the archive block can say where the
  // paper is without a sixth query of its own for one crumb.
  const placeText = useCallback((placeId: string) => placePathText(placeTree, placeId), [placeTree])

  return (
    <>
      <ProvenanceSection
        writable={writable}
        catalogId={artwork.catalog_id}
        documentary={documentary.documentary}
        documentaryLoading={documentary.loading}
        documentaryError={documentary.error}
        setResearchStatus={documentary.setResearchStatus}
        // Where a provenance starts. Without it the stretch between the artist and
        // the first documented owner cannot be counted, and nothing is invented.
        originYear={artwork.start_year}
      />
      <ExhibitionHistorySection
        writable={writable}
        catalogId={artwork.catalog_id}
        documentary={documentary.documentary}
        documentaryLoading={documentary.loading}
        documentaryError={documentary.error}
        setResearchStatus={documentary.setResearchStatus}
      />
      <BibliographySection
        catalogId={artwork.catalog_id}
        documentary={documentary}
        writable={writable}
      />
      <DocumentsSection
        writable={writable}
        catalogId={artwork.catalog_id}
        documentary={documentary}
        placeText={placeText}
      />
      {/* Los enlaces externos, QUINTO y no último: son la misma pregunta que la
          bibliografía y el archivo —dónde está documentada esta obra— contestada
          con lo que no es papel, así que van detrás de esos dos y no antes. Y van
          delante de las obras relacionadas porque ese bloque cierra la pila por un
          motivo que sigue valiendo: es el único que habla del catálogo en vez de
          hablar del mundo.

          No recibe `documentary`, y no es un olvido: este bloque no tiene columna de
          estado de investigación en `artworks` ni la va a tener, que es justo por lo
          que no es uno de los cinco de DOCUMENTARY_SECTIONS y trae su propio
          plegado. Sí recibe `writable`, como sus cinco hermanos: abrir un enlace es
          leer y se queda en la vista, pero anotar que se ha comprobado escribe en la
          base y vive en la zona de edición (RF-308). */}
      <ExternalLinksSection catalogId={artwork.catalog_id} writable={writable} />
      <RelationshipsSection catalogId={artwork.catalog_id} search={search} writable={writable} />
    </>
  )
}

/**
 * The header of a record: which artwork on the left, where to go on the right
 * (RF-311).
 *
 * The two halves answer the two questions one asks of a queue, and the position
 * belongs with the artwork being read — «AR-0042, 12 de 87» is one sentence about
 * where you are, not a caption for the arrows.
 *
 * Each control carries the CODE of the artwork it leads to, because a bare arrow
 * asks the cataloger to jump blind. Not the title: half a phone header does not
 * hold it, and the pair at the foot of the record has the whole width for both.
 */
function SequenceBar({
  sequence,
  catalogId,
  onGo,
}: {
  sequence: ArtworkSequence
  catalogId: string
  onGo: (target: string | null, direction: Direction) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-semibold leading-tight">{catalogId}</p>
        <p className="truncate text-2xs leading-tight text-stone-500">
          {sequence.index} de {sequence.total}
          {/* Said only when the queue is not the list one arrived from, which is
              the one case where the total would be a lie about the listing. */}
          {!sequence.fromList && ' · todo el catálogo'}
        </p>
      </div>
      <nav aria-label="Navegación entre obras" className="flex flex-1 items-stretch gap-1.5">
        <NeighborButton compact direction="previous" row={sequence.previousRow} onGo={onGo} />
        <NeighborButton compact direction="next" row={sequence.nextRow} onGo={onGo} />
      </nav>
    </div>
  )
}

/**
 * The neighbor artwork as a control, in two sizes.
 *
 * `compact` is the header one: chevron and code, one line, because two of them
 * share half a phone header. The full one closes the record with the caption and
 * the title as well. Same order of information in both — direction, code,
 * title — so they read as the same control at two sizes.
 */
function NeighborButton({
  direction,
  row,
  onGo,
  compact = false,
}: {
  direction: Direction
  row: Artwork | null
  onGo: (target: string | null, direction: Direction) => void
  compact?: boolean
}) {
  const back = direction === 'previous'
  const label = back ? 'Obra anterior' : 'Obra siguiente'

  if (compact) {
    return (
      <button
        type="button"
        // Inactive at the ends, never gone: a control that disappears moves the
        // one next to it, and the queue is walked without looking.
        disabled={row === null}
        onClick={() => row && onGo(row.catalog_id, direction)}
        aria-label={
          row ? `${label}: ${row.catalog_id}, ${displayTitle(row.title)}` : `No hay ${label}`
        }
        // Barely any padding and a small chevron on purpose: two of these share
        // half a 360 px header, and the code has to fit whole — a truncated
        // «AR-004…» identifies nothing.
        className="flex min-h-touch min-w-0 flex-1 items-center justify-center gap-0.5 rounded-lg
                   border border-stone-300 bg-white px-0.5 text-stone-700 active:bg-stone-200
                   disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-300"
      >
        {back && <ChevronLeftIcon className="h-3.5 w-3.5 shrink-0" />}
        {/* An em dash at the ends: the shape of the control does not change, so
            the thumb finds the other one where it left it. */}
        <span className="truncate font-mono text-2xs font-semibold">
          {row?.catalog_id ?? '—'}
        </span>
        {!back && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />}
      </button>
    )
  }

  if (!row) {
    // The end of the queue is said with words down here, where there is room for
    // them, and never left as a hole (RF-304).
    return (
      <p
        className="flex min-h-[3.5rem] flex-1 items-center justify-center rounded-xl border
                   border-dashed border-stone-300 px-2 text-center text-xs text-stone-400"
      >
        {back ? 'Es la primera' : 'Es la última'}
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onGo(row.catalog_id, direction)}
      // The whole thing read out loud, because on screen the title may be cut.
      aria-label={`${label}: ${row.catalog_id}, ${displayTitle(row.title)}`}
      className="card flex min-h-[3.5rem] min-w-0 flex-1 items-center gap-1 p-3 text-left active:bg-stone-50"
    >
      {back && <ChevronLeftIcon className="h-5 w-5 shrink-0 text-stone-400" />}
      <span className={`min-w-0 flex-1 ${back ? '' : 'text-right'}`}>
        <span className="block text-2xs uppercase tracking-wide text-stone-500">
          {back ? 'Anterior' : 'Siguiente'}
        </span>
        <span className="block truncate font-mono text-xs font-semibold">{row.catalog_id}</span>
        <span className="block truncate text-xs text-stone-600">{displayTitle(row.title)}</span>
      </span>
      {!back && <ChevronRightIcon className="h-5 w-5 shrink-0 text-stone-400" />}
    </button>
  )
}

/**
 * Horizontal drag over the record to pass to the neighbor artwork (RF-311).
 *
 * **Two inputs, one behaviour.** The finger and the mouse do the same thing and
 * share the same arithmetic; they differ in what has to be prevented while they
 * do it. A finger would scroll the page, so `touchmove` is registered
 * NON-PASSIVE — React attaches its own touch listeners as passive, where
 * `preventDefault` does nothing, which is why these are attached by hand. A
 * mouse does not scroll, but it selects text and it clicks whatever it was
 * released on, so a drag captures the pointer and swallows the click that
 * follows. Without the mouse half, the gesture simply did not exist on a laptop.
 *
 * The CSS `touch-action` would have been shorter than the touch half, but it
 * applies by intersection along the ancestors: declaring `pan-y` here would
 * forbid the horizontal panning of the photo carousel INSIDE the record, and
 * over the gallery the gesture belongs to the photographs
 * (`data-swipe-ignore`).
 *
 * The arithmetic — which axis, what counts as enough, how far it follows the
 * finger — is in sequence.ts, where it can be tested. What is here is the
 * plumbing of the events.
 */
function SwipeArea({
  entering,
  hasPrevious,
  hasNext,
  onSwipe,
  children,
}: {
  entering: Direction | null
  hasPrevious: boolean
  hasNext: boolean
  onSwipe: (direction: Direction) => void
  children: ReactNode
}) {
  const area = useRef<HTMLDivElement>(null)
  // What the handlers need, in a ref: they are registered once, and rebuilding
  // them on every render would drop the gesture in progress.
  const latest = useRef({ hasPrevious, hasNext, onSwipe })
  latest.current = { hasPrevious, hasNext, onSwipe }

  useEffect(() => {
    const element = area.current
    if (!element) return

    let gesture: { x: number; y: number; at: number; axis: 'horizontal' | 'vertical' | null } | null =
      null

    /**
     * The record is moved by writing its style, not through React state.
     * A finger produces around sixty events per second and each one would
     * re-render the whole record — gallery included — to move it a few pixels.
     * This is direct manipulation: the only thing that changes is one transform.
     */
    function place(offset: number | null) {
      element!.style.transition = offset === null ? 'transform 180ms ease-out' : 'none'
      element!.style.transform = offset === null || offset === 0 ? '' : `translateX(${offset}px)`
    }

    /**
     * Opens a gesture, unless it starts somewhere that is not ours. `edges`
     * leaves the strips of the screen to the system's back gesture, which only
     * exists for a finger.
     */
    function begin(x: number, y: number, at: number, target: EventTarget | null, edges: boolean) {
      gesture = null
      // Over the gallery the gesture passes photographs, not artworks.
      if ((target as HTMLElement | null)?.closest('[data-swipe-ignore]')) return
      if (edges) {
        const box = element!.getBoundingClientRect()
        const from = x - box.left
        if (from < SYSTEM_EDGE || from > box.width - SYSTEM_EDGE) return
      }
      gesture = { x, y, at, axis: null }
    }

    /** Moves the record with the pointer. True when the gesture is ours. */
    function follow(x: number, y: number): boolean {
      if (!gesture) return false
      const dx = x - gesture.x
      const dy = y - gesture.y

      if (gesture.axis === null) {
        const axis = swipeAxis(dx, dy)
        if (axis === null) return false
        if (axis === 'vertical') {
          // Reading the record: the gesture is the page's, and it stays the
          // page's until the finger lifts.
          gesture = null
          return false
        }
        gesture.axis = axis
      }

      const neighbor = dx < 0 ? latest.current.hasNext : latest.current.hasPrevious
      place(dragOffset(dx, neighbor, element!.clientWidth))
      return true
    }

    /** Ends the gesture. True when it passed to another artwork. */
    function release(x: number, y: number, at: number): boolean {
      const started = gesture
      gesture = null
      // Back to its place, gliding: either the neighbor arrives and this element
      // is replaced, or the record has to look like it never moved.
      place(null)
      if (!started || started.axis !== 'horizontal') return false

      const decision = decideSwipe({
        dx: x - started.x,
        dy: y - started.y,
        elapsed: at - started.at,
        width: element!.clientWidth,
      })
      if (decision === null) return false
      const { hasPrevious: back, hasNext: forward, onSwipe: go } = latest.current
      if (decision === 'previous' ? !back : !forward) return false
      go(decision)
      return true
    }

    // ── The finger ──
    function touchStart(event: TouchEvent) {
      gesture = null
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch) return
      begin(touch.clientX, touch.clientY, event.timeStamp, event.target, true)
    }

    function touchMove(event: TouchEvent) {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch) return
      // Ours: the page must not scroll with it. This is why the listener is
      // registered non-passive.
      if (follow(touch.clientX, touch.clientY)) event.preventDefault()
    }

    function touchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0]
      if (!touch) {
        cancel()
        return
      }
      release(touch.clientX, touch.clientY, event.timeStamp)
    }

    // ── The mouse (and a pen) ──
    let captured: number | null = null
    let passed = false

    function pointerDown(event: PointerEvent) {
      // A finger has its own handlers above: they are the ones that can stop the
      // page from scrolling, which no pointer listener can.
      if (event.pointerType === 'touch' || event.button !== 0) return
      begin(event.clientX, event.clientY, event.timeStamp, event.target, false)
    }

    function pointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      if (!follow(event.clientX, event.clientY)) return
      if (captured === null) {
        captured = event.pointerId
        // The drag survives leaving the element, and it does not paint the
        // record blue as if the cataloger were selecting text.
        element!.setPointerCapture(event.pointerId)
        element!.style.userSelect = 'none'
      }
    }

    function pointerUp(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      loosen()
      passed = release(event.clientX, event.clientY, event.timeStamp)
    }

    /** A drag that ended on a button must not also press it. */
    function clickGuard(event: MouseEvent) {
      if (!passed) return
      passed = false
      event.preventDefault()
      event.stopPropagation()
    }

    function loosen() {
      if (captured === null) return
      element!.releasePointerCapture(captured)
      captured = null
      element!.style.userSelect = ''
    }

    function cancel() {
      gesture = null
      loosen()
      place(null)
    }

    element.addEventListener('touchstart', touchStart, { passive: true })
    element.addEventListener('touchmove', touchMove, { passive: false })
    element.addEventListener('touchend', touchEnd, { passive: true })
    element.addEventListener('touchcancel', cancel, { passive: true })
    element.addEventListener('pointerdown', pointerDown)
    element.addEventListener('pointermove', pointerMove)
    element.addEventListener('pointerup', pointerUp)
    element.addEventListener('pointercancel', cancel)
    element.addEventListener('click', clickGuard, true)
    return () => {
      element.removeEventListener('touchstart', touchStart)
      element.removeEventListener('touchmove', touchMove)
      element.removeEventListener('touchend', touchEnd)
      element.removeEventListener('touchcancel', cancel)
      element.removeEventListener('pointerdown', pointerDown)
      element.removeEventListener('pointermove', pointerMove)
      element.removeEventListener('pointerup', pointerUp)
      element.removeEventListener('pointercancel', cancel)
      element.removeEventListener('click', clickGuard, true)
    }
  }, [])

  return (
    <div
      ref={area}
      className={
        entering === 'next' ? 'enter-from-right' : entering === 'previous' ? 'enter-from-left' : ''
      }
    >
      {children}
    </div>
  )
}

function Badge({ active, text }: { active: boolean; text: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        active ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'
      }`}
    >
      {text}
    </span>
  )
}

function EditForm({
  artwork,
  onDone,
  onCancel,
}: {
  artwork: Artwork
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [data, setData] = useState(artwork)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Una recarga con el formulario tocado se lleva las correcciones (RNF-106).
   *
   * `draftDirty` y no `data !== artwork`: el estado se reemplaza en cada tecla, así que
   * comparar por identidad preguntaría también después de escribir y borrar una letra —
   * y un aviso que sale sobre un formulario intacto es el que se despacha sin leer.
   * Mientras guarda también, que ahí la recarga corta la escritura a medias.
   */
  useUnloadGuard(saving || draftDirty(data, artwork))
  // Controlled vocabulary for "Tipo de obra" (RF-213). Only editors reach
  // this form, so offering the add-to-catalog row is always legitimate here.
  const { types: artworkTypes, addType } = useArtworkTypes()
  // Series of THIS artwork's fund: each fund has its own vocabulary, and the
  // fund is immutable (RF-204), so the offered set never changes under the form.
  const { names: seriesNames, addSeries } = useSeries(artwork.artist)
  // The tree of places: the field is a chooser over it now, not free text
  // (ADR-006). Only editors reach this form, so offering to create a place is
  // always legitimate here.
  const { tree: placeTree, ensurePlace, addPlaceInside } = usePhysicalPlaces()

  function set<K extends keyof Artwork>(field: K, value: Artwork[K]) {
    setData((d) => ({ ...d, [field]: value }))
  }

  /**
   * RF-209: the authorship states split by whether a title is written, and
   * the database enforces it (artworks_attributed_title_matches_title).
   * Crossing the line moves the authorship to the pending state of the other
   * side and says so: a silent change would look like the form lost the datum.
   */
  const [authorshipHint, setAuthorshipHint] = useState<string | null>(null)

  function setTitle(value: string) {
    const blank = value.trim() === ''
    const current = data.attributed_title
    let attributed = current
    if (blank && (current === 'NO' || current === 'YES' || current === 'UNCONFIRMED')) {
      attributed = 'UNREVIEWED'
    }
    if (!blank && (current === 'UNREVIEWED' || current === 'NOT_APPLICABLE')) {
      attributed = 'UNCONFIRMED'
    }
    if (attributed !== current) {
      setAuthorshipHint(
        current === 'NOT_APPLICABLE'
          ? 'Constaba «No consta título» y ahora hay un título escrito: la autoría pasa a «Sin confirmar».'
          : blank
            ? 'El título ha quedado vacío: la autoría vuelve a «Sin revisar».'
            : 'Con título escrito, la autoría pasa a «Sin confirmar».',
      )
    }
    setData((d) => ({ ...d, title: value, attributed_title: attributed }))
  }

  const toNumber = (v: string) => {
    const clean = v.replace(',', '.').trim()
    if (clean === '') return null
    const n = Number(clean)
    return Number.isFinite(n) ? n : null
  }

  // Measures are edited as text and parsed on save. Parsing on every
  // keystroke made decimals untypeable — the trailing comma of "29," was
  // normalized away before the next digit arrived. Shown and typed the
  // Spanish way, with a comma.
  const toMeasureText = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const [measures, setMeasures] = useState({
    height: toMeasureText(artwork.height_cm),
    width: toMeasureText(artwork.width_cm),
    depth: toMeasureText(artwork.depth_cm),
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // catalog_id and artist are not sent: they are immutable (RF-204) and a
    // database trigger rejects the change. Not sending them avoids provoking
    // the error.
    const { error } = await supabase
      .from('artworks')
      .update({
        title: data.title.trim(),
        attributed_title: data.attributed_title,
        artwork_type: data.artwork_type.trim(),
        series: data.series.trim(),
        // execution_date is not sent: the database composes it (generated column).
        start_year: data.start_year,
        end_year: data.end_year,
        approximate_date: data.start_year != null && data.approximate_date,
        unconfirmed_date: data.start_year != null && data.unconfirmed_date,
        date_note: data.date_note.trim(),
        technique: data.technique.trim(),
        support: data.support.trim(),
        height_cm: toNumber(measures.height),
        width_cm: toNumber(measures.width),
        depth_cm: toNumber(measures.depth),
        signed: data.signed,
        signature_description: data.signature_description.trim(),
        dated_on_artwork: data.dated_on_artwork,
        conservation_status: data.conservation_status,
        existence_status: data.existence_status,
        physical_place_id: data.physical_place_id,
        measurements_verified: data.measurements_verified,
        inventory_phase_completed: data.inventory_phase_completed,
        documentation_phase_completed: data.documentation_phase_completed,
        catalog_record_complete: data.catalog_record_complete,
        inventory_process_notes: data.inventory_process_notes,
      })
      .eq('catalog_id', artwork.catalog_id)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    await onDone()
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {/* RF-308: the whole record enters edit mode at once, header included.
          The primary key is shown read-only (RF-204). */}
      <FieldGroup title="Identificación">
        <div>
          <label className="label">Código de catalogación</label>
          <input className="field bg-stone-100 text-stone-500" value={artwork.catalog_id} readOnly />
          <p className="mt-1 text-xs text-stone-500">
            No es editable: es la etiqueta pegada en la obra y el eje de las tablas relacionadas.
          </p>
        </div>

        <ComboBox
          id="e-type"
          label="Tipo de obra"
          value={data.artwork_type}
          onChange={(v) => set('artwork_type', v)}
          options={artworkTypes}
          placeholder="Busca en el catálogo de tipos"
          emptyLabel="Sin tipo (pendiente de revisar)"
          addLabel={(t) => `Añadir «${t}» al catálogo de tipos`}
          onAdd={addType}
        />

        {/* Same open vocabulary as the type, but one set PER FUND: the series
            name must be written identically every time or the catalog cannot
            group by it, and a series of another artist is not an option here.
            Empty is legitimate — not every piece belongs to a series. */}
        <ComboBox
          id="e-series"
          label="Serie"
          value={data.series}
          onChange={(v) => set('series', v)}
          options={seriesNames}
          placeholder="Busca en el catálogo de series"
          emptyLabel="Sin serie"
          addLabel={(t) => `Añadir «${t}» a las series de ${ARTIST_LABEL[artwork.artist]}`}
          onAdd={(name) => addSeries(name, artwork.artist)}
        />
      </FieldGroup>

      <FieldGroup title="Título">
        <div>
          <input
            id="e-title"
            aria-label="Título"
            className="field"
            value={data.title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-500">
            Déjalo vacío si no consta título: la ficha mostrará [Sin título].
          </p>
        </div>

        <div>
          {/* Only the states that apply to the current field are offered:
              with a blank title, pending or verified-untitled; with a written
              one, the three authorship answers about it. */}
          <OptionCards
            id="e-attributed"
            label="Autoría"
            options={(
              (data.title.trim() === ''
                ? ['UNREVIEWED', 'NOT_APPLICABLE']
                : ['NO', 'YES', 'UNCONFIRMED']) as AttributedTitleValue[]
            ).map((v) => ({
              value: v,
              text: ATTRIBUTED_TITLE_LABEL[v],
              description: ATTRIBUTED_TITLE_DESCRIPTION[v],
              Icon: AUTHORSHIP_ICON[v],
            }))}
            value={data.attributed_title}
            onChange={(v) => {
              setAuthorshipHint(null)
              set('attributed_title', v)
            }}
          />
          {authorshipHint && (
            <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              {authorshipHint}
            </p>
          )}
        </div>
      </FieldGroup>

      <FieldGroup title="Fecha de ejecución">
        <DateField data={data} set={set} />
      </FieldGroup>

      <FieldGroup title="Con la obra delante" hint="medidas, materia y firma">

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['e-height', 'Alto', 'height'],
              ['e-width', 'Ancho', 'width'],
              ['e-depth', 'Prof.', 'depth'],
            ] as const
          ).map(([id, label, key]) => (
            <div key={id}>
              <label className="label" htmlFor={id}>
                {label}
              </label>
              <div className="relative">
                <input
                  id={id}
                  className="field pr-9"
                  inputMode="decimal"
                  value={measures[key]}
                  onChange={(e) => setMeasures((m) => ({ ...m, [key]: e.target.value }))}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-stone-400"
                >
                  cm
                </span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="e-technique">
            Técnica
          </label>
          <input
            id="e-technique"
            className="field"
            value={data.technique}
            onChange={(e) => set('technique', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="e-support">
            Soporte
          </label>
          <input
            id="e-support"
            className="field"
            value={data.support}
            onChange={(e) => set('support', e.target.value)}
          />
        </div>

        <TriStateIcons
          id="e-signed"
          label="Firmada"
          value={data.signed}
          onChange={(v) => set('signed', v)}
        />

        {/* Describing the signature only makes sense when there is one. */}
        {data.signed === 'YES' && (
          <div>
            <label className="label" htmlFor="e-signature-desc">
              Descripción de la firma
            </label>
            <input
              id="e-signature-desc"
              className="field"
              value={data.signature_description}
              onChange={(e) => set('signature_description', e.target.value)}
              placeholder="ángulo inferior derecho, a lápiz"
            />
          </div>
        )}

        <TriStateIcons
          id="e-dated"
          label="Lleva fecha inscrita"
          value={data.dated_on_artwork}
          onChange={(v) => set('dated_on_artwork', v)}
        />
      </FieldGroup>

      <FieldGroup title="Conservación y localización">
        <Chips
          id="e-conservation"
          label="Estado de conservación"
          options={Object.entries(CONSERVATION_LABEL).map(([v, t]) => ({
            value: v as Artwork['conservation_status'],
            text: t,
          }))}
          value={data.conservation_status}
          onChange={(v) => set('conservation_status', v)}
        />

        <Chips
          id="e-existence"
          label="Estado de existencia"
          options={Object.entries(EXISTENCE_LABEL).map(([v, t]) => ({
            value: v as Artwork['existence_status'],
            text: t,
          }))}
          value={data.existence_status}
          onChange={(v) => set('existence_status', v)}
        />

        <PlacePicker
          id="e-location"
          label="Ubicación física"
          value={data.physical_place_id}
          tree={placeTree}
          onChange={(placeId) => set('physical_place_id', placeId)}
          ensurePlace={ensurePlace}
          addPlaceInside={addPlaceInside}
        />
      </FieldGroup>

      <FieldGroup title="Estado del proceso" hint="uso interno, no se publica">
        <Toggle
          label="Medidas verificadas físicamente"
          help="Solo si alguien del equipo las ha medido, no si vienen de un catálogo antiguo."
          active={data.measurements_verified}
          onChange={(v) => set('measurements_verified', v)}
        />
        <Toggle
          label="Fase 1 completada"
          help="Toma de datos con la obra delante."
          active={data.inventory_phase_completed}
          onChange={(v) => set('inventory_phase_completed', v)}
        />
        <Toggle
          label="Fase 2 completada"
          help="Documentación e investigación."
          active={data.documentation_phase_completed}
          onChange={(v) => set('documentation_phase_completed', v)}
        />
        <Toggle
          label="Ficha lista para publicar"
          help="Revisión editorial final. No se deduce de las dos fases anteriores."
          active={data.catalog_record_complete}
          onChange={(v) => set('catalog_record_complete', v)}
        />

        <div className="pt-2">
          <label className="label" htmlFor="e-notes">
            Notas del proceso
          </label>
          <textarea
            id="e-notes"
            className="field"
            rows={3}
            value={data.inventory_process_notes}
            onChange={(e) => set('inventory_process_notes', e.target.value)}
            placeholder="pendiente contactar con la familia para confirmar medidas"
          />
          <p className="mt-1 text-xs text-stone-500">
            Uso interno del equipo. No se publica en el catálogo.
          </p>
        </div>
      </FieldGroup>

      {/* Save and cancel always under the thumb: the form is long and the save
          error appears next to the button just pressed. */}
      <ActionBar
        notice={
          error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
              No se ha podido guardar: {error}
            </p>
          ) : null
        }
      >
        <button className="btn-primary min-h-[3.25rem] flex-1 text-base" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </ActionBar>
    </form>
  )
}

/**
 * Execution date over the structured fields (ADR-004), with the same controls
 * as the capture flow, and an escape hatch that ALSO structures:
 *
 * "Escribir a mano" parses what is typed. If it is one of the canonical
 * formats ("c.1975 - 1978", with the catalog variants), it fills the
 * structured fields and no note remains: typing it and composing it with
 * buttons yield the same record. Only the unparseable ("finales de los
 * setenta") is kept as a note — it is what gets published — and even then the
 * first plausible year is rescued so the artwork does not vanish from period
 * searches.
 */
function DateField({
  data,
  set,
}: {
  data: Artwork
  set: <K extends keyof Artwork>(field: K, value: Artwork[K]) => void
}) {
  const [range, setRange] = useState(() => data.end_year != null)
  const [byHand, setByHand] = useState(() => data.date_note !== '')
  const [draft, setDraft] = useState(() => data.date_note || data.execution_date)

  const structure = {
    year: data.start_year,
    endYear: range ? data.end_year : null,
    approximate: data.approximate_date,
    unconfirmed: data.unconfirmed_date,
  }

  function applyManual() {
    const { date, note } = parseManualDate(draft)
    set('start_year', date.year)
    set('end_year', date.endYear)
    set('approximate_date', date.approximate)
    set('unconfirmed_date', date.unconfirmed)
    set('date_note', note)
    setRange(date.endYear != null)
    // If the text was canonical, it is already structured: back to the buttons.
    if (note === '') setByHand(false)
  }

  if (byHand) {
    const { date, note } = parseManualDate(draft)
    return (
      <div>
        <label className="label" htmlFor="e-date">
          Fecha, escrita a mano
        </label>
        <div className="flex gap-2">
          <input
            id="e-date"
            className="field flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={applyManual}
            placeholder="1978 · c. 1975-1978 · finales de los setenta"
          />
          <button type="button" className="btn-secondary shrink-0" onClick={applyManual}>
            Aplicar
          </button>
        </div>
        {/* The parse result is anticipated BEFORE applying: knowing whether
            what was typed will be structured or kept as a note avoids
            surprises. */}
        <p aria-live="polite" className="mt-1 text-xs text-stone-500">
          {draft.trim() === '' ? (
            'Vacío: obra sin fechar.'
          ) : note === '' ? (
            <>Se reconoce como «{composeDate(date)}» y se guardará estructurada.</>
          ) : date.year != null ? (
            <>Se guardará tal cual, y se encontrará al buscar por {date.year}.</>
          ) : (
            'Se guardará tal cual. Sin ningún año, no aparecerá en las búsquedas por época.'
          )}
        </p>
        <button
          type="button"
          className="mt-1 text-xs text-stone-600 underline"
          onClick={() => {
            applyManual()
            setByHand(false)
          }}
        >
          Volver a los botones
        </button>
      </div>
    )
  }

  function put(changes: {
    year?: number | null
    endYear?: number | null
    approximate?: boolean
    unconfirmed?: boolean
  }) {
    if ('year' in changes) set('start_year', changes.year ?? null)
    if ('endYear' in changes) set('end_year', changes.endYear ?? null)
    if ('approximate' in changes) set('approximate_date', changes.approximate ?? false)
    if ('unconfirmed' in changes) set('unconfirmed_date', changes.unconfirmed ?? false)
  }

  return (
    <div className="space-y-3">
      {range ? (
        /* Both years of the range on the same line: they are one datum. */
        <div className="grid grid-cols-2 gap-2">
          <YearStepper
            id="e-year"
            label="Año inicial"
            compact
            value={structure.year}
            min={MIN_YEAR}
            max={maxYear()}
            onChange={(year) => put({ year })}
          />
          <YearStepper
            id="e-end-year"
            label="Año final"
            compact
            value={structure.endYear}
            min={MIN_YEAR}
            max={maxYear()}
            onChange={(endYear) => put({ endYear })}
          />
        </div>
      ) : (
        <YearStepper
          id="e-year"
          label="Año"
          value={structure.year}
          min={MIN_YEAR}
          max={maxYear()}
          onChange={(year) => put({ year })}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <ToggleChip
          label="Aproximada"
          active={structure.approximate}
          onChange={(v) => put({ approximate: v })}
        />
        <ToggleChip
          label="Rango"
          active={range}
          onChange={(v) => {
            setRange(v)
            if (v && structure.year != null && data.end_year == null) {
              put({ endYear: adjustYear(structure.year, 1) })
            }
            if (!v) put({ endYear: null })
          }}
        />
        <ToggleChip
          label="Sin confirmar"
          active={structure.unconfirmed}
          onChange={(v) => put({ unconfirmed: v })}
        />
      </div>

      <p className="text-xs text-stone-500">
        «Aproximada»: de alrededor de ese año (c.). «Sin confirmar»: se desconoce; el año es una
        estimación ([?]).
      </p>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2">
        <span id="date-preview" aria-live="polite" className="text-sm">
          {structure.year == null ? (
            <span className="text-stone-500">Sin fechar</span>
          ) : (
            <>
              Se guardará como <span className="font-medium">{composeDate(structure)}</span>
            </>
          )}
        </span>
        <button
          type="button"
          className="shrink-0 text-xs text-stone-600 underline"
          onClick={() => {
            setDraft(composeDate(structure))
            setByHand(true)
          }}
        >
          Escribir a mano
        </button>
      </div>
    </div>
  )
}
