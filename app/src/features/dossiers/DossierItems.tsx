import { useState } from 'react'
import { Link } from 'react-router'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ConfirmSheet,
  ImageIcon,
  PenIcon,
  TrashIcon,
} from '../../components/ui'
import { MarkupField } from '../../components/MarkupField'
import { MarkupText } from '../../components/MarkupText'
import type { DossierItemKind } from '../../lib/types'
import { planPrice, priceInputValue } from './dossierDraft'
import { itemEntries, itemsNotice, type DossierItemEntry, type DossierItemRow } from './dossierItems'
import { removeItemConfirmText, removeItemConfirmTitle } from './dossierMessages'
import {
  activeSections,
  dossierGroups,
  groupCountText,
  movedItemOrder,
  movedSectionOrder,
  orphanNotice,
  sectionOf,
} from './dossierSections'
import type { ItemPatch } from './useDossier'

/**
 * Lo que lleva el dossier, agrupado por secciones y en orden, con lo que se hace
 * con él: mover, corregir y quitar (RF-1603, RF-1604, RF-1613, RF-1619, RF-1620).
 *
 * **El orden se recorre con dos botones y no arrastrando.** Arrastrar en un móvil
 * con la obra en las manos es un gesto que pelea con el desplazamiento, y eso ya lo
 * aprendió el proyecto en las miniaturas de una ficha. Un toque, un puesto, y en
 * los extremos los botones se apagan en vez de no hacer nada.
 *
 * **Dos movimientos y no cuatro botones.** Los de la banda de una sección mueven
 * **la sección entera con sus obras dentro**, que es el trabajo que si no son diez
 * toques; los de una fila mueven ese elemento, y por eso son también la forma de
 * pasar una obra de una sección a la siguiente. Poner las dos parejas en la banda
 * habría sido pedirle a quien cataloga que distinga cuatro flechas.
 *
 * Una sección se cambia con **el bloque de al lado**, y lo que va suelto al principio
 * cuenta como bloque: contando solo secciones, la única de un dossier se quedaba con
 * las dos flechas apagadas y sin ninguna forma de moverse.
 *
 * Cada movimiento es una escritura, y es `reorder_dossier_items`: la lista entera o
 * nada. Así una pantalla vieja se rechaza con una frase en vez de dejar medio orden.
 */
