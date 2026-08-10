import { useEffect, useState } from 'react'
import { useAutoClear } from '../../components/useAutoClear'
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
import { ExhibitionDocuments } from './ExhibitionDocuments'
import { useExhibitionDocuments } from '../documentary/useDocumentary'
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
  offersCatalogueChoice,
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
  // The permission for the EDITING AREA is asked about with its third answer, not with
  // a bare `canEdit`: the role arrives AFTER the session, so deciding on the
  // first render throws out of here the cataloguer this screen belongs to —
  // and only on reloading its address, which is why this failure survives the
  // reviews. It is the same one the artwork record already paid for twice. The record that is
  // READ does not use this and waits for nothing: it does not depend on the role.
  const editAccess = useEditingAccess()
  const navigate = useNavigate()
  // Editing lives in the route, not in local state. See the heading.
  const editing = useMatch('/exhibitions/:id/edit') !== null

  const { exhibition, loading, error, saving, save, setActive, setCatalogueReference } =
    useExhibition(id)
  const artworks = useExhibitionArtworks(id)
  const documents = useExhibitionDocuments(id)

  if (loading && exhibition === null) return <LoadingNotice>Cargando la exposición…</LoadingNotice>

  // Never a blank page: an address that does not exist says so and offers the way
  // out, instead of leaving an empty screen that looks like a network failure.
  if (exhibition === null) {
    return (
      <Layout title="Exposición" back="/exhibitions">
        <p role="alert" className="card text-sm text-stone-700">
          {error ?? 'Esa exposición no está en el catálogo.'}
        </p>
      </Layout>
    )
  }

  // Reaching /edit by address without permission returns to the view, as in the artwork
  // record: it is not a mistake of the user's, it is an address that is not theirs.
  // But first it has to be KNOWN: while the role has not arrived nothing is decided, because
  // «not known yet» is not «no».
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

      {/* RF-516: las notas de prensa, los carteles y los dípticos que hablan de esta
          muestra. El vínculo ya existía y se creaba desde la ficha del documento; lo que
          faltaba era que la exposición lo enseñara, así que una nota de prensa enlazada
          no aparecía en ninguna parte de la muestra. Se LEE siempre y se toca con
          permiso, como el bloque del catálogo. */}
      <ExhibitionDocuments
        exhibitionId={exhibition.id}
        rows={documents.rows}
        loading={documents.loading}
        error={documents.error}
        onReload={documents.reload}
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
  // Same case as an artwork's form: reloading with something corrected throws it away.
  useUnloadGuard(saving || draftDirty(draft, exhibitionDraft(exhibition)))
  const [confirmingRetire, setConfirmingRetire] = useState(false)

  // The draft is rebuilt when the stored record changes —on entering editing,
  // and after saving, when the base has derived the year from the date— and NOT on
  // every render: overwriting a half-written form with data that
  // arrived from behind is the failure the artwork record already documented once.
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
              Retirada del catálogo: no sale en búsquedas ni en el historial de ninguna obra.
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
          Esta exposición está retirada del catálogo. Para recuperarla, entra en «Editar».
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
 * «Catálogo de la exposición», read and —with permission— chosen (RF-503, RF-506).
 *
 * The four answers are composed by `catalogueReferenceLine`, and the one that matters is the
 * fourth: «it published a catalogue and it is not yet recorded which» is neither an error nor a gap, it is what
 * has to be done. When it is recorded, the reference is named AND LINKED to its record, which
 * is the half the test plan was missing: «the exhibition record says whether there was a
 * catalogue but does not name the reference that is it nor link to it».
 *
 * The whole bibliography is loaded only on opening the panel: this screen is opened many
 * times to read a show, and the reference catalogue is only needed by whoever is going to
 * choose. It is the same decision as an artwork's documentation block.
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
  // It confirms something that already happened, so it leaves on its own: see `useAutoClear`.
  useAutoClear(notice, () => setNotice(null))
  // It is asked for only with the panel open, and also to READ the title of the reference
  // that is recorded: without it it cannot be named. With `catalogue_reference_id` null nothing
  // needs asking for.
  const needed = open || exhibition.catalogue_reference_id !== null
  const { references, loading, error } = useReferences(needed)

  const reference =
    exhibition.catalogue_reference_id === null
      ? null
      : (references.find((row) => row.id === exhibition.catalogue_reference_id) ?? null)
  // The column points to a reference that has not arrived: withdrawn beyond what
  // this session reaches, or hidden by a policy. It is said, instead of reading as
  // «it is not recorded which it is».
  const unreadable =
    exhibition.catalogue_reference_id !== null && !loading && error === null && reference === null

  return (
    <section className="card mt-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">
        Catálogo de la exposición
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

      {canEdit && offersCatalogueChoice(exhibition.catalogue_published) && (
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
