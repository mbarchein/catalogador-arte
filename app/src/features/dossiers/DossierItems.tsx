import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronDownIcon, ChevronUpIcon, ImageIcon, TrashIcon } from '../../components/ui'
import { planPrice, priceInputValue } from './dossierDraft'
import { itemEntries, itemsNotice, type DossierItemRow } from './dossierItems'
import { removeItemConfirmText } from './dossierMessages'
import type { ItemPatch } from './useDossier'

/**
 * What the dossier holds, in order, with the two things that are done to it:
 * moving an item and correcting it (RF-1603, RF-1604, RF-1613).
 *
 * **The order is walked with two buttons and not dragged.** Dragging on a phone
 * with the artwork in your hands is a gesture that fights the scroll, and the
 * project already learnt that on the thumbnails of a record. One tap, one place,
 * and the buttons at the ends are disabled instead of doing nothing.
 *
 * Every move is a write, and it is `reorder_dossier_items`: the whole list or
 * nothing. So a stale screen —somebody else added an artwork meanwhile— is refused
 * with a sentence instead of leaving half an order.
 */
export function DossierItems({
  items,
  thumbnails,
  loading,
  error,
  canEdit,
  showPrices,
  onMove,
  onEdit,
  onRemove,
}: {
  items: readonly DossierItemRow[]
  /** Miniatura firmada por código de obra. Vacío mientras la consulta viaja. */
  thumbnails: Record<string, string>
  loading: boolean
  error: string | null
  canEdit: boolean
  /** Whether this dossier prints prices. Decides whether the price is offered at all. */
  showPrices: boolean
  onMove: (id: string, direction: 'up' | 'down') => Promise<string | null>
  onEdit: (id: string, patch: ItemPatch) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const entries = itemEntries(items)
  const notice = itemsNotice({ loading, error, count: entries.length })
  const live = entries.filter((entry) => entry.position !== null)
  const lastPosition = live.length

  async function act(action: () => Promise<string | null>) {
    setBusy(true)
    setProblem(null)
    const message = await action()
    setBusy(false)
    if (message !== null) setProblem(message)
  }

  return (
    <div className="space-y-2">
      {problem && (
        <p role="alert" className="card text-sm text-red-700">
          {problem}
        </p>
      )}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const row = items.find((candidate) => candidate.id === entry.id)
          return (
            <li key={entry.id} className={`card ${entry.retired ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2">
                {/* El número es la posición en el PDF, que es la única cifra que
                    importa aquí. Un elemento retirado no tiene sitio, y en vez de
                    un número lleva un guion. */}
                <span className="mt-0.5 w-6 shrink-0 text-right text-sm tabular-nums text-stone-500">
                  {entry.position ?? '—'}
                </span>
                {/* La miniatura para una obra, y un icono para lo que no es una obra.
                    Los dos ocupan EL MISMO cuadrado, y eso es lo que hace la lista
                    recorrible: si los textos no tuvieran su hueco, cada uno de ellos
                    desplazaría el resto de la columna y el orden dejaría de leerse
                    de un vistazo. */}
                <span className="mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded border border-stone-200 bg-stone-100">
                  {entry.kind === 'ARTWORK' && entry.catalogId !== null &&
                  thumbnails[entry.catalogId] !== undefined ? (
                    <img
                      src={thumbnails[entry.catalogId]}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-stone-400">
                      {entry.kind === 'ARTWORK' ? (
                        <ImageIcon className="h-5 w-5" />
                      ) : entry.kind === 'TEXT' ? (
                        <TextItemIcon className="h-5 w-5" />
                      ) : (
                        <BiographyItemIcon className="h-5 w-5" />
                      )}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{entry.title}</p>
                  <p className="mt-0.5 break-words text-xs text-stone-600">{entry.subtitle}</p>
                  {entry.body !== '' && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-800">
                      {entry.body}
                    </p>
                  )}
                  {entry.price !== null && showPrices && (
                    <p className="mt-1 text-sm">{entry.price}</p>
                  )}
                  {entry.price !== null && !showPrices && (
                    // Guardado y no impreso: decirlo evita que alguien escriba doce
                    // precios y los mande sin querer, o al contrario.
                    <p className="mt-1 text-xs text-stone-500">
                      {entry.price} · guardado, pero este dossier no imprime precios
                    </p>
                  )}
                  {entry.note !== '' && (
                    <p className="mt-1 break-words text-xs italic text-stone-500">
                      {entry.note} · nota del equipo, no sale en el PDF
                    </p>
                  )}
                  {entry.retirementNotice !== null && (
                    <p className="mt-1 text-xs text-amber-900">{entry.retirementNotice}</p>
                  )}
                  {entry.catalogId !== null && (
                    <Link
                      to={`/artwork/${entry.catalogId}`}
                      className="mt-1 inline-block text-xs text-stone-600 underline"
                    >
                      {entry.catalogId}
                    </Link>
                  )}
                </div>

                {canEdit && entry.position !== null && (
                  <div className="flex shrink-0 flex-col gap-1">
                    {/* Iconos propios de arriba y abajo, sin rotar nada: esta lista
                        salió con las flechas intercambiadas porque un chevrón `<`
                        girado un cuarto de vuelta apunta hacia abajo. El botón hacía
                        lo correcto y dibujaba lo contrario. */}
                    <button
                      type="button"
                      aria-label="Subir un puesto"
                      className="rounded border border-stone-300 p-1 disabled:opacity-30"
                      disabled={busy || entry.position === 1}
                      onClick={() => void act(() => onMove(entry.id, 'up'))}
                    >
                      <ChevronUpIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Bajar un puesto"
                      className="rounded border border-stone-300 p-1 disabled:opacity-30"
                      disabled={busy || entry.position === lastPosition}
                      onClick={() => void act(() => onMove(entry.id, 'down'))}
                    >
                      <ChevronDownIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {canEdit && row !== undefined && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-stone-200 pt-2">
                  <button
                    type="button"
                    className="text-sm text-stone-700 underline"
                    onClick={() => setOpen(open === entry.id ? null : entry.id)}
                  >
                    {open === entry.id ? 'Cerrar' : 'Corregir'}
                  </button>
                  {entry.retired ? (
                    <button
                      type="button"
                      className="text-sm text-stone-700 underline"
                      disabled={busy}
                      onClick={() => void act(() => onEdit(entry.id, { active: true }))}
                    >
                      Volver a poner
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 text-sm text-red-800"
                      disabled={busy}
                      onClick={() => {
                        // La confirmación dice qué pasa con ESTE tipo: una obra
                        // vuelve con su nota y su precio, un texto habría que
                        // escribirlo otra vez.
                        if (!window.confirm(removeItemConfirmText(entry.kind, entry.title))) return
                        void act(() => onRemove(entry.id))
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Quitar
                    </button>
                  )}
                </div>
              )}

              {canEdit && open === entry.id && row !== undefined && (
                <ItemEditor
                  row={row}
                  showPrices={showPrices}
                  onSave={async (patch) => {
                    const message = await onEdit(entry.id, patch)
                    if (message === null) setOpen(null)
                    return message
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Correcting one item: its price, its note, and — on a text — its words.
 *
 * The price is only offered when the dossier prints prices, and that is not
 * hiding a field: a price typed into a dossier that does not print them is work
 * that goes nowhere, and the switch that turns them on is two taps away in the same
 * screen. What is already saved keeps showing above, said as such.
 */
function ItemEditor({
  row,
  showPrices,
  onSave,
}: {
  row: DossierItemRow
  showPrices: boolean
  onSave: (patch: ItemPatch) => Promise<string | null>
}) {
  const [price, setPrice] = useState(priceInputValue(row.price))
  const [note, setNote] = useState(row.note)
  const [heading, setHeading] = useState(row.heading)
  const [body, setBody] = useState(row.body)
  const [withCv, setWithCv] = useState(row.with_cv ?? true)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setProblem(null)
    const patch: ItemPatch = { note }
    if (row.kind === 'ARTWORK' && showPrices) {
      const plan = planPrice(price)
      if ('message' in plan) {
        setProblem(plan.message)
        return
      }
      patch.price = plan.price
    }
    if (row.kind === 'TEXT') {
      patch.heading = heading.trim()
      patch.body = body.trim()
      if (patch.heading === '' && patch.body === '') {
        setProblem('Escribe al menos un rótulo o un párrafo.')
        return
      }
    }
    if (row.kind === 'BIOGRAPHY') {
      patch.heading = heading.trim()
      patch.with_cv = withCv
    }
    setSaving(true)
    const message = await onSave(patch)
    setSaving(false)
    if (message !== null) setProblem(message)
  }

  return (
    <div className="mt-2 space-y-3 border-t border-stone-200 pt-3">
      {row.kind === 'ARTWORK' && showPrices && (
        <div>
          <label className="block text-sm font-medium" htmlFor={`price-${row.id}`}>
            Precio en este dossier
          </label>
          <input
            id={`price-${row.id}`}
            className="field mt-1"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="4.500"
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-stone-500">
            En euros. Vacío es «sin precio», que no es lo mismo que cero.
          </p>
        </div>
      )}

      {(row.kind === 'TEXT' || row.kind === 'BIOGRAPHY') && (
        <div>
          <label className="block text-sm font-medium" htmlFor={`heading-${row.id}`}>
            Rótulo
          </label>
          <input
            id={`heading-${row.id}`}
            className="field mt-1"
            value={heading}
            onChange={(event) => setHeading(event.target.value)}
            autoComplete="off"
          />
          {row.kind === 'BIOGRAPHY' && (
            <p className="mt-1 text-xs text-stone-500">
              Vacío: sale el nombre del artista.
            </p>
          )}
        </div>
      )}

      {row.kind === 'TEXT' && (
        <div>
          <label className="block text-sm font-medium" htmlFor={`body-${row.id}`}>
            Párrafo
          </label>
          <textarea
            id={`body-${row.id}`}
            className="field mt-1 min-h-[5rem]"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      )}

      {row.kind === 'BIOGRAPHY' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withCv}
            onChange={(event) => setWithCv(event.target.checked)}
          />
          Con el currículum detrás
        </label>
      )}

      <div>
        <label className="block text-sm font-medium" htmlFor={`note-${row.id}`}>
          Nota del equipo
        </label>
        <input
          id={`note-${row.id}`}
          className="field mt-1"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="La que pidieron ver de cerca"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-stone-500">No sale en el PDF.</p>
      </div>

      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}

      <button
        type="button"
        className="min-h-[2.75rem] w-full rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:opacity-50"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  )
}

/**
 * Un texto libre, dibujado como lo que es: tres renglones y un rótulo encima.
 *
 * Vive aquí y no en `ui.tsx` porque solo esta lista distingue tipos de elemento, y
 * porque su trabajo es exactamente uno: que la columna de la izquierda se lea de
 * arriba abajo sabiendo qué es cada fila sin leer una palabra.
 */
function TextItemIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5 5h11" />
      <path d="M5 10h14" />
      <path d="M5 15h14" />
      <path d="M5 20h8" />
    </svg>
  )
}

/** La biografía: una persona y un renglón, para no confundirla con un texto suelto. */
function BiographyItemIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="9" cy="7" r="3" />
      <path d="M4 20c1-3 3-4.5 5-4.5s4 1.5 5 4.5" />
      <path d="M16 8h4" />
      <path d="M16 12h4" />
    </svg>
  )
}