export function DossierItems({
  items,
  thumbnails,
  loading,
  error,
  canEdit,
  showPrices,
  onMove,
  onMoveSection,
  onSetSection,
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
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => Promise<string | null>
  onSetSection: (id: string, sectionId: string | null) => Promise<string | null>
  onEdit: (id: string, patch: ItemPatch) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<readonly string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Qué se ha pedido quitar, o null. Una sola hoja para toda la lista: una por fila
  // serían doce diálogos montados a la vez para que se abra uno.
  const [removing, setRemoving] = useState<{
    id: string
    kind: DossierItemKind
    name: string
  } | null>(null)

  const entries = itemEntries(items)
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const groups = dossierGroups(items)
  const notice = itemsNotice({ loading, error, count: entries.length })
  const orphans = orphanNotice(groups)
  // Las secciones a las que se puede mandar un elemento: las activas, en su orden.
  const sections = activeSections(items)
  const sectionChoices = groups.flatMap((group) =>
    group.sectionId === null ? [] : [{ id: group.sectionId, heading: group.heading ?? '' }],
  )

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
      {/* Las huérfanas no son un error —se puede querer una obra de apertura— pero
          salen sin rótulo, y verlo evita mandarlas sin querer en el limbo. */}
      {orphans && <p className="card text-sm text-amber-900">{orphans}</p>}

      {groups.map((group, groupIndex) => {
        const isCollapsed = group.sectionId !== null && collapsed.includes(group.sectionId)
        const sectionRow =
          group.sectionId === null
            ? undefined
            : items.find((row) => row.id === group.sectionId)
        // Los botones se apagan preguntándole al MISMO cálculo que hace el movimiento,
        // y no contando secciones aquí: contarlas aquí es lo que dejó una sección sola
        // con las dos flechas apagadas para siempre.
        const sectionId = group.sectionId
        const canMove =
          sectionId === null
            ? { up: false, down: false }
            : {
                up: movedSectionOrder(items, sectionId, 'up') !== null,
                down: movedSectionOrder(items, sectionId, 'down') !== null,
              }

        return (
          <div key={group.sectionId ?? `orphans-${groupIndex}`} className="space-y-2">
            {sectionId !== null && sectionRow !== undefined && (
              <div className="rounded-lg border border-stone-300 bg-stone-100 px-3 py-2">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-stone-600"
                    aria-label={isCollapsed ? 'Desplegar la sección' : 'Plegar la sección'}
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((current) =>
                        current.includes(sectionId)
                          ? current.filter((id) => id !== sectionId)
                          : [...current, sectionId],
                      )
                    }
                  >
                    {isCollapsed ? (
                      <ChevronDownIcon className="h-5 w-5" />
                    ) : (
                      <ChevronUpIcon className="h-5 w-5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{group.heading}</p>
                    <p className="text-xs text-stone-600">
                      {groupCountText(group)}
                      {group.dividerPage ? ' · con página propia' : ''}
                    </p>
                    {group.body !== '' && <MarkupText text={group.body} className="mt-1" />}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 flex-col gap-1">
                      {/* Mueven la SECCIÓN ENTERA, cambiándola con el bloque de al
                          lado: otra sección, o una obra suelta, que es un bloque de
                          una. No cambian la pertenencia de nada. */}
                      <button
                        type="button"
                        aria-label="Subir la sección entera"
                        className="rounded border border-stone-300 bg-white p-1 disabled:opacity-30"
                        disabled={busy || !canMove.up}
                        onClick={() => void act(() => onMoveSection(sectionId, 'up'))}
                      >
                        <ChevronUpIcon className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Bajar la sección entera"
                        className="rounded border border-stone-300 bg-white p-1 disabled:opacity-30"
                        disabled={busy || !canMove.down}
                        onClick={() => void act(() => onMoveSection(sectionId, 'down'))}
                      >
                        <ChevronDownIcon className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Los mismos dos botones que una fila, y en el mismo sitio: si en la
                    banda fueran rótulos y en las filas iconos, cada bloque habría que
                    volver a leerlo. */}
                {canEdit && (
                  <div className="mt-2 flex items-center gap-1 border-t border-stone-200 pt-2">
                    <button
                      type="button"
                      aria-label={
                        open === sectionId ? 'Cerrar la corrección de la sección' : 'Corregir la sección'
                      }
                      aria-expanded={open === sectionId}
                      className={`ml-auto flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded border border-stone-300 ${
                        open === sectionId ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'
                      }`}
                      onClick={() => setOpen(open === sectionId ? null : sectionId)}
                    >
                      <PenIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Quitar la sección"
                      className="flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded border border-red-200 bg-white text-red-800 disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        setRemoving({
                          id: sectionId,
                          kind: 'SECTION',
                          name: group.heading ?? '',
                        })
                      }
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}

                {canEdit && open === sectionId && (
                  <ItemEditor
                    row={sectionRow}
                    showPrices={showPrices}
                    onSave={async (patch) => {
                      const message = await onEdit(sectionId, patch)
                      if (message === null) setOpen(null)
                      return message
                    }}
                  />
                )}
              </div>
            )}

            {!isCollapsed && (
              <ul className={`space-y-2 ${group.sectionId === null ? '' : 'pl-3'}`}>
                {group.items.map((row) => {
                  const entry = byId.get(row.id)
                  if (entry === undefined) return null
                  return (
                    <li key={row.id} className={`card ${entry.retired ? 'opacity-60' : ''}`}>
                      <ItemRow
                        entry={entry}
                        row={row}
                        thumbnails={thumbnails}
                        canEdit={canEdit}
                        showPrices={showPrices}
                        busy={busy}
                        canMoveUp={movedItemOrder(items, row.id, 'up') !== null}
                        canMoveDown={movedItemOrder(items, row.id, 'down') !== null}
                        sectionChoices={sectionChoices}
                        section={sectionOf(row, sections)}
                        onSetSection={(sectionId) => void act(() => onSetSection(row.id, sectionId))}
                        open={open === row.id}
                        onToggleOpen={() => setOpen(open === row.id ? null : row.id)}
                        onMove={(direction) => void act(() => onMove(row.id, direction))}
                        onRestore={() => void act(() => onEdit(row.id, { active: true }))}
                        onRemove={() =>
                          setRemoving({ id: row.id, kind: entry.kind, name: entry.title })
                        }
                        onSave={async (patch) => {
                          const message = await onEdit(row.id, patch)
                          if (message === null) setOpen(null)
                          return message
                        }}
                      />
                    </li>
                  )
                })}
              </ul>
            )}

            {isCollapsed && (
              // Plegada dice qué esconde: un bloque plegado que no cuenta lo que hay
              // dentro es un bloque que se olvida.
              <p className="pl-3 text-xs text-stone-500">
                {groupCountText(group)} plegadas.
              </p>
            )}
          </div>
        )
      })}

      {/* La pregunta de quitar, en la hoja de siempre y no en el `confirm` del
          navegador: sale por abajo, donde está el pulgar, y se cierra por las cuatro
          puertas de cualquier panel — el «atrás» del teléfono incluido, que en un
          `confirm` nativo no se puede interceptar. */}
      {removing !== null && (
        <ConfirmSheet
          open
          title={removeItemConfirmTitle(removing.kind)}
          text={removeItemConfirmText(removing.kind, removing.name)}
          confirmLabel="Sí, quitar"
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            const { id } = removing
            setRemoving(null)
            void act(() => onRemove(id))
          }}
        />
      )}
    </div>
  )
}

