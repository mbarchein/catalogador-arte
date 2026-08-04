import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../../auth/AuthContext'
import { ChevronRightIcon, ImageIcon, PlusIcon } from '../../../components/ui'
import { DocumentarySection } from '../DocumentarySection'
import { blockState } from '../researchState'
import { sectionSpec } from '../sections'
import { useArtworkRelationships } from '../useDocumentary'
import { RelateArtworkForm } from './RelateArtworkForm'
import { editRelationshipNote, setRelationshipActive } from './relateActions'
import {
  recordLink,
  relatedGroups,
  relatedRows,
  relatedSentence,
  type RelatedArtworkRow,
} from './relatedArtworks'
import { useRelatedThumbnails } from './useRelatedThumbnails'

/**
 * «Obras relacionadas» on the artwork record (RF-212, RF-217, RF-305).
 *
 * The block that talks about the catalogue instead of about the world: the other
 * half of a diptych, the study that preceded the painting, the back of a panel
 * catalogued as its own record. Each one is shown with its picture, its code and
 * its title, and taps through to its record.
 *
 * **What this block does NOT have is a state of research**, and that is a
 * decision of the schema and not an omission: the other four blocks cover things
 * that are investigated AS A BLOCK — one goes to the archive looking for
 * exhibitions and comes back with whatever there is — while a relationship
 * between two artworks is not investigated, it turns up while cataloguing the
 * piece next to it. So «no consta ninguna» can never become «no hay ninguna»
 * here, and the empty text says exactly that instead of letting the silence be
 * read as an answer.
 *
 * Everything that decides something — the direction each relationship is read
 * from, the sentences, the order, the grouping, whether a pair can be registered
 * — is pure and lives in `relatedArtworks.ts` and `relateForm.ts`, verified by
 * the battery. This file is the fold, the links and the pictures.
 */
