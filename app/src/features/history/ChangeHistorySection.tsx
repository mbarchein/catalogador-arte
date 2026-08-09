import { useMemo, useState } from 'react'
import { ChevronRightIcon } from '../../components/ui'
import { changeDetail, changeSentence, groupChanges } from './changeEntry'
import { useChangeLog } from './useChangeLog'

/**
 * Cuándo pasó, en español y sin la hora cuando no hace falta.
 *
 * Se descompone la fecha a mano en la zona del navegador. Hoy y ayer se nombran
 * porque es lo que se está mirando el 90 % de las veces —«qué he tocado esta
 * mañana»— y una fecha completa para eso obliga a calcular mentalmente.
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
 * El historial de cambios de una obra y de sus fotografías (RF-1502, RF-1503).
 *
 * **Va en la ficha que se lee y no en la de editar**, y eso no contradice la regla
 * de que escribir vive en la zona de edición: aquí no se escribe nada. El historial
 * es un dato de la obra como sus medidas, y además es donde se consulta —se abre
 * para responder «quién cambió esto», que es una pregunta que se hace mirando la
 * ficha, no editándola. No es reversible por decisión del propietario: se lee, y
 * no hay ningún botón que devuelva un valor anterior.
 *
 * Llega **plegado y sin pedir nada**. Es la parte más pesada de la página —una
 * consulta que crece con la vida de la obra— y la ficha es la pantalla que más se
 * abre de toda la aplicación, muchas veces con datos del móvil.
 */
export function ChangeHistorySection({ catalogId }: { catalogId: string }) {
  const [open, setOpen] = useState(false)
  const { rows, loading, error, hasMore, loadMore } = useChangeLog(catalogId, open)
  const entries = useMemo(() => groupChanges(rows), [rows])
  // Una sola lectura del reloj para toda la lista: si cada línea leyera la hora por
  // su cuenta, una que se pintara al cruzar la medianoche diría «ayer» al lado de
  // otra que dice «hoy» sobre el mismo momento.
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
                      /* El antes y el después solo cuando el guardado tocó un campo:
                         con varios sería una tabla, y esto es una lista que se lee. */
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
