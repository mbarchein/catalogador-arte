import { useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { LoadingNotice } from '../../components/ui'
import { MasterTableRow, useTableAction } from './MasterTableRow'
import { usePublicationTypes } from './usePublicationTypes'

/**
 * The publication-types screen: creating, renaming and retiring them (RF-514,
 * RF-901, RF-1106, ADR-007).
 *
 * The vocabulary already existed and the record already reads it — a reference is
 * typed by choosing from this list — but until now it could only be filled from
 * SQL. Six seeded values do not survive the first month of real research
 * («catálogo de subasta», «entrada de blog», «programa de radio»), and RF-514 is
 * explicit that the cataloger widens the list without anyone deploying anything.
 * This is that half.
 *
 * The same three actions and the same flat list as the artwork types, down to the
 * shared row: a publication type is not inside another publication type, so there
 * is no «Mover» and no indentation. It is deliberately NOT a parameterized screen
 * — there are four of these vocabularies now and the shape they share is only
 * visible once the four exist.
 *
 * **What this screen does not do is count references.** Retiring a type that
 * still classifies some is refused by the database, in Spanish and with a hint
 * about what to do first, and that sentence is what shows up here. A count kept on
 * this side would be a second copy of the rule.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list:
 * the types are readable from any reference, and nothing here is.
 */
export function PublicationTypesPage() {
  const access = useEditingAccess()
  const { entries, loading, error, addType, renameType, setTypeActive } = usePublicationTypes()
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState('')

  // La espera importa: el rol llega después de la sesión, así que decidir en el
  // primer render echaría a quien sí puede. Ver useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Tipos de publicación" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Lo que ofrece el campo «Tipo» de cada referencia de la bibliografía. Renombrar uno se hace
        una vez y lo ven todas las referencias que lo usan.
      </p>

      {failure && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {/* Ya viene contado en español desde el hook, así que se muestra tal cual. */}
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Añadir</h2>
        <input
          className="field"
          value={creating}
          onChange={(e) => setCreating(e.target.value)}
          placeholder="Catálogo de subasta"
          aria-label="Nuevo tipo de publicación"
        />
        <p className="mt-1 text-xs text-stone-500">
          Si ya existe se reutiliza, aunque esté escrito con otras mayúsculas o tildes. Si estaba
          retirado, vuelve.
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
          Añadir tipo de publicación
        </button>
      </section>

      {/* Nunca una página en blanco: una maestra vacía cuenta qué es y para qué la
          usa el catálogo, no se queda en silencio. Pasa poco —la lista se creó con
          seis valores— pero retirarlos todos es posible. */}
      {!loading && entries.length === 0 && (
        <p className="card text-sm text-stone-600">
          Todavía no hay ningún tipo de publicación. Es lo que dice qué clase de publicación es
          cada referencia de la bibliografía —un libro, un artículo de revista, un catálogo de
          exposición, una tesis—, y sin ninguno el tipo de las referencias se queda en blanco. El
          primero se crea aquí arriba.
        </p>
      )}

      {/* No hay suscripción en vivo, como en las otras maestras: esta tabla no está
          en la publicación de Realtime, y añadirla sería un cambio en producción
          para una pantalla que usa una persona a ordenar nombres. Cada acción de
          aquí recarga la lista. */}
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