export function RelationshipsSection({
  catalogId,
  search = '',
}: {
  catalogId: string
  /**
   * The list's view, as it travels in the URL of the record (RF-311). Passed on
   * to the related artwork's link so tapping one does not silently reset the
   * queue the cataloger was walking.
   */
  search?: string
}) {
  const { canEdit } = useAuth()
  const { rows, loading, error, reload } = useArtworkRelationships(catalogId)
  const [adding, setAdding] = useState(false)

  const related = useMemo(() => relatedRows(rows, catalogId), [rows, catalogId])
  const groups = useMemo(() => relatedGroups(related), [related])
  const thumbnails = useRelatedThumbnails(related.map((row) => row.catalogId))

  const spec = sectionSpec('relationships')
  // Null and not a research status: this block has no column of its own, and
  // `blockState` turns that into the sentence that says so (RF-218).
  const state = blockState(spec, null, related.length)

  return (
    <DocumentarySection
      spec={spec}
      state={state}
      loading={loading}
      error={error}
      actions={
        canEdit ? (
          adding ? (
            <RelateArtworkForm
              catalogId={catalogId}
              related={related}
              existing={rows}
              onDone={async () => {
                setAdding(false)
                await reload()
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn-secondary w-full"
            >
              <PlusIcon className="h-5 w-5" />
              Relacionar con otra obra
            </button>
          )
        ) : undefined
      }
    >
      {groups.map((group) => (
        // Keyed by its first relationship and not by the label: two entries of
        // the vocabulary can differ only in capitals, which sorts them adjacent
        // and would give two groups the same key.
        <section key={group.rows[0]?.id ?? group.label} className="mb-2 last:mb-0">
          {/* The kind is a heading over its artworks and not a word repeated on
              every line: «los estudios previos» is what somebody comes to look
              for, and on a phone the repetition is what pushes the title out. */}
          <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
            {group.label}
          </h3>
          <ul className="divide-y divide-stone-100">
            {group.rows.map((row) => (
              <li key={row.id} className="py-1.5">
                <RelatedArtworkLine
                  row={row}
                  search={search}
                  thumbnail={thumbnails[row.catalogId]}
                />
                {canEdit && <RowActions row={row} onDone={reload} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocumentarySection>
  )
}

/** One related artwork: its picture, its code, its title and the way to its record. */
function RelatedArtworkLine({
  row,
  search,
  thumbnail,
}: {
  row: RelatedArtworkRow
  search: string
  thumbnail: string | undefined
}) {
  const body = (
    <>
      <Thumbnail url={thumbnail} />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs text-stone-500">{row.catalogId}</span>
        <span className={`block truncate text-sm ${row.linked ? '' : 'text-stone-500'}`}>
          {row.title}
        </span>
        {row.byline && <span className="block truncate text-xs text-stone-500">{row.byline}</span>}
      </span>
      {row.linked && <ChevronRightIcon className="h-5 w-5 shrink-0 text-stone-400" />}
    </>
  )

  return (
    <>
      {row.linked ? (
        /* RF-305: a datum that is a relationship is a link to its own record. The
           whole sentence goes in the accessible name — the kind is in the heading
           above, which a screen reader does not get for free, and a code alone
           does not say what the relationship is. */
        <Link
          to={recordLink(row.catalogId, search)}
          aria-label={relatedSentence(row)}
          className="flex min-h-touch items-center gap-2 rounded-lg px-1 py-1 active:bg-stone-100"
        >
          {body}
        </Link>
      ) : (
        /* No link on purpose: sending the cataloger to a record that answers «no
           se ha encontrado» would make her think the relationship is broken, when
           what is missing is the permission. The notice below says which it is. */
        <div className="flex min-h-touch items-center gap-2 px-1 py-1">{body}</div>
      )}

      {row.notice && (
        <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {row.notice}
        </p>
      )}
      {row.note.trim() !== '' && (
        <p className="mt-1 px-1 text-xs text-stone-600">{row.note}</p>
      )}
    </>
  )
}

/**
 * The picture of the related artwork, or the placeholder that says there is none
 * (RF-404). Never an empty square: a hole where a photograph goes reads as an
 * image that failed to load.
 */
function Thumbnail({ url }: { url: string | undefined }) {
  if (!url) {
    return (
      <span
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-100 text-stone-400"
      >
        <ImageIcon className="h-5 w-5" />
      </span>
    )
  }
  // Empty alt: the code and the title are right next to it, and a second reading
  // of the same thing is noise for whoever listens to the record.
  return <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
}

/**
 * What an editor can do to a relationship that is already on record: write down
 * its circumstance, or withdraw it.
 *
 * The two ends and the kind are not editable here, and it is not a missing
 * feature: changing any of them is a DIFFERENT relationship, and registering it
 * as one leaves the previous fact in the trash instead of rewriting history in
 * place. Withdrawing asks twice — on a phone, next to a link, one tap is an
 * accident — and it is a logical deletion (RF-901, RF-517): the row stays, and
 * adding the pair again brings it back.
 */
function RowActions({ row, onDone }: { row: RelatedArtworkRow; onDone: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(row.note)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setFailure(null)
    const message = await action()
    setBusy(false)
    if (message) {
      setFailure(message)
      return
    }
    setEditing(false)
    setConfirming(false)
    await onDone()
  }

  return (
    <div className="mt-1 px-1">
      {editing ? (
        <div className="space-y-2">
          <label className="label" htmlFor={`relationship-note-${row.id}`}>
            Nota de la relación
          </label>
          <textarea
            id={`relationship-note-${row.id}`}
            className="field"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => editRelationshipNote(row.id, note))}
              className="btn-primary min-h-touch"
            >
              {busy ? 'Guardando…' : 'Guardar nota'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setNote(row.note)
                setEditing(false)
                setFailure(null)
              }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : confirming ? (
        <div>
          <p className="text-xs text-stone-700">
            Se quitará «{relatedSentence(row)}». La relación queda retirada, no borrada: volver a
            añadirla la restaura.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => setRelationshipActive(row.id, false))}
              className="btn min-h-touch bg-stone-900 text-white"
            >
              {busy ? 'Quitando…' : 'Sí, quitar'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false)
                setFailure(null)
              }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        /* Two secondary actions, and full touch height even so (RF-1205): they
           sit next to a link that opens another record, and a mis-tap here is
           either a form nobody asked for or the first half of a withdrawal. */
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-touch items-center text-xs text-stone-600 underline"
          >
            {row.note.trim() === '' ? 'Añadir nota' : 'Editar nota'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-touch items-center text-xs text-stone-600 underline"
          >
            Quitar la relación
          </button>
        </div>
      )}

      {failure && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {failure}
        </p>
      )}
    </div>
  )
}
