import { useMemo, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { ChevronRightIcon, PlusIcon } from '../../../components/ui'
import { canWriteBlock } from '../sections'
import {
  EMPTY_HINT_READONLY,
  EMPTY_TEXT,
  checkBadge,
  groupLinks,
  linkCountText,
  linkDestination,
  linkLabel,
  linkTypeText,
  missingSourceNotice,
  reproductionsWithoutSource,
  retiredNotice,
  type CheckTone,
  type ExternalLinkRow,
  type PhotoLinkGroup,
} from './externalLinks'
import { CHECK_CLEAR_HINT, CHECK_CLEAR_TEXT, CHECK_OPTIONS, CHECK_QUESTION, retireConfirmText, type LinkAnchor } from './linkDraft'
import { LinkForm } from './LinkForm'
import { useExternalLinks, useLinkActions } from './useExternalLinks'

/**
 * «Enlaces a sitios externos», the record's block that says where else this artwork
 * is documented (RF-1401 to RF-1408).
 *
 * It hangs from the record alongside the five documentary blocks but **it is not one of
 * them**: it has no research-state column in `artworks` and it is not going to
 * have one, so it does not use `DocumentarySection` —whose contract is precisely that
 * column— and brings its own folding with the same shape. The change-history
 * block did the same and for the same reason.
 *
 * ── THE RULE THAT ORDERS THIS SCREEN ────────────────────────
 *
 * **The record that is read is read-only; writing lives in the editing area**
 * (RF-308). Here that applies with a nuance that has to be written down because it is the
 * boundary of the matter:
 *
 *  · OPENING a link is reading, and it stays in the record. It is the only thing
 *    done with a link 95 % of the time.
 *  · NOTING THE CHECK writes to the base —date and author stamped by the
 *    RPC—, so **it is not in the view** even though the natural gesture is to press the
 *    link, look and answer. It is in the editing area, and the view says where
 *    so it is not a dead end. That a write is convenient does not
 *    turn it into a read.
 *
 * `canWriteBlock(writable, canEdit)` decides, and both are needed: the mode and the
 * permission. By default `writable` is false, which is the safe side of forgetting.
 */
export function ExternalLinksSection({
  catalogId,
  writable = false,
}: {
  catalogId: string
  /**
   * Whether the block can write. True only in the editing area (RF-308).
   * False by default: a block that forgets to pass it is born read-only.
   */
  writable?: boolean
}) {
  const { canEdit } = useAuth()
  const canWrite = canWriteBlock(writable, canEdit)
  const { rows, photos, loading, error, reload } = useExternalLinks(catalogId)
  const actions = useLinkActions()

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<LinkAnchor | null>(null)
  const [editing, setEditing] = useState<ExternalLinkRow | null>(null)

  const groups = useMemo(() => groupLinks(rows, photos), [rows, photos])
  const pending = useMemo(() => reproductionsWithoutSource(photos, rows), [photos, rows])
  // A single reading of the clock for the whole block: if each line read the time
  // on its own, two checks from the same moment could say «ayer» and
  // «hoy» on crossing midnight while it is being painted.
  const now = useMemo(() => new Date(), [rows])

  const bodyId = `external-links-${catalogId}`
  const nothing = groups.artwork.length === 0 && groups.photos.length === 0

  async function afterWrite(failure: string | null): Promise<string | null> {
    if (failure === null) {
      setAdding(null)
      setEditing(null)
      await reload()
    }
    return failure
  }

  return (
    <section className="card mb-3">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-touch w-full items-center gap-2 text-left"
        >
          <ChevronRightIcon
            className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Enlaces a sitios externos</span>
            {/* Lo único que se lee antes de decidir si abrir el bloque. Nunca un
                cero pelado: «0 enlaces» se lee como una respuesta sobre la obra. */}
            <span className="block text-xs text-stone-500">
              {error !== null
                ? 'No se ha podido cargar'
                : loading
                  ? 'Cargando…'
                  : linkCountText(groups.activeCount)}
            </span>
          </span>
          {/* La única insignia de la cabecera: que haya una reproducción sin
              origen. Es lo que cierra el par de RF-417 con RF-1407, y estando
              plegado el bloque no se ve de otra forma. */}
          {error === null && !loading && pending.length > 0 && (
            <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-2xs text-amber-900">
              {pending.length === 1 ? '1 sin origen' : `${pending.length} sin origen`}
            </span>
          )}
        </button>
      </h2>

      <div id={bodyId} hidden={!open} className="mt-2">
        {error !== null ? (
          /* Two different things, and confusing them sends people looking for a datum that is
             perfectly fine: the catalogue has answered that there is nothing, or the
             catalogue has not answered. */
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error} Mientras no se pueda leer, este bloque no muestra nada: lo que haya registrado
            puede ser cualquier cosa.
          </p>
        ) : loading ? (
          <p className="p-2 text-sm text-stone-600">Cargando…</p>
        ) : (
          <>
            {pending.length > 0 && (
              <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                {missingSourceNotice(pending)}
              </p>
            )}

            {nothing ? (
              <p className="p-2 text-sm text-stone-600">
                {/* El «dónde se añade» solo a quien puede añadirlo, igual que el
                    aviso equivalente del final del bloque: a quien solo consulta,
                    mandarla a una zona de edición que no va a tener nunca es
                    mandarla a un sitio que para ella no existe. */}
                {EMPTY_TEXT} {!canWrite && canEdit && EMPTY_HINT_READONLY}
              </p>
            ) : (
              <div className="space-y-3">
                {groups.artwork.length > 0 && (
                  <ul className="space-y-2">
                    {groups.artwork.map((row) => (
                      <LinkItem
                        key={row.id}
                        row={row}
                        now={now}
                        canWrite={canWrite}
                        saving={actions.saving}
                        actions={actions}
                        onDone={afterWrite}
                        onEdit={() => {
                          setAdding(null)
                          setEditing(row)
                        }}
                        editing={editing?.id === row.id}
                      />
                    ))}
                  </ul>
                )}

                {groups.photos.map((group) => (
                  <PhotoGroup
                    key={group.imageId}
                    group={group}
                    now={now}
                    canWrite={canWrite}
                    saving={actions.saving}
                    actions={actions}
                    onDone={afterWrite}
                    editingId={editing?.id ?? null}
                    onEdit={(row) => {
                      setAdding(null)
                      setEditing(row)
                    }}
                  />
                ))}
              </div>
            )}

            {/* La corrección de un enlace, debajo de la lista y no dentro de la
                línea: en una pantalla estrecha un formulario metido en un elemento
                de lista empuja todo lo demás fuera de la vista. */}
            {canWrite && editing !== null && (
              <div className="mt-3 rounded-lg border border-stone-200 p-3">
                <p className="mb-2 text-sm font-medium">Corregir el enlace</p>
                <LinkForm
                  anchor={{ kind: 'ARTWORK', id: catalogId }}
                  photos={photos}
                  rows={rows}
                  editing={editing}
                  saving={actions.saving}
                  verifyUrl={actions.verifyUrl}
                  onSubmit={async (draft) => afterWrite(await actions.save(editing.id, draft))}
                  onRestore={async (link) => afterWrite(await actions.setActive(link.id, true))}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}

            {canWrite && (
              <div className="mt-3 border-t border-stone-100 pt-3">
                {adding !== null ? (
                  <LinkForm
                    anchor={adding}
                    photos={photos}
                    rows={rows}
                    saving={actions.saving}
                    verifyUrl={actions.verifyUrl}
                    onSubmit={async (draft) => afterWrite(await actions.add(draft))}
                    onRestore={async (link) => afterWrite(await actions.setActive(link.id, true))}
                    onCancel={() => setAdding(null)}
                  />
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null)
                        setAdding({ kind: 'ARTWORK', id: catalogId })
                      }}
                      className="btn-secondary w-full text-sm"
                    >
                      <PlusIcon className="h-5 w-5" />
                      Añadir un enlace
                    </button>
                    {/* Y el atajo del caso que existe de verdad: una reproducción
                        que no dice de dónde salió, con el formulario ya anclado a
                        esa toma y sin tener que elegirla en una lista. */}
                    {pending.map((photo) => (
                      <button
                        key={photo.image_id}
                        type="button"
                        onClick={() => {
                          setEditing(null)
                          setAdding({ kind: 'IMAGE', id: photo.image_id })
                        }}
                        className="btn-secondary w-full text-sm"
                      >
                        Decir de dónde salió la foto {photo.sort_order}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Y en la vista, dónde se escribe. Sin esto, quien puede editar y está
                leyendo la ficha se queda sin saber por qué no ve ningún botón. */}
            {!canWrite && canEdit && !nothing && (
              <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
                Los enlaces se añaden y se corrigen en la zona de edición de la ficha.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** A photograph's links, under the shot's name. */
function PhotoGroup({
  group,
  now,
  canWrite,
  saving,
  actions,
  onDone,
  onEdit,
  editingId,
}: {
  group: PhotoLinkGroup
  now: Date
  canWrite: boolean
  saving: boolean
  actions: ReturnType<typeof useLinkActions>
  onDone: (failure: string | null) => Promise<string | null>
  onEdit: (row: ExternalLinkRow) => void
  editingId: string | null
}) {
  return (
    <div className="rounded-lg bg-stone-50 p-2">
      <p className="text-xs font-medium text-stone-700">{group.title}</p>
      {group.notice !== null && <p className="text-xs text-stone-500">{group.notice}</p>}
      <ul className="mt-1 space-y-2">
        {group.links.map((row) => (
          <LinkItem
            key={row.id}
            row={row}
            now={now}
            canWrite={canWrite}
            saving={saving}
            actions={actions}
            onDone={onDone}
            onEdit={() => onEdit(row)}
            editing={editingId === row.id}
          />
        ))}
      </ul>
    </div>
  )
}

const CHECK_TONE_CLASS: Record<CheckTone, string> = {
  // «Sin comprobar» in a neutral tone and NOT in red: it is the state every link is born
  // in, and painting the normal case red teaches the eye to skip it.
  unchecked: 'bg-stone-200 text-stone-700',
  working: 'bg-green-100 text-green-900',
  changed: 'bg-amber-100 text-amber-900',
  broken: 'bg-red-100 text-red-900',
}

/**
 * A link: what it is, where it goes, what kind it is and when it was checked.
 *
 * **The label and the destination are visible before touching** (RF-1408), and the destination is the
 * domain and never the whole address. It opens in a new tab with
 * `rel="noopener noreferrer"`: without `noopener` the opened page can manipulate the
 * one that opened it through `window.opener`, and without `noreferrer` the museum's site
 * receives the exact address of the record it was pressed from — which is telling
 * a third party which artwork is being catalogued (RF-1404).
 */
function LinkItem({
  row,
  now,
  canWrite,
  saving,
  actions,
  onDone,
  onEdit,
  editing,
}: {
  row: ExternalLinkRow
  now: Date
  canWrite: boolean
  saving: boolean
  actions: ReturnType<typeof useLinkActions>
  onDone: (failure: string | null) => Promise<string | null>
  onEdit: () => void
  /** This link is the one being corrected, and the form is further down. */
  editing: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const label = linkLabel(row)
  const destination = linkDestination(row)
  const badge = checkBadge(row, now)
  const retired = retiredNotice(row)

  return (
    <li className={`rounded-lg border border-stone-100 p-2 ${row.active ? '' : 'opacity-60'}`}>
      {/* El enlace, con toda la línea táctil: se pulsa con el pulgar de una mano
          que además sujeta algo. */}
      <a
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-touch items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-stone-800 underline">{label}</span>
          {destination !== null && (
            <span className="block truncate text-xs text-stone-500">{destination}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-stone-400">Abrir ↗</span>
      </a>

      <div className="mt-1 flex flex-wrap gap-1.5">
        <span className="rounded bg-stone-100 px-2 py-0.5 text-2xs text-stone-600">
          {linkTypeText(row.link_type)}
        </span>
        <span className={`rounded px-2 py-0.5 text-2xs ${CHECK_TONE_CLASS[badge.tone]}`}>
          {badge.label}
        </span>
        {badge.stale && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-2xs text-amber-900">
            Conviene volver a mirarlo
          </span>
        )}
      </div>

      {badge.detail !== null && <p className="mt-1 text-xs text-stone-500">{badge.detail}</p>}

      {row.note.trim() !== '' && <p className="mt-1 text-xs text-stone-600">{row.note}</p>}

      {/* La copia archivada es otro enlace, no un botón: la guardó una persona en
          un archivo público y se abre igual que el original. */}
      {row.archive_url !== null && row.archive_url.trim() !== '' && (
        <p className="mt-1 text-xs">
          <a
            href={row.archive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-600 underline"
          >
            Copia archivada
          </a>
        </p>
      )}

      {retired !== null && <p className="mt-1 text-xs text-stone-500">{retired}</p>}

      {failure !== null && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {failure}
        </p>
      )}

      {canWrite && !editing && (
        <div className="mt-2 space-y-2">
          {/* LA COMPROBACIÓN, y solo aquí: escribe en la base, así que no está en
              la ficha que se lee. La pregunta es sobre lo que la persona acaba de
              ver, no sobre lo que la aplicación crea. */}
          {checking ? (
            <div className="rounded-lg bg-stone-50 p-2">
              <p className="text-xs text-stone-700">{CHECK_QUESTION}</p>
              <div className="mt-1 space-y-1">
                {CHECK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      void (async () => {
                        const message = await onDone(await actions.check(row.id, option.value))
                        setFailure(message)
                        if (message === null) setChecking(false)
                      })()
                    }}
                    className="btn-secondary min-h-touch w-full justify-start text-sm"
                  >
                    <span className="text-left">
                      <span className="block font-medium">{option.text}</span>
                      <span className="block text-xs text-stone-500">{option.hint}</span>
                    </span>
                  </button>
                ))}
                {/* La cuarta salida: equivocarse al pulsar es normal, y sin esto un
                    toque en «Ya no está» sería un dato falso para siempre. */}
                {row.check_status !== null && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      void (async () => {
                        const message = await onDone(await actions.check(row.id, null))
                        setFailure(message)
                        if (message === null) setChecking(false)
                      })()
                    }}
                    className="btn-secondary min-h-touch w-full justify-start text-sm"
                  >
                    <span className="text-left">
                      <span className="block font-medium">{CHECK_CLEAR_TEXT}</span>
                      <span className="block text-xs text-stone-500">{CHECK_CLEAR_HINT}</span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setChecking(false)}
                  className="btn-secondary min-h-touch w-full text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : confirming ? (
            /* Two taps to withdraw, as when removing a photograph from the gallery:
               on a touch screen a single tap is an accident waiting to happen,
               and the sentence says what disappears and what does not. */
            <div>
              <p className="text-xs text-stone-700">{retireConfirmText(row)}</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void (async () => {
                      const message = await onDone(await actions.setActive(row.id, false))
                      setFailure(message)
                      if (message === null) setConfirming(false)
                    })()
                  }}
                  className="btn-secondary min-h-touch text-sm"
                >
                  {saving ? 'Retirando…' : 'Sí, retirar'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirming(false)}
                  className="btn-secondary min-h-touch text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 text-xs">
              {row.active && (
                <button
                  type="button"
                  onClick={() => {
                    setFailure(null)
                    setChecking(true)
                  }}
                  className="text-stone-600 underline"
                >
                  Anotar una comprobación
                </button>
              )}
              <button type="button" onClick={onEdit} className="text-stone-600 underline">
                Corregir
              </button>
              {row.active ? (
                <button
                  type="button"
                  onClick={() => {
                    setFailure(null)
                    setConfirming(true)
                  }}
                  className="text-stone-600 underline"
                >
                  Retirar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void (async () => setFailure(await onDone(await actions.setActive(row.id, true))))()
                  }}
                  className="text-stone-600 underline"
                >
                  Recuperar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {editing && (
        <p className="mt-2 text-xs text-stone-500">Lo estás corrigiendo abajo.</p>
      )}
    </li>
  )
}
