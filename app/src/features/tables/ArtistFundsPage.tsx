import { useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { useAutoClear } from '../../components/useAutoClear'
import { LoadingNotice, Toast, Toggle } from '../../components/ui'
import { useTableAction } from './MasterTableRow'
import { useArtistFunds } from './useArtistFunds'
import {
  fundActiveNotice,
  fundHiddenNotice,
  fundListedHint,
  fundOfferedHint,
  fundPrefixText,
  fundRenamedNotice,
  retireFundBlockedReason,
  LISTED_LABEL,
  OFFERED_LABEL,
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
  useAutoClear(notice, () => setNotice(null))

  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  /** Runs the action and leaves what happened stated. `run` answers whether it went in. */
  async function act(said: string, write: () => Promise<string | null>) {
    setNotice(null)
    if (await run(write)) setNotice(said)
  }

  return (
    <Layout title="Fondos" back="/tables">
      {/* La confirmación, flotando y unos segundos. Era una tarjeta al principio de
          la pantalla, y aparecer empujaba la lista hacia abajo justo después de
          pulsar algo en una de sus filas: lo que se estaba mirando se movía de sitio.
          El error de abajo no flota ni se va: pide hacer algo. */}
      {notice && <Toast>{notice}</Toast>}
      <p className="mb-3 text-sm text-stone-600">
        Los conjuntos de obra del catálogo. El nombre se corrige aquí; el prefijo no se toca.
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
        No se dan de alta desde aquí: un fondo nuevo trae prefijo, y eso cambia el esquema.
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

          <button
            type="button"
            className="mt-2 min-h-touch text-sm text-stone-600 underline"
            disabled={busy}
            onClick={() => setDraft(entry.name)}
          >
            Cambiar el nombre
          </button>

          {/* Los dos rótulos nombran el estado normal y encendido es ese estado,
              así que la fila se lee de un vistazo: lo que está apagado es lo que
              se ha cambiado. El subtexto cuenta el estado en el que se está. */}
          <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
            <div>
              <Toggle
                label={OFFERED_LABEL}
                help={fundOfferedHint(entry.active)}
                active={entry.active}
                disabled={busy || blocked !== null}
                onChange={onSetActive}
              />
              {blocked && <p className="mt-1 text-xs text-amber-800">{blocked}</p>}
            </div>
            <Toggle
              label={LISTED_LABEL}
              help={fundListedHint(!entry.hideArtworks)}
              active={!entry.hideArtworks}
              disabled={busy}
              onChange={(listed) => onSetHidden(!listed)}
            />
          </div>
        </>
      )}
    </li>
  )
}
