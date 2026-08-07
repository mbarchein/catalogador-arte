import { useEffect, useState } from 'react'
import { Link, Navigate, useMatch, useNavigate, useParams } from 'react-router'
import { useAuth, useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ActionBar, LoadingNotice } from '../../components/ui'
import { draftDirty } from '../../components/formDirty'
import { useUnloadGuard } from '../../components/useUnloadGuard'
import { displayExhibitionDates } from '../documentary/documentaryFormat'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  catalogueText,
  exhibitionKindPending,
  exhibitionKindText,
  exhibitionVenueLine,
  exhibitionVenueNote,
} from '../documentary/exhibitions/exhibitionHistory'
import { canWriteBlock } from '../documentary/sections'
import { ExhibitionForm } from './ExhibitionForm'
import { ParticipatingArtworks } from './ParticipatingArtworks'
import { exhibitionDraft, type ExhibitionDraft } from './exhibitionDraft'
import { retireConfirmText } from './exhibitionMessages'
import { activeParticipantCount } from './participatingArtworks'
import { useExhibition } from './useExhibition'
import { useExhibitionArtworks } from './useExhibitionArtworks'
import { useReferences } from '../bibliography/useReferences'
import { CatalogueReferenceSheet } from './CatalogueReferenceSheet'
import {
  catalogueReferenceHint,
  catalogueReferenceLine,
  catalogueReferenceNotice,
} from './catalogueReference'

/**
 * The record of one exhibition (RF-309, RF-501, RF-502, RF-505).
 *
 * ── THE RULE THAT ORDERS EVERY SCREEN OF THIS PROJECT ─────────
 *
 * **The record that is read is read-only. Writing lives in the edit zone.** The
 * body below takes a `writable` prop that defaults to FALSE — the safe side of
 * forgetting — and combines it with the permission through `canWriteBlock`:
 * neither of the two is enough on its own. `writable` is the MODE, true only under
 * `/exhibitions/:id/edit`; `canEdit` is the PERMISSION, and somebody who only
 * consults never writes whatever the address says. The one exception is the
 * action that does not modify: the links to each participating artwork stay in the
 * view.
 *
 * Editing is a ROUTE and not local state, for the same three reasons the artwork
 * record gives: it survives a reload, it can be sent as a link, and the phone's
 * back button leaves the form instead of leaving the record.
 */
