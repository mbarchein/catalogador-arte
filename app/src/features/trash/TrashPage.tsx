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
 * The wastebasket: seeing what is withdrawn and giving it back (RF-901, RF-902).
 *
 * It is the project's oldest pending item. The logical deletion has been in the schema since the
 * first migration —**never a real delete**— and until now there was no
 * screen from which to look inside: a withdrawn artwork or a withdrawn photograph
 * disappeared forever from the application's point of view, even though the row
 * was still whole in the base. An audit trace nobody can read protects the
 * data and helps nobody.
 *
 * ── THE CATALOGUER ONLY ──────────────────────────────────────────
 *
 * The policies already decide it in eighteen of the twenty-one tables —whoever only
 * consults receives empty lists, checked with their token—, but an empty list is not
 * an explanation, and in three master tables (`artwork_types`, `series`, `physical_places`)
 * their policy is a bare `can_read()` and a reader WOULD see the withdrawn rows. So
 * the screen does not exist for whoever does not catalogue, and the warning that those three
 * policies fall outside the pattern is noted for the owner, because the schema
 * is not touched from here.
 *
 * ── THERE IS NO PERMANENT DELETE, AND NONE IS ADDED ──────────────
 *
 * This screen shows and recovers. There is no «empty the wastebasket» or any
 * «delete forever», and its absence is the decision, not a gap: in this catalogue
 * nothing is really deleted, and a button like that would be the only way of losing an artwork.
 *
 * ── WHAT IS LEFT TO CHECK IN A BROWSER ───────────────────────────
 *
 * In this suite there is no DOM, so nothing is tested here: everything that decides something
 * —what is read on each line, when it can be recovered and what is said when it cannot— lives
 * in `trashKinds.ts`, `trashItems.ts` and `trashRestore.ts`, which are tested.
 */
export function TrashPage() {
  const access = useEditingAccess()
  const { views, loading, restore } = useTrash()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const failureRef = useRef<HTMLParagraphElement | null>(null)

  // A single reading of the clock for the whole list: if each line read the time on
  // its own, one painted on crossing midnight would say «ayer» next to another
  // saying «hoy» about the same moment.
  const now = useMemo(() => new Date(), [views])
  const total = useMemo(() => trashTotalText(views), [views])
  const blocked = useMemo(() => blockedCountText(views), [views])

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  const onRestore = (item: TrashItem) => {
    setBusy(true)
    setFailure(null)
    void restore(item).then((message) => {
      setBusy(false)
      setFailure(message)
      // The notice goes where the thumb is, not up out of sight: on a
      // phone, a message in the heading of a long list is not seen.
      if (message !== null) failureRef.current?.scrollIntoView({ block: 'center' })
    })
  }

  return (
    <Layout title="Papelera" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Todo lo retirado del catálogo. Nada se borra: todo esto se puede devolver a su sitio.
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
 * A group of the wastebasket.
 *
 * **Groups with nothing inside are said and not hidden.** It is the difference between
 * a wastebasket and a list of surprises: if «Obras y fotografías» does not appear, one does not
 * know whether none is withdrawn or whether the screen does not look at them. It appears, and says it
 * is empty.
 *
 * It arrives unfolded when it has something and folded when it does not: on a phone, four titles
 * with their count fit at a glance, and what is inside is read without one more tap.
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

/** A kind of thing with its lines. */
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
