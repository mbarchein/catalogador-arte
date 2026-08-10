import { useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { LoadingNotice } from '../../components/ui'
import { useArtworkTypes } from '../artworks/useArtworkTypes'
import { MasterTableRow, useTableAction } from './MasterTableRow'

/**
 * The artwork types screen: creating, renaming and retiring them (RF-213,
 * RF-901, RF-1106, ADR-007).
 *
 * Adding a type was already possible from the record's form, where it is needed —
 * with the piece in front of you, «Collage-Décollage» has to be addable without
 * leaving the field. What was not possible was the other half: correcting a
 * spelling, or retiring a type nobody uses. That needed the name to stop being the
 * key, which is what ADR-007 did; now renaming is one row and the whole catalog
 * reads it.
 *
 * There is no «Mover» and no indentation, unlike the places: a type is not inside
 * another type. Three actions and a flat list, which is also why the screens are
 * two files and not one parameterized one.
 *
 * **What this screen does NOT do is count artworks.** Retiring a type that
 * twenty-one artworks use is refused by the database, in Spanish and with a hint
 * about what to do first, and that sentence is what shows up here. A count kept
 * here would be a second copy of the rule, out of step with the next artwork saved
 * from a phone.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */
export function ArtworkTypesPage() {
  const access = useEditingAccess()
  const { entries, loading, error, addType, renameType, setTypeActive } = useArtworkTypes()
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState('')

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Tipos de obra" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Lo que ofrece el campo «Tipo de obra». Renombrar uno lo ven todas sus obras.
      </p>

      {failure && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          No se han podido cargar los tipos de obra: {error}
        </p>
      )}

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Añadir</h2>
        <input
          className="field"
          value={creating}
          onChange={(e) => setCreating(e.target.value)}
          placeholder="Acuarela"
          aria-label="Nuevo tipo de obra"
        />
        <p className="mt-1 text-xs text-stone-500">
          Si ya existe se reutiliza, aunque cambien mayúsculas o tildes. Si estaba retirado, vuelve.
        </p>
        <button
          type="button"
          className="btn-primary mt-2 w-full"
          disabled={busy || creating.trim() === ''}
          onClick={() =>
            void run(async () => {
              const message = await addType(creating)
              if (!message) setCreating('')
              return message
            })
          }
        >
          Añadir tipo de obra
        </button>
      </section>

      {/* Never a blank page: an empty list says what to do, not nothing. */}
      {!loading && entries.length === 0 && (
        <p className="card text-sm text-stone-600">
          Todavía no hay ningún tipo de obra. El primero se crea aquí arriba.
        </p>
      )}

      {/* No live subscription, as on the places screen: `artwork_types` is not in
          the Realtime publication and adding it would be a production change to
          serve a screen one person uses to tidy up names. Every action here
          reloads the vocabulary. */}
      <ul className="space-y-1">
        {entries.map((entry) => (
          <MasterTableRow
            key={entry.id}
            entry={entry}
            busy={busy}
            retiredLabel="Retirado"
            onRename={(name) => run(() => renameType(entry.id, name))}
            onSetActive={(active) => void run(() => setTypeActive(entry.id, active))}
          />
        ))}
      </ul>
    </Layout>
  )
}
