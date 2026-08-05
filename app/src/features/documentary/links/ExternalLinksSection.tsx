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
 * «Enlaces a sitios externos», el bloque de la ficha que dice dónde más está
 * documentada esta obra (RF-1401 a RF-1408).
 *
 * Cuelga de la ficha junto a los cinco bloques documentales pero **no es uno de
 * ellos**: no tiene columna de estado de investigación en `artworks` ni la va a
 * tener, así que no usa `DocumentarySection` —cuyo contrato es precisamente esa
 * columna— y trae su propio plegado con la misma forma. El bloque del historial de
 * cambios hizo lo mismo y por el mismo motivo.
 *
 * ── LA REGLA QUE ORDENA ESTA PANTALLA ───────────────────────
 *
 * **La ficha que se lee es de solo lectura; escribir vive en la zona de edición**
 * (RF-308). Aquí eso se aplica con un matiz que hay que dejar escrito porque es la
 * frontera del asunto:
 *
 *  · ABRIR un enlace es leer, y se queda en la ficha. Es la única cosa que se
 *    hace con un enlace el 95 % de las veces.
 *  · ANOTAR LA COMPROBACIÓN escribe en la base —fecha y autor sellados por la
 *    RPC—, así que **no está en la vista** aunque el gesto natural sea pulsar el
 *    enlace, mirar y contestar. Está en la zona de edición, y la vista dice dónde
 *    para que no sea un callejón sin salida. Que una escritura sea cómoda no la
 *    convierte en lectura.
 *
 * `canWriteBlock(writable, canEdit)` decide, y hacen falta las dos: el modo y el
 * permiso. Por omisión `writable` es falso, que es el lado seguro del olvido.
 */
export function ExternalLinksSection({
  catalogId,
  writable = false,
}: {
  catalogId: string
  /**
   * Si el bloque puede escribir. Verdadero solo en la zona de edición (RF-308).
   * Por omisión falso: un bloque que se olvide de pasarlo nace de solo lectura.
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
  // Una sola lectura del reloj para todo el bloque: si cada línea leyera la hora
  // por su cuenta, dos comprobaciones del mismo momento podrían decir «ayer» y
  // «hoy» al cruzar la medianoche mientras se pinta.
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
            <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
              {pending.length === 1 ? '1 sin origen' : `${pending.length} sin origen`}
            </span>
          )}
        </button>
      </h2>

      <div id={bodyId} hidden={!open} className="mt-2">
        {error !== null ? (
          /* Dos cosas distintas, y confundirlas manda a buscar un dato que está
             perfectamente bien: el catálogo ha contestado que no hay nada, o el
             catálogo no ha contestado. */
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
                Añadir un enlace, corregirlo, retirarlo o anotar que lo has comprobado se hace en la
                zona de edición de la ficha.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** Los enlaces de una fotografía, bajo el nombre de la toma. */
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
  // «Sin comprobar» en tono neutro y NO en rojo: es el estado en el que nace todo
  // enlace, y pintar de rojo el caso normal enseña al ojo a saltárselo.
  unchecked: 'bg-stone-200 text-stone-700',
  working: 'bg-green-100 text-green-900',
  changed: 'bg-amber-100 text-amber-900',
  broken: 'bg-red-100 text-red-900',
}

/**
 * Un enlace: qué es, a dónde va, de qué clase es y cuándo se comprobó.
 *
 * **La etiqueta y el destino se ven antes de tocar** (RF-1408), y el destino es el
 * dominio y nunca la dirección entera. Se abre en una pestaña nueva con
 * `rel="noopener noreferrer"`: sin `noopener` la página abierta puede manipular la
 * que la abrió a través de `window.opener`, y sin `noreferrer` el sitio del museo
 * recibe la dirección exacta de la ficha desde la que se pulsó — que es contarle a
 * un tercero qué obra se está catalogando (RF-1404).
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
  /** Este enlace es el que se está corrigiendo, y el formulario está más abajo. */
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
        <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
          {linkTypeText(row.link_type)}
        </span>
        <span className={`rounded px-2 py-0.5 text-[11px] ${CHECK_TONE_CLASS[badge.tone]}`}>
          {badge.label}
        </span>
        {badge.stale && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
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
            /* Dos toques para retirar, como al quitar una fotografía de la galería:
               en una pantalla táctil un solo toque es un accidente esperando pasar,
               y la frase dice qué desaparece y qué no. */
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
