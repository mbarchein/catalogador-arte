import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import {
  BanIcon,
  Chips,
  InfoNote,
  LoadingNotice,
  NoIcon,
  PenIcon,
  YesIcon,
} from '../../components/ui'
import { useTableAction } from './MasterTableRow'
import {
  CONTACT_DETAIL,
  CONTACT_NOTICE,
  CONTACT_STATUS_OPTIONS,
  PARTY_TYPE_OPTIONS,
  contactFieldNotice,
  contactText,
  emptyPartyDraft,
  filterParties,
  partyDraft,
  partyListNotice,
  partySubtitle,
  sortParties,
  summarizeParties,
  type PartyDraft,
  type PartyListRow,
} from './parties'
import { usePartiesAdmin } from './usePartiesAdmin'
import { CONTACT_STATUS_LABEL } from '../../lib/types'

/**
 * The people and institutions screen: creating, correcting and retiring the
 * records the whole catalogue hangs off (RF-508, RF-105, RF-901, RF-1106,
 * ADR-007).
 *
 * Until today these could only be created from SQL. The record already reads them
 * and links them — a chain of provenance picks its owner from here, a venue names
 * the institution behind it, an artwork names its rights holder — and the half that
 * was missing is this one: you could read the provenance of an artwork and not
 * register the museum that holds it.
 *
 * **One list for people and for institutions, not two.** RF-508 decided that, and
 * the reason survives into the screen: half the fields are the same, and a family
 * collection turns into a foundation without stopping being the same link of the
 * chain — which here is one tap on the type, not retiring a record and creating
 * another. The type is on every row because the provenance line depends on it
 * («Colección privada, España» against the credits of a public institution), and it
 * has no «Sin revisar» on purpose: a datum a sentence is composed from cannot stay
 * pending.
 *
 * **The contact is not painted, and that is a decision with its reason on screen.**
 * Measured against the base: any authenticated Reader can read `parties.contact`,
 * because RF-105 says so out loud and there is no restriction by field — so hiding
 * it here is NOT a security barrier and this screen does not pretend it is. What it
 * protects against is the thing that actually happens: this screen gets opened to
 * fix the spelling of a museum, on a phone, with the owner of the piece standing
 * next to you, and a list that paints forty telephone numbers hands out forty third
 * parties' personal data for a job that needed none of them. So it is asked for one
 * record at a time, with «Ver contacto», and `CONTACT_NOTICE` says whose datum it is
 * and who else reads it. The full argument is in the header of `parties.ts`.
 *
 * **And a retirement that the database refuses says WHERE.** The other five screens
 * of the section show the refusal and stop, which is right for a vocabulary. Here it
 * is not enough: `tg_party_deactivation` checks provenance, then rights holder, then
 * venue, and raises on the first one it finds, so the sentence can be hiding two
 * more uses and it never names an artwork. «No se puede retirar» without saying
 * where means opening every record of the catalogue by hand. The uses are looked up
 * AFTER the refusal, which is why they are not a second copy of the rule: asked at
 * the moment the answer is needed, they cannot be stale.
 *
 * **What this screen does NOT check** is any rule the database holds: one record per
 * normalized name, no blank name, no retiring what is in use. Those live next to the
 * data and what shows up here is their sentence (see `partyFailureText`, whose codes
 * were provoked against the base one by one).
 *
 * It has a search box, and it is the only one of the six that does: the register of
 * owners of a catalogue raisonné reaches hundreds of rows while the vocabularies stay
 * at a dozen.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */
