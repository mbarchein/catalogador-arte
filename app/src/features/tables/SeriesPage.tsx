import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { Chips } from '../../components/ui'
import { groupByFund } from '../../lib/masterTables'
import { ARTIST_FUNDS, ARTIST_LABEL, type ArtistFund } from '../../lib/types'
import { useSeries } from '../artworks/useSeries'
import { MasterTableRow, useTableAction } from './MasterTableRow'

const FUNDS = ARTIST_FUNDS.map((fund) => ({ value: fund, text: ARTIST_LABEL[fund] }))

/**
 * The series screen: creating, renaming and retiring them (RF-213, RF-901,
 * RF-1106, ADR-007).
 *
 * **The fund is on every row and is chosen when adding.** A series belongs to one
 * artist, and the pair (fund, name) is what is unique: two funds may each have a
 * «Retratos del taller» and they are two different series. Listing the names alone
 * would show the same name twice with no way to tell which is which, and offering
 * a name without saying whose it is invites filing a Ruiz Campins piece under a
 * Rotili series — which the database refuses when saving the artwork, after the
 * cataloger has already typed everything else.
 *
 * **And the fund of an existing series is not editable.** The database would
 * accept the change; what it would not accept is the state it leaves behind, with
 * every artwork of that series pointing at a series of another fund. Moving a
 * series between funds means moving its artworks, which is a job for the records
 * and not for this list.
 *
 * Retiring a series that still has artworks inside is refused by the database, and
 * that sentence is what shows up here: no count is kept on this side.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */
export function SeriesPage() {
  const { canEdit, roleKnown } = useAuth()
  const { entries, loading, error, addSeries, renameSeries, setSeriesActive } = useSeries()
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState('')
  // The fund the new series goes to. It starts on the first one rather than empty
  // so the form is never in a state where the button is disabled for a reason
  // that is not the name; changing it is one tap.
  const [fund, setFund] = useState<ArtistFund>(ARTIST_FUNDS[0] as ArtistFund)

  const groups = useMemo(() => groupByFund(entries), [entries])

  // Hasta que el perfil llega, el rol no es «no»: es que todavía no se sabe. Sin
  // esta espera, entrar por la pestaña con la aplicación recién abierta rebotaba
  // al listado, porque `canEdit` arranca en falso. Lo que protege de verdad son
  // las políticas RLS; esto solo evita echar a quien sí puede.
  if (!roleKnown) {
    return <div className="p-8 text-center text-sm text-stone-600">Cargando…</div>
  }
  if (!canEdit) return <Navigate to="/" replace />

  return (
    <Layout title="Series" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Las series de cada fondo. Renombrar una se hace una vez y lo ven todas sus obras.
      </p>

      {failure && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          No se han podido cargar las series: {error}
        </p>
      )}

      <section className="card mb-3 space-y-3">
        <h2 className="font-medium">Añadir</h2>
        <Chips id="new-series-fund" label="Fondo" options={FUNDS} value={fund} onChange={setFund} />
        <div>
          <input
            className="field"
            value={creating}
            onChange={(e) => setCreating(e.target.value)}
            placeholder="Retratos del taller"
            aria-label="Nueva serie"
          />
          <p className="mt-1 text-xs text-stone-500">
            La serie se crea en el fondo elegido arriba, y el fondo no se cambia después. Si ya
            existe en ese fondo se reutiliza; si estaba retirada, vuelve.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy || creating.trim() === ''}
          onClick={() =>
            void run(async () => {
              const message = await addSeries(creating, fund)
              if (!message) setCreating('')
              return message
            })
          }
        >
          Añadir serie a {ARTIST_LABEL[fund]}
        </button>
      </section>

      {/* Never a blank page: an empty list says what to do, not nothing. */}
      {!loading && entries.length === 0 && (
        <p className="card text-sm text-stone-600">
          Todavía no hay ninguna serie. La primera se crea aquí arriba.
        </p>
      )}

      {/* No live subscription, as on the places screen: `series` is not in the
          Realtime publication and adding it would be a production change to serve
          a screen one person uses to tidy up names. Every action here reloads the
          vocabulary. */}
      {groups.map(({ fund: groupFund, entries: rows }) => (
        <section key={groupFund} className="mb-3">
          <h2 className="mb-1 px-1 text-sm font-medium uppercase tracking-wide text-stone-500">
            {ARTIST_LABEL[groupFund]}
          </h2>
          <ul className="space-y-1">
            {rows.map((entry) => (
              <MasterTableRow
                key={entry.id}
                entry={entry}
                busy={busy}
                retiredLabel="Retirada"
                onRename={(name) => run(() => renameSeries(entry.id, name))}
                onSetActive={(active) => void run(() => setSeriesActive(entry.id, active))}
              />
            ))}
          </ul>
        </section>
      ))}
    </Layout>
  )
}
