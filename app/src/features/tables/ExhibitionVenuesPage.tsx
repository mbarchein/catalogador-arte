import { useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { BanIcon, LoadingNotice, NoIcon, PenIcon, YesIcon } from '../../components/ui'
import type { ExhibitionVenue } from '../../lib/types'
import { useTableAction } from './MasterTableRow'
import {
  emptyVenueDraft,
  venueDraft,
  venueListNotice,
  venuePlaceNotice,
  type VenueDraft,
} from './exhibitionVenues'
import { useExhibitionVenues } from './useExhibitionVenues'

/**
 * The exhibition venues screen: creating, correcting and retiring them (RF-512,
 * RF-901, RF-1106, ADR-007).
 *
 * Until now a venue could only be created from SQL: the record already reads them
 * and links them — recording a show picks its venue from this table instead of
 * typing it — and the half that was missing is this one. You could read where an
 * artwork had been shown and not register the museum that showed it.
 *
 * **Why this is not the «Ubicaciones» screen, which is the question anybody who
 * sees both of them is going to ask.** Both answer «dónde», and that is all they
 * share. A place of the tree answers where the artwork IS TODAY: it is a container
 * («Castelar 4, almacén, estantería B, balda 2»), it changes when the studio gets
 * reorganized, and moving it moves everything inside it. A venue answers where a
 * show HAPPENED IN 1985: it contains nothing, it is historical, and a room that
 * closed in 1988 has to keep existing for ever because the exhibition that
 * happened in it did happen. Merging them would put «Balda 2» in the venue chooser
 * and the Museo del Prado in the warehouse tree (RF-512). Hence: no hierarchy and
 * no «Mover» here — a venue is not inside another venue.
 *
 * **The locality is on every row and is part of the identity.** The pair (name,
 * locality) is what the database holds unique, and it holds it because there is a
 * «Casa de Cultura» in every town: a list of the names alone would show the same
 * name twice with no way to tell which is which. That is also why editing a venue
 * opens a small form and not a single rename field — correcting «casa de cultura»
 * into «Casa de Cultura» while moving the town out of the name is ONE edit of one
 * venue, not two.
 *
 * **What this screen does NOT do is check the rules.** A repeated (name, locality),
 * a blank name, retiring a venue that still hosts exhibitions: all three are
 * refused by the database, and what shows up here is a sentence in Spanish with the
 * practical consequence (see `venueFailureText`, whose codes were provoked against
 * the base). No count of exhibitions is kept on this side — it would be a second
 * copy of the rule, out of step with the next show saved from a phone.
 *
 * The institution behind a venue (`party_id`) is not offered here: it is optional
 * in the schema, because a casa de cultura is a real venue with no institutional
 * record behind it, and choosing one needs the register of people and institutions.
 * A save from this screen leaves whatever link exists untouched rather than
 * blanking it.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */
export function ExhibitionVenuesPage() {
  const access = useEditingAccess()
  const { venues, loading, error, addVenue, saveVenue, setVenueActive } = useExhibitionVenues()
  // Shared with the other screens of the section: the same convention (null means
  // it worked) and the same reason for scrolling the message into view on a phone.
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState<VenueDraft>(emptyVenueDraft)

  const notice = venueListNotice({ loading, error, count: venues.length })

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Sedes de exposición" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Los sitios donde ocurrieron las muestras. Renombrar uno lo ven todas sus exposiciones.
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

      <section className="card mb-3 space-y-2">
        <h2 className="font-medium">Añadir</h2>
        <input
          className="field"
          value={creating.name}
          onChange={(e) => setCreating({ ...creating, name: e.target.value })}
          placeholder="Museo de Bellas Artes de Badajoz"
          aria-label="Nombre de la nueva sede"
        />
        {/* La localidad va aparte del nombre y no dentro: la ficha impresa compone
            «[año], [fechas], [título], [institución], [lugar]» (RF-502) y necesita
            el lugar suelto para escribirlo sin analizar nada. */}
        <input
          className="field"
          value={creating.locality}
          onChange={(e) => setCreating({ ...creating, locality: e.target.value })}
          placeholder="Badajoz"
          aria-label="Localidad de la nueva sede"
        />
        <input
          className="field"
          value={creating.country}
          onChange={(e) => setCreating({ ...creating, country: e.target.value })}
          placeholder="España"
          aria-label="País de la nueva sede"
        />
        <p className="text-xs text-stone-500">
          La localidad distingue dos sedes homónimas. Si ya existe se reutiliza.
        </p>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy || creating.name.trim() === ''}
          onClick={() =>
            void run(async () => {
              const message = await addVenue(creating)
              if (!message) setCreating(emptyVenueDraft())
              return message
            })
          }
        >
          Añadir sede
        </button>
      </section>

      {/* Nunca una página en blanco: una lista vacía explica qué es esta maestra,
          y sobre todo en qué se diferencia de las ubicaciones. Y mientras carga, o
          si la carga falló, NO afirma que no haya sedes. */}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      {/* Sin suscripción en vivo, como en las demás pantallas de la sección:
          `exhibition_venues` no está en la publicación de Realtime y añadirla
          sería un cambio en producción para servir a una pantalla que una sola
          persona usa para ordenar nombres. Cada acción de aquí recarga la lista. */}
      <ul className="space-y-1">
        {venues.map((venue) => (
          <VenueRow
            key={venue.id}
            venue={venue}
            busy={busy}
            onSave={(draft) => run(() => saveVenue(venue.id, draft))}
            onSetActive={(active) => void run(() => setVenueActive(venue.id, active))}
          />
        ))}
      </ul>
    </Layout>
  )
}

