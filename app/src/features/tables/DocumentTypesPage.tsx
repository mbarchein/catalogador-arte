import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { LoadingNotice } from '../../components/ui'
import { RETIRE_CONSEQUENCE, summarizeDocumentTypes } from './documentTypes'
import { MasterTableRow, useTableAction } from './MasterTableRow'
import { useDocumentTypes } from './useDocumentTypes'

/**
 * The archive document-types screen: creating, renaming and retiring them
 * (RF-515, RF-901, RF-1106, ADR-007).
 *
 * This is the half the archive form cannot give. A document's type is chosen from
 * a list, so the list has to be maintainable: «Recorte» becomes «Recorte de
 * prensa» in one edit that every document already filed reads, because they point
 * at the identifier and not at the text (ADR-007).
 *
 * **The vocabulary is NOT born empty**, unlike the artwork types: the migration
 * seeded the ten values the source document enumerated — Libro, Publicación,
 * Fotografía, Carta, Recorte de prensa, Manuscrito, Cartel, Díptico, Folleto, Nota
 * de prensa — so that the first document filed had something to choose from. Two
 * consequences for this screen, and both are why it does not look like the artwork
 * types one:
 *  - it opens with a list and never with «todavía no hay nada», so the count line
 *    under the title is what says where things stand, retired ones included;
 *  - retiring is the common gesture here, not adding, so what retiring does to the
 *    documents that already use a type is said BEFORE the tap and not after.
 *
 * A flat list and no «Mover», unlike the archival classification: a document type
 * is not inside another document type.
 *
 * **What this screen does NOT do is count documents.** Retiring a type that
 * documents still use is refused by the database, in Spanish and with a hint about
 * what to do first, and that pair is what shows up here. A count kept on this side
 * would be a second copy of the rule, out of step with the next document filed.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */
export function DocumentTypesPage() {
  const access = useEditingAccess()
  const { entries, loading, error, addType, renameType, setTypeActive } = useDocumentTypes()
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState('')

  const summary = useMemo(() => summarizeDocumentTypes(entries), [entries])

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Tipos de documento" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Lo que ofrece el campo «Tipo» de un documento. Renombrar uno lo ven todos los que lo usan.
      </p>

      {failure && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {/* Ya viene contado en español desde el hook, así que se muestra tal cual:
          pegarle un encabezado delante dejaba frases como «No se han podido
          cargar los tipos de documento: TypeError: Failed to fetch». */}
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
          placeholder="Invitación"
          aria-label="Nuevo tipo de documento"
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
          Añadir tipo de documento
        </button>
      </section>

      {/* Retirar es el gesto habitual en esta maestra, porque nace con diez valores
          puestos y algunos no se usarán nunca. Lo que le pasa a los documentos que
          ya tienen ese tipo se cuenta antes del toque, no después: la base avisa
          cuando hay documentos activos, pero lo de la papelera no lo dice nadie. */}
      {summary !== null && (
        <section className="mb-3 px-1">
          <p className="text-sm font-medium text-stone-700">{summary}</p>
          <p className="mt-1 text-xs text-stone-500">{RETIRE_CONSEQUENCE}</p>
        </section>
      )}

      {/* Never a blank page. Y aquí decir «todavía no hay ninguno» sería mentira: la
          lista nace con diez. Si sale vacía es que algo ha ido mal al cargarla, y
          eso es lo que se cuenta. */}
      {!loading && entries.length === 0 && (
        <p className="card text-sm text-stone-600">
          La lista está vacía y nació con diez. Vuelve a entrar; si sigue así, créalos aquí.
        </p>
      )}

      {/* No live subscription, as on the other screens of the section:
          `document_types` is not in the Realtime publication and adding it would be
          a production change to serve a screen one person uses to tidy up names.
          Every action here reloads the vocabulary. */}
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
