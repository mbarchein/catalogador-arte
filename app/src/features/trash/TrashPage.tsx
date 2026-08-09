import { useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ChevronRightIcon, LoadingNotice, RevertIcon } from '../../components/ui'
import {
  blockedCountText,
  kindCountText,
  retiredTraceText,
  trashTotalText,
  type TrashItem,
  type TrashKindView,
} from './trashItems'
import { TRASH_GROUPS, type TrashGroupSpec } from './trashKinds'
import { useTrash } from './useTrash'

/**
 * La papelera: ver lo retirado y devolverlo (RF-901, RF-902).
 *
 * Es el pendiente más viejo del proyecto. La baja lógica está en el esquema desde la
 * primera migración —**nunca un borrado real**— y hasta ahora no había ninguna
 * pantalla desde la que mirar dentro: una obra retirada o una fotografía retirada
 * desaparecían para siempre desde el punto de vista de la aplicación, aunque la fila
 * siguiera entera en la base. Una traza de auditoría que nadie puede leer protege los
 * datos y no ayuda a nadie.
 *
 * ── SOLO QUIEN CATALOGA ──────────────────────────────────────────
 *
 * Las políticas ya lo deciden en dieciocho de las veintiuna tablas —quien solo
 * consulta recibe listas vacías, comprobado con su token—, pero una lista vacía no es
 * una explicación, y en tres maestras (`artwork_types`, `series`, `physical_places`)
 * su política es `can_read()` a secas y un lector SÍ vería las filas retiradas. Así
 * que la pantalla no existe para quien no cataloga, y el aviso de que esas tres
 * políticas se salen del patrón queda anotado para el propietario, porque el esquema
 * no se toca desde aquí.
 *
 * ── NO HAY BORRADO DEFINITIVO, Y NO SE AÑADE ─────────────────────
 *
 * Esta pantalla enseña y recupera. No hay ningún «vaciar la papelera» ni ningún
 * «borrar para siempre», y su ausencia es la decisión, no un hueco: en este catálogo
 * nada se borra de verdad, y un botón así sería la única forma de perder una obra.
 *
 * ── LO QUE QUEDA POR COMPROBAR EN NAVEGADOR ──────────────────────
 *
 * En esta batería no hay DOM, así que aquí no se prueba nada: todo lo que decide algo
 * —qué se lee en cada línea, cuándo se puede recuperar y qué se dice cuando no— vive
 * en `trashKinds.ts`, `trashItems.ts` y `trashRestore.ts`, que sí están probados.
 */
export function TrashPage() {
  const access = useEditingAccess()
  const { views, loading, restore } = useTrash()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const failureRef = useRef<HTMLParagraphElement | null>(null)

  // Una sola lectura del reloj para toda la lista: si cada línea leyera la hora por
  // su cuenta, una que se pintara al cruzar la medianoche diría «ayer» al lado de otra
  // que dice «hoy» sobre el mismo momento.
  const now = useMemo(() => new Date(), [views])
  const total = useMemo(() => trashTotalText(views), [views])
  const blocked = useMemo(() => blockedCountText(views), [views])

  // La espera importa: el rol llega después de la sesión, así que decidir en el
  // primer render echaría a quien sí puede. Ver useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  const onRestore = (item: TrashItem) => {
    setBusy(true)
    setFailure(null)
    void restore(item).then((message) => {
      setBusy(false)
      setFailure(message)
      // El aviso se pone donde está el pulgar, no arriba fuera de la vista: en un
      // móvil, un mensaje en la cabecera de una lista larga no se ve.
      if (message !== null) failureRef.current?.scrollIntoView({ block: 'center' })
    })
  }

  return (
    <Layout title="Papelera" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Aquí está todo lo que se ha retirado del catálogo. Nada se borra nunca de verdad, así que
        todo lo de esta lista se puede devolver a su sitio.
      </p>

      {failure !== null && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}

      {loading && views.length === 0 && (
        <p role="status" className="text-sm text-stone-500">
          Mirando qué hay en la papelera…
        </p>
      )}

      {!loading && (
        <section className="mb-4 px-1">
          <p className="text-sm font-medium text-stone-700">{total}</p>
          {blocked !== null && <p className="mt-1 text-xs text-stone-500">{blocked}</p>}
        </section>
      )}

      {TRASH_GROUPS.map((group) => (
        <TrashGroupSection
          key={group.id}
          group={group}
          views={views.filter((view) => view.spec.group === group.id)}
          now={now}
          busy={busy}
          onRestore={onRestore}
        />
      ))}
    </Layout>
  )
}

