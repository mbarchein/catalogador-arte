import { useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { LoadingNotice } from '../../components/ui'
import { useTableAction } from './MasterTableRow'
import { useArtistFunds } from './useArtistFunds'
import {
  fundActiveNotice,
  fundHiddenNotice,
  fundPrefixText,
  fundRenamedNotice,
  fundStateText,
  retireFundBlockedReason,
  HIDE_ARTWORKS_HINT,
  RETIRE_FUND_HINT,
  type ArtistFundEntry,
} from './artistFunds'

/**
 * Los fondos, mantenidos desde Tablas (RF-1106, RF-901, ADR-007 segunda entrega).
 *
 * Hace menos que las otras cinco maestras y el motivo está en `artistFunds.ts`: no
 * crea, no borra y no toca el prefijo. Lo que sí, y es lo que se pidió: renombrar,
 * retirar y apartar las obras — dos interruptores distintos, cada uno con su
 * explicación al lado, porque «deja de ofrecerse» y «sus obras no salen» se
 * confunden con facilidad y solo uno de los dos cambia lo que se ve del catálogo.
 *
 * No lleva fila compartida (`MasterTableRow`): esa fila es nombre + retirar, y aquí
 * hay un interruptor más y un prefijo que enseñar. Sí comparte `useTableAction`,
 * que es lo que ordena el «ocupado / fallo / desplaza al fallo».
 *
 * Catalogador solo. Quien solo consulta y llegue a la dirección se va al listado:
 * el fondo se lee desde cualquier obra, y aquí no hay nada que leer que no esté ahí.
 */
export function ArtistFundsPage() {
  const access = useEditingAccess()
  const { entries, loading, error, renameFund, setFundActive, setFundHidesArtworks } =
    useArtistFunds()
  const { busy, failure, failureRef, run } = useTableAction()
  const [notice, setNotice] = useState<string | null>(null)

  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  /** Corre la acción y deja dicho lo que ha pasado. `run` contesta si entró. */
  async function act(said: string, write: () => Promise<string | null>) {
    setNotice(null)
    if (await run(write)) setNotice(said)
  }

  return (
    <Layout title="Fondos" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Los conjuntos de obra del catálogo. El nombre se corrige aquí y lo ven todas sus obras. El
        prefijo de los identificadores no se toca: está impreso en la etiqueta pegada a cada obra.
      </p>

      {failure && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="card mb-3 text-sm text-stone-700">
          {notice}
        </p>
      )}

      {loading && entries.length === 0 && <LoadingNotice />}

      <ul className="space-y-3">
        {entries.map((entry) => (
          <FundRow
            key={entry.id}
            entry={entry}
            all={entries}
            busy={busy}
            onRename={(name) => void act(fundRenamedNotice(name), () => renameFund(entry.id, name))}
            onSetActive={(active) =>
              void act(fundActiveNotice(entry.name, active), () => setFundActive(entry.id, active))
            }
            onSetHidden={(hide) =>
              void act(fundHiddenNotice(entry.name, hide), () => setFundHidesArtworks(entry.id, hide))
            }
          />
        ))}
      </ul>

      {/* Por qué no hay «Añadir», dicho donde se busca el botón que falta. */}
      <p className="mt-4 text-xs text-stone-500">
        No se dan de alta fondos desde aquí: uno nuevo trae su propio prefijo, y ese prefijo entra
        en la numeración de las obras y en cómo se guardan sus ficheros de archivo. Es un cambio del
        esquema, no una fila.
      </p>
    </Layout>
  )
}

function FundRow({
  entry,
  all,
  busy,
  onRename,
  onSetActive,
  onSetHidden,
}: {
  entry: ArtistFundEntry
  all: readonly ArtistFundEntry[]
  busy: boolean
  onRename: (name: string) => void
  onSetActive: (active: boolean) => void
  onSetHidden: (hide: boolean) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const blocked = retireFundBlockedReason(entry, all)
  const state = fundStateText(entry)

  return (
    <li className={`card ${entry.active ? '' : 'opacity-70'}`}>
      {draft !== null ? (
        <div className="space-y-2">
          <input
            className="field"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Nombre del fondo ${entry.prefix}`}
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || draft.trim() === ''}
              onClick={() => {
                onRename(draft)
                setDraft(null)
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="font-medium">{entry.name}</p>
          {/* El prefijo explica qué fondo es esto mejor que su nombre: es lo que se
              lee en la etiqueta de la obra que se tiene delante. */}
          <p className="mt-0.5 text-xs text-stone-500">{fundPrefixText(entry.prefix)}</p>
          {state && <p className="mt-1 text-xs text-amber-800">{state}</p>}

          <button
            type="button"
            className="mt-2 min-h-touch text-sm text-stone-600 underline"
            disabled={busy}
            onClick={() => setDraft(entry.name)}
          >
            Cambiar el nombre
          </button>

          <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
            <Switch
              label={entry.active ? 'Se ofrece al dar de alta' : 'Retirado'}
              hint={RETIRE_FUND_HINT}
              checked={entry.active}
              disabled={busy || (entry.active && blocked !== null)}
              blocked={entry.active ? blocked : null}
              onChange={(next) => onSetActive(next)}
            />
            <Switch
              label={entry.hideArtworks ? 'Sus obras no salen en el listado' : 'Sus obras se listan'}
              hint={HIDE_ARTWORKS_HINT}
              checked={!entry.hideArtworks}
              disabled={busy}
              blocked={null}
              onChange={(next) => onSetHidden(!next)}
            />
          </div>
        </>
      )}
    </li>
  )
}

/** Un interruptor con su explicación debajo, y el motivo cuando no se puede tocar. */
function Switch({
  label,
  hint,
  checked,
  disabled,
  blocked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  /** Por qué está bloqueado, cuando lo está. */
  blocked: string | null
  onChange: (next: boolean) => void
}) {
  return (
    <div>
      <label className="flex min-h-touch items-center gap-3">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-sm font-medium">{label}</span>
      </label>
      <p className="ml-8 text-xs text-stone-500">{hint}</p>
      {blocked && <p className="ml-8 mt-1 text-xs text-amber-800">{blocked}</p>}
    </div>
  )
}