export function PartiesPage() {
  const access = useEditingAccess()
  const { parties, loading, error, loadContact, addParty, saveParty, setPartyActive } =
    usePartiesAdmin()
  // Shared with the other screens of the section: the same convention (null means
  // it worked) and the same reason for scrolling the message into view on a phone.
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState<PartyDraft>(emptyPartyDraft)
  const [query, setQuery] = useState('')

  const shown = useMemo(() => sortParties(filterParties(parties, query)), [parties, query])
  const notice = partyListNotice({
    loading,
    error,
    total: parties.length,
    shown: shown.length,
    query,
  })
  const count = summarizeParties(parties)

  // La espera importa: el rol llega después de la sesión, así que decidir en el
  // primer render echaría a quien sí puede. Ver useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Personas e instituciones" back="/tables">
      <p className="mb-1 text-sm text-stone-600">
        Quién ha tenido cada obra, quién presta y de quién son los derechos.
      </p>
      {count && <p className="mb-1 text-sm font-medium text-stone-700">{count}</p>}
      {/* El aviso del dato personal va arriba y una sola vez, no en cada fila: es
          lo que hace falta saber ANTES de escribir un teléfono en un catálogo que
          otras personas consultan. */}
      <p className="mb-3 flex items-start gap-1 text-xs text-stone-500">
        <span className="min-w-0">{CONTACT_NOTICE}</span>
        <InfoNote title="El contacto" className="-mt-1 shrink-0">
          <p>{CONTACT_DETAIL}</p>
        </InfoNote>
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

      <section className="card mb-3 space-y-3">
        <h2 className="font-medium">Añadir</h2>
        {/* Persona o institución no admite «Sin revisar» (RF-508): de este valor
            depende cómo se redacta la línea de procedencia. */}
        <Chips
          id="new-party-type"
          label="¿Persona o institución?"
          options={PARTY_TYPE_OPTIONS}
          value={creating.party_type}
          onChange={(party_type) => setCreating({ ...creating, party_type })}
        />
        <input
          className="field"
          value={creating.name}
          onChange={(e) => setCreating({ ...creating, name: e.target.value })}
          placeholder="Museo de Bellas Artes de Badajoz (MUBA)"
          aria-label="Nombre de la nueva ficha"
        />
        {/* Localidad y país sueltos, no una dirección en un texto: son justo lo
            que la línea publicable necesita por separado para escribir
            «Colección privada, España» sin analizar nada (RF-508). */}
        <input
          className="field"
          value={creating.locality}
          onChange={(e) => setCreating({ ...creating, locality: e.target.value })}
          placeholder="Badajoz"
          aria-label="Localidad de la nueva ficha"
        />
        <input
          className="field"
          value={creating.country}
          onChange={(e) => setCreating({ ...creating, country: e.target.value })}
          placeholder="España"
          aria-label="País de la nueva ficha"
        />
        <p className="text-xs text-stone-500">
          Una ficha por nombre. Dos homónimos se distinguen escribiéndolo: «Juan Pérez (Badajoz)».
        </p>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy || creating.name.trim() === ''}
          onClick={() =>
            void run(async () => {
              const message = await addParty(creating)
              if (!message) setCreating(emptyPartyDraft())
              return message
            })
          }
        >
          Añadir ficha
        </button>
      </section>

      {/* El buscador es de esta maestra y no de las otras cinco: el registro de
          propietarios de un catálogo razonado llega a cientos de fichas, y los
          vocabularios se quedan en una docena. Busca por nombre, localidad y país
          —nunca por contacto, que no está cargado. */}
      <input
        type="search"
        className="field mb-3"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, localidad o país"
        aria-label="Buscar una ficha"
      />

      {/* Nunca una página en blanco: mientras carga no afirma que el registro esté
          vacío, una búsqueda sin resultados no dice que no haya fichas, y el
          registro vacío explica qué es. */}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      {/* Sin suscripción en vivo, como en las demás pantallas de la sección:
          `parties` no está en la publicación de Realtime y añadirla sería un cambio
          en producción para servir a una pantalla que una sola persona usa para
          ordenar nombres. Cada acción de aquí recarga la lista. */}
      <ul className="space-y-1">
        {shown.map((party) => (
          <PartyRow
            key={party.id}
            party={party}
            busy={busy}
            onLoadContact={() => loadContact(party.id)}
            onSave={(opened, draft) => run(() => saveParty(party.id, opened, draft))}
            onSetActive={(active) => void run(() => setPartyActive(party.id, active))}
          />
        ))}
      </ul>
    </Layout>
  )
}