/** Una fila de la lista: lo que es, y los cuatro botones que actúan sobre ella. */
function ItemRow({
  entry,
  row,
  thumbnails,
  canEdit,
  showPrices,
  busy,
  canMoveUp,
  canMoveDown,
  sectionChoices,
  section,
  onSetSection,
  open,
  onToggleOpen,
  onMove,
  onRestore,
  onRemove,
  onSave,
}: {
  entry: DossierItemEntry
  row: DossierItemRow
  thumbnails: Record<string, string>
  canEdit: boolean
  showPrices: boolean
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** Las secciones del dossier, en su orden, para mandar el elemento a una. */
  sectionChoices: readonly { id: string; heading: string }[]
  /** La sección en la que está, o null si va suelto. */
  section: string | null
  onSetSection: (sectionId: string | null) => void
  open: boolean
  onToggleOpen: () => void
  onMove: (direction: 'up' | 'down') => void
  onRestore: () => void
  onRemove: () => void
  onSave: (patch: ItemPatch) => Promise<string | null>
}) {
  const thumbnail = entry.catalogId === null ? undefined : thumbnails[entry.catalogId]
  return (
    <>
      <div className="flex items-start gap-2">
        {/* El número es la posición en el PDF, que es la única cifra que importa
            aquí. Un elemento retirado no tiene sitio, y en vez de un número lleva un
            guion. */}
        <span className="mt-0.5 w-6 shrink-0 text-right text-sm tabular-nums text-stone-500">
          {entry.position ?? '—'}
        </span>
        {/* La miniatura para una obra, y un icono para lo que no es una obra. Los dos
            ocupan EL MISMO cuadrado, y eso es lo que hace la lista recorrible: si los
            textos no tuvieran su hueco, cada uno desplazaría el resto de la columna y
            el orden dejaría de leerse de un vistazo. */}
        <span className="mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded border border-stone-200 bg-stone-100">
          {entry.kind === 'ARTWORK' && thumbnail !== undefined ? (
            <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-stone-400">
              {entry.kind === 'ARTWORK' ? (
                <ImageIcon className="h-5 w-5" />
              ) : entry.kind === 'BIOGRAPHY' ? (
                <BiographyItemIcon className="h-5 w-5" />
              ) : (
                <TextItemIcon className="h-5 w-5" />
              )}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{entry.title}</p>
          <p className="mt-0.5 break-words text-xs text-stone-600">{entry.subtitle}</p>
          {entry.body !== '' && <MarkupText text={entry.body} className="mt-1" />}
          {entry.price !== null && showPrices && <p className="mt-1 text-sm">{entry.price}</p>}
          {entry.price !== null && !showPrices && (
            // Guardado y no impreso: decirlo evita que alguien escriba doce precios y
            // los mande sin querer, o al contrario.
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
            {/* Iconos propios de arriba y abajo, sin rotar nada: esta lista salió con
                las flechas intercambiadas porque un chevrón `<` girado un cuarto de
                vuelta apunta hacia abajo. El botón hacía lo correcto y dibujaba lo
                contrario. */}
            <button
              type="button"
              aria-label="Subir un puesto"
              className="rounded border border-stone-300 p-1 disabled:opacity-30"
              disabled={busy || !canMoveUp}
              onClick={() => onMove('up')}
            >
              <ChevronUpIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Bajar un puesto"
              className="rounded border border-stone-300 p-1 disabled:opacity-30"
              disabled={busy || !canMoveDown}
              onClick={() => onMove('down')}
            >
              <ChevronDownIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Una sola línea: la sección, y al lado los dos botones. Corregir y quitar son
          iconos porque en una lista de doce filas los mismos dos rótulos repetidos doce
          veces son ruido, y porque así la línea entra en una pantalla estrecha con el
          selector al lado. Quitar pregunta antes, que es lo que hace que un icono sin
          rótulo pegado a otro no sea un peligro. */}
      {canEdit && (
        <div className="mt-2 flex items-center gap-2 border-t border-stone-200 pt-2">
          {/* A qué sección pertenece, y es un selector y no una flecha: la pertenencia
              dejó de ser la posición justo para que moverse y cambiar de sección fueran
              dos cosas distintas. Solo aparece si hay alguna sección — sin ninguna, la
              única respuesta posible es «suelta». */}
          {sectionChoices.length > 0 && !entry.retired && (
            <label className="min-w-0 flex-1">
              <span className="sr-only">Sección de este elemento</span>
              <select
                className="min-h-[2.5rem] w-full rounded border border-stone-300 bg-white px-2 text-sm"
                value={section ?? ''}
                disabled={busy}
                onChange={(event) =>
                  onSetSection(event.target.value === '' ? null : event.target.value)
                }
              >
                <option value="">Suelta</option>
                {sectionChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.heading}
                  </option>
                ))}
              </select>
            </label>
          )}
          {entry.retired && (
            <button
              type="button"
              className="text-sm text-stone-700 underline"
              disabled={busy}
              onClick={onRestore}
            >
              Volver a poner
            </button>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={open ? 'Cerrar la corrección' : 'Corregir'}
              aria-expanded={open}
              className={`flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded border border-stone-300 ${
                open ? 'bg-stone-800 text-white' : 'text-stone-700'
              }`}
              onClick={onToggleOpen}
            >
              <PenIcon className="h-5 w-5" />
            </button>
            {!entry.retired && (
              <button
                type="button"
                aria-label="Quitar del dossier"
                className="flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded border border-red-200 text-red-800 disabled:opacity-50"
                disabled={busy}
                onClick={onRemove}
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {canEdit && open && <ItemEditor row={row} showPrices={showPrices} onSave={onSave} />}
    </>
  )
}

/**
 * Corregir un elemento: su precio, su nota, y —en un texto o una sección— sus
 * palabras.
 *
 * El precio solo se ofrece cuando el dossier imprime precios, y eso no es esconder
 * un campo: un precio escrito en un dossier que no los imprime es trabajo que no va
 * a ninguna parte, y el interruptor que los enciende está a dos toques en la misma
 * pantalla. Lo que ya esté guardado se sigue viendo arriba, dicho como tal.
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
  const [divider, setDivider] = useState(row.divider_page ?? false)
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
    if (row.kind === 'SECTION') {
      patch.heading = heading.trim()
      patch.body = body.trim()
      patch.divider_page = divider
      if (patch.heading === '') {
        setProblem('Una sección necesita un rótulo: es el título del bloque.')
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

      {row.kind !== 'ARTWORK' && (
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
            <p className="mt-1 text-xs text-stone-500">Vacío: sale el nombre del artista.</p>
          )}
        </div>
      )}

      {(row.kind === 'TEXT' || row.kind === 'SECTION') && (
        <MarkupField
          label={row.kind === 'SECTION' ? 'Entradilla' : 'Párrafo'}
          value={body}
          rows="min-h-[5rem]"
          onChange={setBody}
        />
      )}

      {row.kind === 'SECTION' && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={divider}
            onChange={(event) => setDivider(event.target.checked)}
          />
          <span>
            Con página propia para el rótulo
            <span className="block text-xs text-stone-500">
              Gasta una hoja anunciando la sección. Sin esto, el rótulo encabeza su primera obra.
            </span>
          </span>
        </label>
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
