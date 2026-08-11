import { useState } from 'react'
import type { DossierRow } from './dossierIndex'
import {
  issueButtonLabel,
  issueEntries,
  issuedNotice,
  issuesNotice,
} from './dossierIssues'
import type { DossierItemRow } from './dossierItems'
import { loadFundTexts, useDossierIssues } from './useDossierIssues'

/**
 * Emitir el PDF, y las versiones ya emitidas (RF-1607, RF-1608).
 *
 * **El botón dice qué versión va a emitir**, y ahí está dicho en tres palabras todo
 * el diseño: no se corrige nada, se hace otro documento, y el de marzo se queda
 * exactamente como se mandó.
 *
 * Los textos de los fondos se piden **en el momento de emitir** y no al abrir la
 * pantalla: es la mitad de RF-1608 —el dossier lee la ficha de hoy— y además una
 * pantalla que se abre veinte veces para mover obras no tiene por qué pagar dos
 * biografías cada vez.
 */
export function DossierIssues({
  dossier,
  items,
  canEdit,
}: {
  dossier: DossierRow
  items: readonly DossierItemRow[]
  canEdit: boolean
}) {
  const { issues, loading, error, issue, download } = useDossierIssues(dossier.id)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const entries = issueEntries(issues)
  const notice = issuesNotice({ loading, error, count: entries.length })

  async function emit() {
    setBusy(true)
    setProblem(null)
    setSaid(null)
    const funds = await loadFundTexts()
    const message = await issue({ dossier, items, funds })
    setBusy(false)
    if (message !== null) {
      setProblem(message)
      return
    }
    const next = entries[0] === undefined ? 1 : entries[0].version + 1
    setSaid(issuedNotice(next))
  }

  return (
    <div className="card mt-3 space-y-3">
      <p className="text-sm font-medium">El PDF</p>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      {said && <p className="text-sm text-emerald-800">{said}</p>}

      {canEdit && (
        <button
          type="button"
          className="min-h-[2.75rem] w-full rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void emit()}
        >
          {busy ? 'Generando el PDF…' : issueButtonLabel(issues)}
        </button>
      )}

      {notice && <p className="text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-2 border-t border-stone-200 pt-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{entry.label}</p>
              <p className="text-xs text-stone-600">
                {entry.when}
                {entry.size === null ? '' : ` · ${entry.size}`}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm"
              disabled={busy}
              onClick={() => {
                setProblem(null)
                const row = issues.find((candidate) => candidate.id === entry.id)
                // No hay aserción: la fila viene de esta misma lista, y si no está
                // es que la pantalla se ha recargado debajo, que no es un fallo que
                // contar.
                if (row === undefined) return
                void download(row, dossier.title).then((message) => setProblem(message))
              }}
            >
              Descargar
            </button>
          </li>
        ))}
      </ul>

      {/* Por qué no se puede corregir una versión, dicho donde se busca el botón que
          falta. */}
      {entries.length > 0 && (
        <p className="text-xs text-stone-500">
          Una versión emitida no se cambia ni se borra: el fichero ya está mandado. Para corregir se
          emite la siguiente.
        </p>
      )}
    </div>
  )
}