/**
 * One row: the record, and reading its contact, correcting it or retiring it.
 *
 * **This is not `MasterTableRow`, and it is not a copy of it.** That row shows one
 * field and edits one field, which is right for a vocabulary whose entry is a name.
 * A party is a record: two lines of identity, a contact status, a note, a form of
 * six fields — and one datum that must be fetched before it can be edited and must
 * not be written when it was not. What IS shared, because it is the same, is
 * `useTableAction` and the layout of the card.
 *
 * **The contact is asked for and not painted**, both to read it and to edit it, and
 * the two paths share `withContact`. If the fetch fails while editing, the form
 * still opens: the name of a museum can be corrected without its telephone number,
 * and the field says why it is off and that saving leaves it as it was.
 *
 * The state is state OF THE ROW: the page has no other use for it, and an identifier
 * travelling up and back down only to be compared with itself is plumbing. The
 * visible difference is that opening a second row does not close the first, which is
 * nobody's problem.
 */
function PartyRow({
  party,
  busy,
  onLoadContact,
  onSave,
  onSetActive,
}: {
  party: PartyListRow
  busy: boolean
  onLoadContact: () => Promise<{ contact: string } | { error: string }>
  /** Answers whether it worked, which is when the form closes. */
  onSave: (opened: PartyDraft, draft: PartyDraft) => Promise<boolean>
  onSetActive: (active: boolean) => void
}) {
  /** The form, with the draft AS IT OPENED next to the one being typed. */
  const [editing, setEditing] = useState<{ opened: PartyDraft; draft: PartyDraft } | null>(null)
  /** The contact, once asked for, while reading the row. */
  const [revealed, setRevealed] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [contactFailure, setContactFailure] = useState<string | null>(null)

  /**
   * Asks for the contact and hands it over, or null when it could not be read.
   *
   * The message stays in the row and does not go to the page's alert: the button
   * that caused it is right here, and this is the one failure of the screen that
   * does not stop anything else from working.
   */
  async function withContact(): Promise<string | null> {
    setAsking(true)
    setContactFailure(null)
    const answer = await onLoadContact()
    setAsking(false)
    if ('error' in answer) {
      setContactFailure(answer.error)
      return null
    }
    return answer.contact
  }

  return (
    <li
      // El nombre se lleva su línea y las acciones van debajo, alineadas a la
      // derecha: con los botones al lado, un nombre como «Museo de Arte
      // Contemporáneo Vicente Aguilera Cerni (MACVA)» se partía en varias líneas
      // de dos palabras. El móvil es el dispositivo principal.
      className={`card flex flex-wrap items-center gap-2 ${party.active ? '' : 'opacity-60'}`}
    >
      {editing !== null ? (
        <>
          <div className="basis-full space-y-3">
            <Chips
              id={`party-type-${party.id}`}
              label="¿Persona o institución?"
              options={PARTY_TYPE_OPTIONS}
              value={editing.draft.party_type}
              onChange={(party_type) =>
                setEditing({ ...editing, draft: { ...editing.draft, party_type } })
              }
            />
            <input
              className="field"
              autoFocus
              value={editing.draft.name}
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
              aria-label={`Nombre de ${party.name}`}
            />
            <input
              className="field"
              value={editing.draft.locality}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, locality: e.target.value } })
              }
              placeholder="Localidad"
              aria-label={`Localidad de ${party.name}`}
            />
            <input
              className="field"
              value={editing.draft.country}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, country: e.target.value } })
              }
              placeholder="País"
              aria-label={`País de ${party.name}`}
            />
            <div>
              <label className="label" htmlFor={`party-contact-${party.id}`}>
                Contacto
              </label>
              {/* Apagado cuando no se pudo leer, y al guardar la columna no viaja:
                  «no leer el dato personal» no puede convertirse en «borrarlo». */}
              <textarea
                id={`party-contact-${party.id}`}
                className="field"
                rows={2}
                disabled={editing.draft.contact === null}
                value={editing.draft.contact ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, draft: { ...editing.draft, contact: e.target.value } })
                }
                placeholder="655 000 000 · alguien@museo.test"
              />
              <p className="mt-1 text-xs text-stone-500">
                {contactFieldNotice(editing.draft.contact !== null)}
              </p>
            </div>
            {/* El estado del contacto es un progreso, no una clasificación, y por
                eso los chips van en el orden del enumerado. Es dato de trabajo de
                la investigadora: lo que evita escribir dos veces la misma carta. */}
            <Chips
              id={`party-contact-status-${party.id}`}
              label="Estado del contacto"
              options={CONTACT_STATUS_OPTIONS}
              value={editing.draft.contact_status}
              onChange={(contact_status) =>
                setEditing({ ...editing, draft: { ...editing.draft, contact_status } })
              }
            />
            <textarea
              className="field"
              rows={2}
              value={editing.draft.note}
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, note: e.target.value } })}
              placeholder="Nota: la colección se repartió entre los herederos en 1998…"
              aria-label={`Nota de ${party.name}`}
            />
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Guardar la ficha"
              title="Guardar"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                void onSave(editing.opened, editing.draft).then((worked) => {
                  if (worked) {
                    setEditing(null)
                    // Lo revelado se olvida al cerrar: el contacto no se queda en
                    // pantalla porque se haya editado la ficha.
                    setRevealed(null)
                  }
                })
              }
            >
              <YesIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Dejar la ficha como estaba"
              title="Dejar la ficha como estaba"
              className="btn-secondary"
              onClick={() => setEditing(null)}
            >
              <NoIcon className="h-5 w-5" />
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="min-w-0 basis-full">
            <span className="block break-words font-medium">{party.name}</span>
            {/* Nunca un hueco: sin localidad se queda el tipo, que siempre existe. */}
            <span className="block break-words text-xs text-stone-500">
              {partySubtitle(party)}
            </span>
            <span className="block text-xs text-stone-500">
              {CONTACT_STATUS_LABEL[party.contact_status]}
            </span>
            {party.note.trim() !== '' && (
              <span className="block break-words text-xs text-stone-500">{party.note}</span>
            )}
            {revealed !== null && (
              <span className="mt-1 block break-words text-xs text-stone-700">
                {contactText(revealed)}
              </span>
            )}
            {contactFailure && (
              <span role="alert" className="mt-1 block break-words text-xs text-red-700">
                {contactFailure}
              </span>
            )}
            {/* «Retirada» concuerda con «la ficha», que es lo que se retira: una
                persona no se retira, su ficha del catálogo sí. */}
            {!party.active && <span className="block text-xs text-stone-500">Retirada</span>}
          </span>
          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
            {/* Pedir el contacto es un gesto explícito, y se puede volver a
                esconder: la pantalla se queda abierta mucho rato. */}
            {revealed === null ? (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={asking}
                onClick={() =>
                  void withContact().then((contact) => {
                    if (contact !== null) setRevealed(contact)
                  })
                }
              >
                {asking ? 'Pidiendo…' : 'Ver contacto'}
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setRevealed(null)
                  setContactFailure(null)
                }}
              >
                Ocultar contacto
              </button>
            )}
            <button
              type="button"
              aria-label={`Editar ${party.name}`}
              title="Editar"
              className="btn-secondary"
              disabled={asking}
              onClick={() =>
                void withContact().then((contact) => {
                  // El formulario se abre igual si el contacto no se pudo leer:
                  // corregir el nombre de un museo no depende de su teléfono. La
                  // explicación pasa al aviso del campo, así que el mensaje de la
                  // fila se retira para no decirlo dos veces.
                  setContactFailure(null)
                  const opened = partyDraft(party, contact)
                  setEditing({ opened, draft: { ...opened } })
                })
              }
            >
              <PenIcon className="h-5 w-5" />
            </button>
            {party.active ? (
              <button
                type="button"
                aria-label={`Retirar ${party.name}`}
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
