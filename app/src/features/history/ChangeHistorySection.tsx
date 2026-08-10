import { useMemo, useState } from 'react'
import { ChevronRightIcon } from '../../components/ui'
import { changeDetail, changeSentence, groupChanges } from './changeEntry'
import { useChangeLog } from './useChangeLog'

/**
 * When it happened, in Spanish and without the time when it is not needed.
 *
 * The date is decomposed by hand in the browser's zone. Today and yesterday are named
 * because it is what is being looked at 90 % of the time —«what have I touched this
 * morning»— and a full date for that forces mental arithmetic.
 */
function whenText(iso: string, now: Date): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'en una fecha que no se ha podido leer'
  const hora = at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const dia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const ayer = new Date(now)
  ayer.setDate(ayer.getDate() - 1)
  if (dia(at) === dia(now)) return `hoy a las ${hora}`
  if (dia(at) === dia(ayer)) return `ayer a las ${hora}`
  const fecha = at.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return `el ${fecha} a las ${hora}`
}

/**
 * The change history of an artwork and of its photographs (RF-1502, RF-1503).
 *
 * **It goes in the record that is read and not in the editing one**, and that does not contradict the rule
 * that writing lives in the editing area: nothing is written here. The history
 * is a datum of the artwork like its measurements, and besides it is where it is consulted —it is opened
 * to answer «who changed this», which is a question asked while looking at the
 * record, not editing it. It is not reversible by the owner's decision: it is read, and
 * there is no button that gives back a previous value.
 *
 * It arrives **folded and asking for nothing**. It is the heaviest part of the page —a
 * query that grows with the artwork's life— and the record is the most opened screen
 * in the whole application, many times on mobile data.
 */
export function ChangeHistorySection({ catalogId }: { catalogId: string }) {
  const [open, setOpen] = useState(false)
  const { rows, loading, error, hasMore, loadMore } = useChangeLog(catalogId, open)
  const entries = useMemo(() => groupChanges(rows), [rows])
  // A single reading of the clock for the whole list: if each line read the time on
  // its own, one painted on crossing midnight would say «ayer» next to
  // another saying «hoy» about the same moment.
  const now = useMemo(() => new Date(), [entries])

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="font-medium text-stone-800">Historial de cambios</span>
          <span className="block text-xs text-stone-500">
            Quién cambió qué y cuándo, en esta obra y en sus fotografías
          </span>
        </span>
        <ChevronRightIcon
          className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          {loading && rows.length === 0 && (
            <p role="status" className="text-sm text-stone-500">
              Leyendo el historial…
            </p>
          )}

          {error !== null && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {/* Vacío explicado y no un hueco: un historial sin líneas casi nunca
              significa que no ha pasado nada, significa que la obra no se ha tocado
              desde que el registro existe. Decir lo primero sería mentir sobre las
              obras catalogadas antes. */}
          {!loading && error === null && entries.length === 0 && (
            <p className="text-sm text-stone-500">
              Sin cambios registrados. El historial empieza el 5 de agosto de 2026.
            </p>
          )}

          {entries.length > 0 && (
            <ol className="space-y-2.5">
              {entries.map((entry) => {
                const detail = changeDetail(rows, entry)
                return (
                  <li key={entry.changeId} className="text-sm">
                    <p className="text-stone-800">{changeSentence(entry)}</p>
                    <p className="text-xs text-stone-500">{whenText(entry.changedAt, now)}</p>
                    {detail !== null && (
                      /* The before and after only when the save touched one field:
                         with several it would be a table, and this is a list that is read. */
                      <p className="mt-0.5 text-xs text-stone-600">
                        <span className="text-stone-400 line-through">{detail.before}</span>
                        {' → '}
                        <span>{detail.after}</span>
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="btn-secondary mt-3 w-full text-sm disabled:opacity-60"
            >
              {loading ? 'Leyendo…' : 'Ver cambios más antiguos'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