/**
 * One row: the venue, and correcting or retiring it.
 *
 * **This is not `MasterTableRow`, and it is not a copy of it.** That row edits ONE
 * field and shows ONE field, which is right for a vocabulary whose entry is a
 * name. A venue is identified by name AND locality, prints its country, and
 * carries a note: its reading state needs a second line to stop two «Casa de
 * Cultura» rows looking identical, and its editing state is a four-field form
 * rather than a rename box. Sharing a row with the vocabularies would mean a row
 * with a switch in it; what IS shared, because it is the same, is `useTableAction`
 * and the layout of the card.
 *
 * The draft is state OF THE ROW and not of the page: the page has no other use for
 * it, and an identifier travelling up and back down only to be compared with
 * itself is plumbing. The visible difference is that opening a second row does not
 * close the first, which is nobody's problem.
 */
function VenueRow({
  venue,
  busy,
  onSave,
  onSetActive,
}: {
  venue: ExhibitionVenue
  busy: boolean
  /** Answers whether it worked, which is when the form closes. */
  onSave: (draft: VenueDraft) => Promise<boolean>
  onSetActive: (active: boolean) => void
}) {
  const [draft, setDraft] = useState<VenueDraft | null>(null)

  return (
    <li
      // El nombre se lleva su línea y las acciones van debajo, alineadas a la
      // derecha: con los botones al lado, un nombre como «Museo de Bellas Artes de
      // Badajoz (MUBA)» se partía en varias líneas de dos palabras. El móvil es el
      // dispositivo principal.
      className={`card flex flex-wrap items-center gap-2 ${venue.active ? '' : 'opacity-60'}`}
    >
      {draft !== null ? (
        <>
          <div className="basis-full space-y-2">
            <input
              className="field"
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              aria-label={`Nombre de ${venue.name}`}
            />
            <input
              className="field"
              value={draft.locality}
              onChange={(e) => setDraft({ ...draft, locality: e.target.value })}
              placeholder="Localidad"
              aria-label={`Localidad de ${venue.name}`}
            />
            <input
              className="field"
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
              placeholder="País"
              aria-label={`País de ${venue.name}`}
            />
            {/* La nota está aquí y no en el formulario de alta: lo que dice una
                nota de sede —«la sala cerró en 1988»— se sabe después, no
                mientras se escribe el nombre del museo. */}
            <textarea
              className="field"
              rows={2}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Nota: la sala cerró en 1988…"
              aria-label={`Nota de ${venue.name}`}
            />
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Guardar la sede"
              title="Guardar"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                void onSave(draft).then((worked) => {
                  if (worked) setDraft(null)
                })
              }
            >
              <YesIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Dejar la sede como estaba"
              title="Dejar la sede como estaba"
              className="btn-secondary"
              onClick={() => setDraft(null)}
            >
              <NoIcon className="h-5 w-5" />
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="min-w-0 basis-full">
            <span className="block break-words font-medium">{venue.name}</span>
            {/* La localidad no es adorno: es la mitad de la identidad, y sin ella
                dos «Casa de Cultura» son la misma fila dos veces. */}
            <span className="block break-words text-xs text-stone-500">
              {venuePlaceNotice(venue)}
            </span>
            {venue.note.trim() !== '' && (
              <span className="block break-words text-xs text-stone-500">{venue.note}</span>
            )}
            {!venue.active && <span className="block text-xs text-stone-500">Retirada</span>}
          </span>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label={`Editar ${venue.name}`}
              title="Editar"
              className="btn-secondary"
              onClick={() => setDraft(venueDraft(venue))}
            >
              <PenIcon className="h-5 w-5" />
            </button>
            {venue.active ? (
              <button
                type="button"
                aria-label={`Retirar ${venue.name}`}
                title="Retirar"
                className="btn-secondary"
                disabled={busy}
                onClick={() => onSetActive(false)}
              >
                <BanIcon className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() => onSetActive(true)}
              >
                Recuperar
              </button>
            )}
          </div>
        </>
      )}
    </li>
  )
}