export function ExhibitionPage() {
  const { id = '' } = useParams()
  const { canEdit } = useAuth()
  // El permiso para la ZONA DE EDICIÓN se pregunta con su tercera respuesta, no con
  // `canEdit` a secas: el rol llega DESPUÉS de la sesión, así que decidir en el
  // primer render echa de aquí a la catalogadora a la que esta pantalla pertenece —
  // y solo al recargar su dirección, que es por lo que este fallo sobrevive a las
  // revisiones. Es el mismo que la ficha de obra ya pagó dos veces. La ficha que se
  // LEE no usa esto y no espera a nada: no depende del rol.
  const editAccess = useEditingAccess()
  const navigate = useNavigate()
  // La edición vive en la ruta, no en un estado local. Ver la cabecera.
  const editing = useMatch('/exhibitions/:id/edit') !== null

  const { exhibition, loading, error, saving, save, setActive, setCatalogueReference } =
    useExhibition(id)
  const artworks = useExhibitionArtworks(id)

  if (loading && exhibition === null) return <LoadingNotice>Cargando la exposición…</LoadingNotice>

  // Nunca una página en blanco: una dirección que no existe lo dice y ofrece la
  // salida, en vez de dejar una pantalla vacía que parece un fallo de la red.
  if (exhibition === null) {
    return (
      <Layout title="Exposición" back="/exhibitions">
        <p role="alert" className="card text-sm text-stone-700">
          {error ?? 'Esa exposición no está en el catálogo.'}
        </p>
      </Layout>
    )
  }

  // Llegar a /edit por dirección sin permiso vuelve a la vista, como en la ficha
  // de obra: no es un error de la usuaria, es una dirección que no le corresponde.
  // Pero primero hay que SABERLO: mientras el rol no ha llegado no se decide, porque
  // «todavía no se sabe» no es «no».
  if (editing && editAccess === 'loading') return <LoadingNotice />
  if (editing && editAccess === 'denied') {
    return <Navigate to={`/exhibitions/${id}`} replace />
  }

  return (
    <Layout
      title={exhibition.title.trim()}
      back="/exhibitions"
      action={
        canEdit && !editing ? (
          <button
            type="button"
            className="flex min-h-[2.5rem] items-center rounded-lg bg-stone-800 px-2.5 text-sm font-medium text-white"
            onClick={() => navigate(`/exhibitions/${id}/edit`)}
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

      <ExhibitionRecord
        exhibition={exhibition}
        writable={editing}
        saving={saving}
        artworkCount={activeParticipantCount(artworks.rows)}
        onSave={save}
        onSetActive={setActive}
        onLeaveEditing={() => navigate(`/exhibitions/${id}`)}
      />

      {/* RF-503: cuál de las referencias de la bibliografía es su catálogo. Va como
          sección propia y no como campo del formulario, por lo que razona
          `catalogueReference.ts`: la base la ata a «¿se publicó catálogo?», se elige en
          vez de escribirse, y quitarla tiene sentido propio. Se LEE siempre —también
          quien solo consulta— y se toca solo con permiso. */}
      <CatalogueSection exhibition={exhibition} onSave={setCatalogueReference} />

      <ParticipatingArtworks
        rows={artworks.rows}
        thumbnails={artworks.thumbnails}
        loading={artworks.loading}
        error={artworks.error}
        cataloguePublished={exhibition.catalogue_published === 'YES'}
      />
    </Layout>
  )
}

/**
 * The body of the record: the eight fields, read or written.
 *
 * `writable = false` by omission, which is the whole point of the default: a
 * caller that mounts this and says nothing gets a record that cannot be changed.
 * Combined with the permission through `canWriteBlock`, because neither the mode
 * nor the role is enough alone — both mistakes have happened in this project,
 * which is why the rule is a named function and not an inline `&&`.
 */
function ExhibitionRecord({
  exhibition,
  writable = false,
  saving,
  artworkCount,
  onSave,
  onSetActive,
  onLeaveEditing,
}: {
  exhibition: ExhibitionRow
  writable?: boolean
  saving: boolean
  /** Live participations, for the retirement to say what it takes with it. */
  artworkCount: number
  onSave: (draft: ExhibitionDraft) => Promise<string | null>
  onSetActive: (active: boolean) => Promise<string | null>
  onLeaveEditing: () => void
}) {
  const { canEdit } = useAuth()
  const canWrite = canWriteBlock(writable, canEdit)

  const [draft, setDraft] = useState<ExhibitionDraft>(() => exhibitionDraft(exhibition))
  const [failure, setFailure] = useState<string | null>(null)
  // Mismo caso que el formulario de una obra: recargar con algo corregido lo tira.
  useUnloadGuard(saving || draftDirty(draft, exhibitionDraft(exhibition)))
  const [confirmingRetire, setConfirmingRetire] = useState(false)

  // El borrador se rehace cuando cambia la ficha guardada —al entrar en edición,
  // y después de guardar, cuando la base ha derivado el año de la fecha— y NO en
  // cada render: sobrescribir un formulario a medio escribir con datos que
  // llegaron por detrás es el fallo que la ficha de obra ya documentó una vez.
  useEffect(() => {
    setDraft(exhibitionDraft(exhibition))
    setFailure(null)
  }, [exhibition])

  if (!canWrite) {
    return <ExhibitionReadOnly exhibition={exhibition} />
  }

  async function saveDraft() {
    const message = await onSave(draft)
    if (message !== null) {
      setFailure(message)
      return
    }
    onLeaveEditing()
  }

  return (
    <>
      <ExhibitionForm
        draft={draft}
        onChange={setDraft}
        embeddedVenue={exhibition.venue}
        disabled={saving}
      />

      {/* La papelera va DENTRO del modo edición y al final, no en la cabecera de
          la vista: retirar una ficha es escribir, y la regla del proyecto es que
          leer no cambia nada. */}
      <section className="mt-4">
        {exhibition.active ? (
          confirmingRetire ? (
            <div className="card border-red-200 bg-red-50">
              {/* Dos toques, y el primero DICE cuántas obras la sostienen: el
                  esquema permite retirar una exposición con participaciones —está
                  medido— y lo que pasa entonces es que desaparece de sus
                  historiales (RF-905). Un «¿Retirar?» a secas es cómo se va una
                  mañana de trabajo en un toque. */}
              <p className="text-sm text-red-900">
                {retireConfirmText(exhibition.title, artworkCount)}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn min-h-touch bg-red-700 text-white"
                  disabled={saving}
                  onClick={() =>
                    void onSetActive(false).then((message) => {
                      setConfirmingRetire(false)
                      if (message !== null) setFailure(message)
                    })
                  }
                >
                  Sí, retirar
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => setConfirmingRetire(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn min-h-touch w-full border border-red-300 bg-white text-sm text-red-800"
              disabled={saving}
              onClick={() => setConfirmingRetire(true)}
            >
              Retirar esta exposición
            </button>
          )
        ) : (
          <div className="card">
            <p className="text-sm text-stone-700">
              Esta exposición está retirada del catálogo: no aparece en las búsquedas ni en el
              historial expositivo de ninguna obra. No se ha borrado nada.
            </p>
            <button
              type="button"
              className="btn-secondary mt-2 w-full"
              disabled={saving}
              onClick={() =>
                void onSetActive(true).then((message) => {
                  if (message !== null) setFailure(message)
                })
              }
            >
              Recuperar
            </button>
          </div>
        )}
      </section>

      <ActionBar
        notice={
          failure !== null ? (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
              {failure}
            </p>
          ) : undefined
        }
      >
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={saving}
          onClick={() => void saveDraft()}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onLeaveEditing}>
          Cancelar
        </button>
      </ActionBar>
    </>
  )
}

/**
 * The record as it is read (RF-502, RF-503, RF-512).
 *
 * Every sentence here comes from `documentary/exhibitions/exhibitionHistory.ts` and
 * `documentaryFormat.ts` — the same functions the exhibition history of an artwork
 * uses. Not out of thrift: an exhibition has to read the SAME on its own screen as
 * inside the history of a piece, or the cataloger is reading two dialects of one
 * catalogue. This component only arranges them.
 */
function ExhibitionReadOnly({ exhibition }: { exhibition: ExhibitionRow }) {
  const venueNote = exhibitionVenueNote(exhibition)

  return (
    <div className="card space-y-3">
      {!exhibition.active && (
        <p className="rounded-lg bg-stone-100 p-2 text-sm text-stone-700">
          Esta exposición está retirada del catálogo. Se muestra porque nada se borra; para
          recuperarla, entra en «Editar».
        </p>
      )}

      {/* El orden de RF-502: cuándo, qué y dónde. */}
      <p className="text-sm text-stone-600">{displayExhibitionDates(exhibition)}</p>
      <p className="break-words text-lg font-medium italic">{exhibition.title.trim()}</p>

      <div>
        <p className="break-words text-sm">{exhibitionVenueLine(exhibition)}</p>
        {/* La transcripción literal de la fuente se conserva junto a la ficha que
            alguien identificó después: tirarla sería descartar un dato. */}
        {venueNote !== null && <p className="text-xs text-stone-500">«{venueNote}»</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            exhibitionKindPending(exhibition.exhibition_type)
              ? 'bg-amber-50 text-amber-900'
              : 'bg-stone-100 text-stone-700'
          }`}
        >
          {exhibitionKindText(exhibition.exhibition_type)}
        </span>
        {/* Tres respuestas y no dos: que no conste catálogo no es que no lo
            hubiera, y la diferencia es una mañana de biblioteca (RF-503). */}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            exhibition.catalogue_published === 'UNREVIEWED'
              ? 'bg-amber-50 text-amber-900'
              : 'bg-stone-100 text-stone-700'
          }`}
        >
          {catalogueText(exhibition)}
        </span>
      </div>

      {exhibition.note.trim() !== '' && (
        <div>
          <h2 className="text-sm font-semibold">Nota de la muestra</h2>
          <p className="whitespace-pre-line break-words text-sm text-stone-700">
            {exhibition.note.trim()}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * «El catálogo de la muestra», leído y —con permiso— elegido (RF-503, RF-506).
 *
 * Las cuatro respuestas las compone `catalogueReferenceLine`, y la que importa es la
 * cuarta: «publicó catálogo y todavía no consta cuál» no es un error ni un hueco, es lo
 * que hay que hacer. Cuando consta, la referencia se nombra Y SE ENLAZA a su ficha, que
 * es la mitad que el plan de pruebas echaba de menos: «la ficha de exposición dice si hubo
 * catálogo pero no nombra la referencia que lo es ni enlaza con ella».
 *
 * La bibliografía entera se carga solo al abrir el panel: esta pantalla se abre muchas
 * veces para leer una muestra, y el catálogo de referencias solo lo necesita quien va a
 * elegir. Es la misma decisión que el bloque de documentación de una obra.
 */
function CatalogueSection({
  exhibition,
  onSave,
}: {
  exhibition: ExhibitionRow
  onSave: (referenceId: string | null) => Promise<string | null>
}) {
  const { canEdit } = useAuth()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Se pide solo con el panel abierto, y también para LEER el título de la referencia
  // que consta: sin ella no se puede nombrar. Con `catalogue_reference_id` nulo no hace
  // falta pedir nada.
  const needed = open || exhibition.catalogue_reference_id !== null
  const { references, loading, error } = useReferences(needed)

  const reference =
    exhibition.catalogue_reference_id === null
      ? null
      : (references.find((row) => row.id === exhibition.catalogue_reference_id) ?? null)
  // La columna apunta a una referencia que no ha llegado: retirada más allá de lo que
  // esta sesión alcanza, o escondida por una política. Se dice, en vez de leerse como
  // «no consta cuál es».
  const unreadable =
    exhibition.catalogue_reference_id !== null && !loading && error === null && reference === null

  return (
    <section className="card mt-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">
        El catálogo de la muestra
      </h2>
      <p className="mt-1 text-sm text-stone-700">
        {catalogueReferenceLine({
          cataloguePublished: exhibition.catalogue_published,
          reference,
          unreadable,
        })}
      </p>

      {reference !== null && (
        <p className="mt-1">
          <Link to={`/bibliography/${reference.id}`} className="text-sm underline">
            Abrir su ficha en la bibliografía
          </Link>
          <span className="mt-0.5 block break-words text-xs text-stone-500">
            {catalogueReferenceHint(reference)}
          </span>
        </p>
      )}

      {notice !== null && (
        <p role="status" className="mt-2 rounded-lg bg-stone-100 p-2 text-xs text-stone-700">
          {notice}
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setOpen(true)
          }}
          className="mt-2 min-h-touch text-sm text-stone-600 underline"
        >
          {exhibition.catalogue_reference_id === null
            ? 'Decir cuál es su catálogo'
            : 'Cambiar cuál es su catálogo'}
        </button>
      )}

      {open && (
        <CatalogueReferenceSheet
          cataloguePublished={exhibition.catalogue_published}
          current={exhibition.catalogue_reference_id}
          references={references}
          loading={loading}
          loadError={error}
          onSave={async (referenceId) => {
            const problem = await onSave(referenceId)
            if (problem === null) {
              setNotice(
                catalogueReferenceNotice(
                  referenceId === null ? { action: 'clear' } : { action: 'set', referenceId },
                  references.find((row) => row.id === referenceId)?.title ?? '',
                ),
              )
            }
            return problem
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}
