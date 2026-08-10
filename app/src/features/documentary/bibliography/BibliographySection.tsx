import { useMemo, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { PenIcon, PlusIcon } from '../../../components/ui'
import type { ResearchStatus } from '../../../lib/types'
import { DocumentarySection } from '../DocumentarySection'
import type { ReferenceRow } from '../documentaryRows'
import { blockState } from '../researchState'
import { sectionSpec, canWriteBlock } from '../sections'
import { useArtworkBibliography, type ArtworkDocumentaryQuery } from '../useDocumentary'
import {
  bibliographyBlockState,
  bibliographyLoadState,
  citeBlockedReason,
} from './bibliographyBlock'
import { citationEdit, type CitationEdit, type CitationView } from './citationFormat'
import { citationList } from './citationGroups'
import { CitationSheet } from './CitationSheet'
import { ReferenceSheet } from './ReferenceSheet'
import { ResearchStatusSheet } from './ResearchStatusSheet'
import { useBibliographyEdits } from './useBibliographyEdits'
import { useReferenceUsage } from './useReferenceUsage'

/**
 * «Bibliografía» on the artwork record (RF-303, RF-504): where this artwork is
 * published, and on which page.
 *
 * The block answers one question — «¿esto está publicado en algún sitio?» — and
 * it has to answer it with a thumb, standing up, with the artwork in front. So
 * every row leads with the title, carries who and when underneath, and ends in
 * the page, which is the part that gets used; and the list splits by kind of
 * publication only when splitting earns its headings (`citationList`).
 *
 * What an EMPTY block says is decided in the foundations and not here
 * (`blockState`), because it is the same rule in five blocks and the one that
 * must never be written twice: an artwork with no bibliography recorded is not an
 * unpublished artwork, and only the research status of RF-218 tells the two
 * apart.
 *
 * **The block writes TWO different scopes and the screen has to keep them
 * apart.** The page where this artwork appears, the note and the retirement of a
 * citation are facts about this record. The reference itself — its title, who
 * wrote it, its year — is a row of the catalogue that every citing artwork reads,
 * so correcting it from here changes what the other records show: it gets its own
 * panel, its own label on the row, and a warning above its fields
 * (`referenceEdit.ts`). Until the reference has a record of its own (RF-309) this
 * is the only place a mistake in it can be fixed, and it is where it is read.
 *
 * Nothing on this file decides any wording. Order, grouping, abbreviations,
 * duplicates and what is missing before saving all live in the pure modules
 * beside it, which is where the battery reaches them — it runs in node and cannot
 * open a component.
 */
export function BibliographySection({
  catalogId,
  documentary,
  writable = false,
}: {
  catalogId: string
  /**
   * The documentary columns of the artwork, loaded ONCE for the five blocks by
   * `useArtworkDocumentary` and handed down. They are one row: a query per block
   * would be five requests for the same row, and the four research statuses are
   * read by every heading.
   */
  documentary: ArtworkDocumentaryQuery
  /**
   * Whether this block can write. False in the record's view and true only
   * in the editing area. False by default: a new block that forgets to
   * pass it is born read-only, which is the safe side of forgetting.
   */
  writable?: boolean
}) {
  const spec = sectionSpec('bibliography')
  const { canEdit } = useAuth()
  // RF-308: **writing lives in the editing area and not in the view.** The record that
  // is read is read-only, so no control of this block offers to change
  // a datum unless the page says it is editing. `canWrite` is still
  // necessary —the permission rules over the mode— but it is no longer sufficient.
  const canWrite = canWriteBlock(writable, canEdit)
  const { rows, loading, error, reload } = useArtworkBibliography(catalogId)
  const edits = useBibliographyEdits(catalogId, canWrite)

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CitationEdit | null>(null)
  // The reference being CORRECTED, which is a different scope from `editing`: that
  // one is the page of this artwork, this one is the publication the whole
  // catalogue shares. Kept whole, straight out of the citation row, so opening the
  // panel costs no query.
  const [correcting, setCorrecting] = useState<ReferenceRow | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // How many OTHER artworks read the reference about to be corrected. Asked only
  // while that panel is open, and only for its reference: it is what turns «lo
  // verán las demás obras» into a number the cataloger can decide with.
  const usage = useReferenceUsage(correcting?.id ?? null, catalogId, correcting !== null)

  const status = documentary.documentary?.bibliography_status ?? null
  // TWO queries, and the combination that matters is «citations yes, research
  // state no»: an empty block would then read as «esta obra es inédita», which is
  // the one sentence this feature exists to prevent. Decided in
  // `bibliographyBlock.ts`, where the battery reaches it.
  const load = bibliographyLoadState({
    rowsLoading: loading,
    rowsError: error,
    status,
    statusLoading: documentary.loading,
    statusError: documentary.error,
  })
  const state = bibliographyBlockState(
    blockState(spec, status, rows.length),
    load.statusUnknownNotice,
  )
  const blockedReason = citeBlockedReason(status)
  const list = useMemo(() => citationList(rows), [rows])

  async function afterWrite(failure: string | null) {
    setActionError(failure)
    // These rows are not live (`useLiveChanges` knows `artworks` and `images`
    // only), so every write ends here: what is on screen has to come back from
    // the database and not from what this component believes it just did.
    if (failure === null) await reload()
  }

  async function remove(id: string) {
    setRemoving(null)
    // Logical deletion (RF-901): the citation leaves the record, the reference
    // stays — it is shared with every other artwork that cites it.
    await afterWrite(await edits.setCitationActive(id, false))
  }

  /** Declaring the state of the research (RF-218). The shared hook reloads the row itself. */
  const setStatus = (value: ResearchStatus) =>
    documentary.setResearchStatus('bibliography_status', value)

  /**
   * The two panels hang from `actions` and NOT from the rows, and that is not
   * cosmetic: `DocumentarySection` paints its children only when the block holds
   * something, and the empty block is exactly when the first citation gets added.
   */
  const sheets = (
    <>
      {(adding || editing !== null) && (
        <CitationSheet
          // Remounted per opening: the draft of a panel closed halfway must not
          // come back when the next one opens.
          key={editing?.id ?? 'add'}
          open
          onClose={() => {
            setAdding(false)
            setEditing(null)
            // Also on «Cancelar»: the panel can create a REFERENCE and then be
            // abandoned before citing, and the sheet closes itself only after a
            // write that succeeded.
            void afterWrite(null)
          }}
          catalogId={catalogId}
          citations={rows}
          references={edits.references}
          publicationTypes={edits.publicationTypes}
          editing={editing}
          onCite={edits.cite}
          onUpdate={edits.updateCitation}
          onCreateReference={edits.createReference}
        />
      )}

      {correcting !== null && (
        <ReferenceSheet
          // Remounted per opening, for the same reason as the citation panel: a
          // draft abandoned halfway must not come back on the next reference.
          key={correcting.id}
          open
          onClose={() => setCorrecting(null)}
          reference={correcting}
          publicationTypes={edits.publicationTypes}
          otherArtworks={usage.otherArtworks}
          onSave={async (draft) => {
            const failure = await edits.updateReference(correcting.id, draft)
            // Reloaded on success only, and the refusal is answered to the panel
            // instead of to the block: the fields the cataloger has typed are in
            // there, and the sentence has to be read next to them.
            if (failure === null) await reload()
            return failure
          }}
        />
      )}

      {statusOpen && status !== null && (
        <ResearchStatusSheet
          open
          onClose={() => setStatusOpen(false)}
          current={status}
          count={rows.length}
          onChoose={setStatus}
        />
      )}
    </>
  )

  return (
    <DocumentarySection
      spec={spec}
      state={state}
      loading={load.loading}
      error={load.error}
      actions={
        canWrite ? (
          <div className="space-y-2">
            {actionError !== null && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {actionError}
              </p>
            )}
            {blockedReason !== null ? (
              /* The base would reject the citation (RF-218), so it is said here and not
                 after a round trip: the button below changes the
                 state, which is what has to be done first. */
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blockedReason}</p>
            ) : edits.error !== null ? (
              /* Citing is disabled and the reason is said: without the reference
                 catalogue there is no way of knowing whether the one about to be written already
                 exists, and two rows for the same book split the catalogue's citations
                 in two forever. */
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                No se ha podido cargar el catálogo de referencias, así que no se puede citar. Inténtalo donde haya cobertura. ({edits.error})
              </p>
            ) : (
              <button
                type="button"
                disabled={edits.loading}
                onClick={() => {
                  setActionError(null)
                  setAdding(true)
                }}
                className="btn-secondary flex w-full items-center justify-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                <span>
                  {edits.loading
                    ? 'Cargando el catálogo de referencias…'
                    : 'Citar esta obra en una referencia'}
                </span>
              </button>
            )}
            {status !== null && (
              <button
                type="button"
                onClick={() => setStatusOpen(true)}
                className="min-h-touch w-full text-left text-sm text-stone-600 underline"
              >
                Investigación bibliográfica: {state.statusLabel}
              </button>
            )}
            {sheets}
          </div>
        ) : null
      }
    >
      {list.groups.map((group) => (
        <div key={group.key} className={list.grouped ? 'mb-3 last:mb-0' : ''}>
          {group.title !== null && (
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {group.title}
            </h3>
          )}
          <ul>
            {group.views.map((view) => (
              <CitationItem
                key={view.id}
                view={view}
                showType={!list.grouped}
                canEdit={canWrite}
                confirming={removing === view.id}
                onEdit={() => {
                  setActionError(null)
                  const row = rows.find((r) => r.id === view.id)
                  if (row !== undefined) setEditing(citationEdit(row))
                }}
                onCorrectReference={() => {
                  setActionError(null)
                  const reference = rows.find((r) => r.id === view.id)?.reference ?? null
                  // Null only when the reference cannot be read, which is a
                  // Reader's record and never this one: the button is not painted
                  // in that case (see `CitationItem`), and it is checked again
                  // here rather than asserted.
                  if (reference !== null) setCorrecting(reference)
                }}
                onAskRemove={() => setRemoving(view.id)}
                onCancelRemove={() => setRemoving(null)}
                onRemove={() => void remove(view.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </DocumentarySection>
  )
}

/**
 * One citation: the reference read at a glance and the page underneath.
 *
 * The title leads because it is what identifies a publication in a list of four;
 * the page is a chip and not another grey line because it is the only part of the
 * row that gets copied into somebody else's text, and it is dimmed — never
 * omitted — when nobody has written it down (RF-304).
 */
function CitationItem({
  view,
  showType,
  canEdit,
  confirming,
  onEdit,
  onCorrectReference,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  view: CitationView
  /** The kind of publication as a chip, for the list that carries no headings. */
  showType: boolean
  canEdit: boolean
  confirming: boolean
  onEdit: () => void
  /** Corrects the PUBLICATION, which is shared. Not offered when it cannot be read. */
  onCorrectReference: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}) {
  return (
    <li className="border-t border-stone-100 py-2 first:border-t-0 first:pt-0">
      <p className={`text-sm font-medium ${view.unavailable ? 'text-stone-500' : ''}`}>
        {view.title}
      </p>
      {view.byline !== '' && <p className="text-xs text-stone-500">{view.byline}</p>}
      {view.sourceText !== null && <p className="text-xs text-stone-500">{view.sourceText}</p>}

      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span
          className={`rounded px-2 py-0.5 text-2xs ${
            view.pagesMissing ? 'bg-stone-100 text-stone-500' : 'bg-stone-200 text-stone-800'
          }`}
        >
          {view.pagesText}
        </span>
        {showType && view.typeName !== null && (
          <span className="rounded px-2 py-0.5 text-2xs text-stone-500">{view.typeName}</span>
        )}
        {view.bibtexKey !== null && (
          <span className="rounded px-2 py-0.5 font-mono text-2xs text-stone-400">
            {view.bibtexKey}
          </span>
        )}
      </div>

      {view.note !== '' && <p className="mt-1 text-xs text-stone-600">{view.note}</p>}
      {view.retiredText !== null && (
        <p className="mt-1 rounded bg-amber-50 p-1.5 text-xs text-amber-900">{view.retiredText}</p>
      )}
      {view.unavailableText !== null && (
        <p className="mt-1 rounded bg-amber-50 p-1.5 text-xs text-amber-900">
          {view.unavailableText}
        </p>
      )}

      {canEdit &&
        (confirming ? (
          /* Two taps to remove, the same as removing a photograph: on a touch
             screen, one tap and the citation somebody researched is gone. */
          <div className="mt-2 rounded-lg bg-stone-100 p-2">
            <p className="text-xs text-stone-700">
              La cita va a la papelera. La referencia no se toca: la comparten las demás obras.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={onRemove} className="btn min-h-touch bg-red-700 text-white">
                Sí, quitar
              </button>
              <button type="button" onClick={onCancelRemove} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-3">
            <button
              type="button"
              onClick={onEdit}
              className="flex min-h-touch items-center gap-1 text-xs text-stone-600 underline"
            >
              <PenIcon className="h-4 w-4" />
              <span>Página y nota</span>
            </button>
            {/* Dos correcciones y dos alcances, y la etiqueta es lo único que los
                distingue: la de arriba es la página de ESTA obra, y esta es la
                publicación, que comparten todas las que la citan. Sin icono, a
                propósito: dos lápices seguidos se leen como el mismo botón dos
                veces. Y no se ofrece cuando la referencia no se puede leer, que
                es la ficha de quien solo consulta: no hay nada que corregir a
                ciegas. */}
            {!view.unavailable && (
              <button
                type="button"
                onClick={onCorrectReference}
                className="min-h-touch text-xs text-stone-600 underline"
              >
                Datos de la referencia
              </button>
            )}
            <button
              type="button"
              onClick={onAskRemove}
              className="min-h-touch text-xs text-stone-600 underline"
            >
              Quitar de la ficha
            </button>
          </div>
        ))}
    </li>
  )
}