/**
 * Un grupo de la papelera.
 *
 * **Los grupos sin nada dentro se dicen y no se esconden.** Es la diferencia entre
 * una papelera y una lista de sorpresas: si «Obras y fotografías» no aparece, no se
 * sabe si no hay ninguna retirada o si la pantalla no las mira. Aparece, y dice que
 * está vacío.
 *
 * Llega desplegado cuando tiene algo y plegado cuando no: en un móvil, cuatro títulos
 * con su cuenta caben de un vistazo, y lo que hay dentro se lee sin un toque más.
 */
function TrashGroupSection({
  group,
  views,
  now,
  busy,
  onRestore,
}: {
  group: TrashGroupSpec
  views: readonly TrashKindView[]
  now: Date
  busy: boolean
  onRestore: (item: TrashItem) => void
}) {
  const count = views.reduce((sum, view) => sum + view.items.length, 0)
  const problems = views.filter((view) => view.error !== null)

  return (
    <section className="mb-4">
      <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-stone-500">
        {group.title}
      </h2>
      <p className="mb-2 px-1 text-xs text-stone-500">{group.hint}</p>

      {problems.map((view) => (
        <p key={view.spec.id} role="alert" className="card mb-2 text-sm text-red-700">
          {view.error}
        </p>
      ))}

      {count === 0 && problems.length === 0 && (
        <p className="card text-sm text-stone-600">
          Nada retirado de este grupo.
        </p>
      )}

      {views
        .filter((view) => view.items.length > 0)
        .map((view) => (
          <TrashKindSection
            key={view.spec.id}
            view={view}
            now={now}
            busy={busy}
            onRestore={onRestore}
          />
        ))}
    </section>
  )
}

/** Una clase de cosa con sus líneas. */
function TrashKindSection({
  view,
  now,
  busy,
  onRestore,
}: {
  view: TrashKindView
  now: Date
  busy: boolean
  onRestore: (item: TrashItem) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="card mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-medium text-stone-800">
            {kindCountText(view.spec, view.items.length)}
          </span>
          {view.truncated && (
            <span className="block text-xs text-stone-500">
              Se muestran las últimas que se retiraron; hay más esperando.
            </span>
          )}
        </span>
        <ChevronRightIcon
          className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <ul className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          {view.items.map((item) => (
            <TrashLine
              key={`${item.kind}:${item.key}`}
              item={item}
              now={now}
              busy={busy}
              onRestore={onRestore}
            />
          ))}
        </ul>
      )}

      {/* Las nueve maestras se recuperan también desde su propia pantalla, donde se
          ve la lista entera y sus reglas de nombre. Se enlaza en vez de callarlo: la
          papelera es un sitio desde el que mirarlo todo junto, no la única puerta. */}
      {open && view.spec.ownScreen !== undefined && (
        <Link
          to={view.spec.ownScreen}
          className="mt-3 block text-sm text-stone-500 underline active:text-stone-800"
        >
          Ver la lista completa de {view.spec.many}
        </Link>
      )}
    </div>
  )
}

/**
 * Una línea: qué es, de qué cuelga, quién la retiró y cuándo, y el botón.
 *
 * **El motivo por el que algo no se puede recuperar ocupa el sitio del botón**, no un
 * aviso al lado. Un botón que se puede pulsar y contesta que no se podía es la forma
 * más rápida de enseñar a la usuaria a no leer los avisos.
 */
function TrashLine({
  item,
  now,
  busy,
  onRestore,
}: {
  item: TrashItem
  now: Date
  busy: boolean
  onRestore: (item: TrashItem) => void
}) {
  return (
    <li>
      <p className="break-words font-medium text-stone-800">{item.label}</p>
      {item.context !== '' && <p className="break-words text-sm text-stone-600">{item.context}</p>}
      <p className="text-xs text-stone-500">{retiredTraceText(item, now)}</p>

      {item.blocked !== null ? (
        <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{item.blocked}</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRestore(item)}
          className="btn-secondary mt-1.5 flex min-h-touch w-full items-center justify-center gap-2 text-sm disabled:opacity-60"
        >
          <RevertIcon className="h-5 w-5" />
          Recuperar
        </button>
      )}
    </li>
  )
}
