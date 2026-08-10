import { useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { BanIcon, Chips, LoadingNotice, NoIcon, PenIcon, YesIcon } from '../../components/ui'
import type { ArtworkRelationshipType } from '../../lib/types'
import { useTableAction } from './MasterTableRow'
import {
  relationshipTypeDraft,
  relationshipTypeDraftReadings,
  relationshipTypeReadings,
  type RelationshipTypeDraft,
} from './relationshipTypes'
import { useRelationshipTypesAdmin } from './useRelationshipTypesAdmin'

/**
 * The relationship-kinds screen: creating, renaming and retiring them (RF-217,
 * RF-901, RF-1106, ADR-007).
 *
 * The six kinds the catalogue has were seeded by the migration, and until this
 * screen existed a seventh one could only be born in SQL. What made that worse
 * than for the other masters is what this one carries: a kind is not a label but a
 * PAIR of readings, «Estudio previo de» from one artwork and «Obra final de» from
 * the other, plus whether the two ends read the same at all.
 *
 * **So the screen is built around the two readings, not around the name.** Both
 * fields are on screen together and under them, always, the sentences the records
 * will end up showing — «Una obra es estudio previo de la otra. Y esa otra es obra
 * final de la primera.» That preview is the whole point: the second half is the one
 * the cataloger cannot see from the record she works in, because it is the far
 * artwork's record that reads it, and a kind saved with the inverse label wrong
 * publishes the study as the finished work with nothing downstream able to notice.
 * Both halves are perfectly valid text.
 *
 * **The direction is editable, and the database is the one that says no.** RF-217
 * freezes the symmetry of a kind ALREADY IN USE — the rows of a symmetric kind are
 * stored in one canonical order and those of a directed one are not, so mixing the
 * two conventions would let the same pair in twice — and a trigger refuses the
 * change with its own sentence and a hint about creating a new kind instead. That
 * sentence is what shows up here. Hiding the option would leave a kind created
 * wrong with no way back except the trash, and it would hide the rule instead of
 * teaching it.
 *
 * **What this screen does NOT do is count relationships.** Retiring a kind that
 * related artworks still use is refused next to the data, in Spanish and with a
 * hint, and that is the sentence shown. A count kept here would be a second copy
 * of the rule, out of step with the next pair related from a phone.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */

type Direction = 'DIRECTED' | 'SYMMETRIC'

/**
 * The direction in words, not as «simétrica».
 *
 * The word is the schema's and it is exact; what it is not is what the cataloger
 * decides. She decides whether the relationship says the same thing from both
 * artworks, and that is what the two options say.
 */
const DIRECTIONS: readonly { value: Direction; text: string }[] = [
  { value: 'DIRECTED', text: 'Se lee distinto desde cada obra' },
  { value: 'SYMMETRIC', text: 'Se lee igual desde las dos' },
]

const EMPTY_DRAFT: RelationshipTypeDraft = { name: '', inverseName: '', symmetric: false }

export function RelationshipTypesPage() {
  const access = useEditingAccess()
  const {
    entries,
    loading,
    error,
    addRelationshipType,
    editRelationshipType,
    setRelationshipTypeActive,
  } = useRelationshipTypesAdmin()
  // Shared with the rest of the section: the same three actions, the same
  // convention (null means it worked) and the same reason for scrolling the
  // message into view on a phone.
  const { busy, failure, failureRef, run } = useTableAction()
  const [creating, setCreating] = useState<RelationshipTypeDraft>(EMPTY_DRAFT)

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Tipos de relación" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        El parentesco entre dos obras. Cada tipo lleva sus dos lecturas, una por ficha.
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

      <section className="card mb-3 space-y-3">
        <h2 className="font-medium">Añadir</h2>
        <RelationshipTypeFields
          id="new-relationship-type"
          draft={creating}
          onChange={setCreating}
        />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy || creating.name.trim() === ''}
          onClick={() =>
            void run(async () => {
              const message = await addRelationshipType(creating)
              if (!message) setCreating(EMPTY_DRAFT)
              return message
            })
          }
        >
          Añadir tipo de relación
        </button>
      </section>

      {/* Never a blank page: an empty list says what this master is and what the
          catalogue does with it, because «tipos de relación» read cold explains
          nothing. */}
      {!loading && entries.length === 0 && (
        <p className="card text-sm text-stone-600">
          Todavía no hay ninguno: pareja, políptico, estudio previo… El primero, aquí arriba.
        </p>
      )}

      {/* No live subscription, as on the rest of the section:
          `artwork_relationship_types` is not in the Realtime publication and
          adding it would be a production change to serve a screen one person uses
          to tidy up a vocabulary. Every action here reloads the list. */}
      <ul className="space-y-1">
        {entries.map((entry) => (
          <RelationshipTypeRow
            key={entry.id}
            entry={entry}
            busy={busy}
            onSave={(draft) => run(() => editRelationshipType(entry.id, draft))}
            onSetActive={(active) => void run(() => setRelationshipTypeActive(entry.id, active))}
          />
        ))}
      </ul>
    </Layout>
  )
}

/**
 * The two readings and the direction, with the sentences they produce underneath.
 *
 * One component for the «Añadir» form and for the row being edited, because they
 * are the same three fields and the same preview — the difference is only where
 * the buttons are.
 *
 * The inverse-label field DISAPPEARS when the direction says both ends read the
 * same, instead of being disabled or ignored: the table stores it empty in that
 * case (`inverse_coherent`), so a field on screen holding text that will not be
 * saved would be a lie. What was typed is not thrown away either — it comes back
 * if the direction is switched again — because the draft keeps it.
 */
function RelationshipTypeFields({
  id,
  draft,
  onChange,
}: {
  id: string
  draft: RelationshipTypeDraft
  onChange: (draft: RelationshipTypeDraft) => void
}) {
  const readings = relationshipTypeDraftReadings(draft)

  return (
    <>
      <div>
        <label className="label" htmlFor={`${id}-name`}>
          Desde una obra se lee
        </label>
        <input
          id={`${id}-name`}
          className="field"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Estudio previo de"
        />
      </div>

      <Chips
        id={`${id}-direction`}
        label="Dirección"
        columns={2}
        options={DIRECTIONS}
        value={draft.symmetric ? 'SYMMETRIC' : 'DIRECTED'}
        onChange={(value) => onChange({ ...draft, symmetric: value === 'SYMMETRIC' })}
      />

      {!draft.symmetric && (
        <div>
          <label className="label" htmlFor={`${id}-inverse`}>
            Desde la otra obra se lee
          </label>
          <input
            id={`${id}-inverse`}
            className="field"
            value={draft.inverseName}
            onChange={(e) => onChange({ ...draft, inverseName: e.target.value })}
            placeholder="Obra final de"
          />
          <p className="mt-1 text-xs text-stone-500">
            Es lo que dirá la ficha de la segunda obra. Mal escrita, cuenta la relación al revés.
          </p>
        </div>
      )}

      <div className="rounded-lg bg-stone-100 p-2">
        <span className="block text-xs font-medium uppercase tracking-wide text-stone-500">
          Así lo leerán las fichas
        </span>
        <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
          {readings.map((reading) => (
            <li key={reading.side}>{reading.text}</li>
          ))}
        </ul>
      </div>
    </>
  )
}

/**
 * One kind of the list: its name, the sentences each record will show, and
 * renaming and retiring it.
 *
 * NOT `MasterTableRow`, and the reason is the one that makes this master
 * different: renaming here is not editing a name, it is editing the PAIR of
 * readings plus the direction. The shared row offers one field, which would let
 * half of the pair be corrected and leave the other half saying the old thing on
 * the far record — exactly the failure this screen exists to prevent. What IS
 * shared is `useTableAction`, the layout of the row and the convention that an
 * action answers null when it worked.
 *
 * The draft is state OF THE ROW and not of the page, for the reason the shared row
 * gives: the page has no other use for it.
 */
function RelationshipTypeRow({
  entry,
  busy,
  onSave,
  onSetActive,
}: {
  entry: ArtworkRelationshipType
  busy: boolean
  /** Answers whether it worked, which is when the fields close. */
  onSave: (draft: RelationshipTypeDraft) => Promise<boolean>
  onSetActive: (active: boolean) => void
}) {
  const [draft, setDraft] = useState<RelationshipTypeDraft | null>(null)

  return (
    <li
      // The name and its readings take their own line and the actions go below,
      // aligned to the right: with the buttons alongside, «Parte del mismo
      // políptico que» broke into lines of two words. The phone is the
      // primary device.
      className={`card flex flex-wrap items-center gap-2 ${entry.active ? '' : 'opacity-60'}`}
    >
      {draft !== null ? (
        <>
          <div className="basis-full space-y-3">
            <RelationshipTypeFields id={`type-${entry.id}`} draft={draft} onChange={setDraft} />
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Guardar las dos lecturas"
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
              aria-label="Dejarlo como estaba"
              title="Dejarlo como estaba"
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
            <span className="block break-words font-medium">{entry.name}</span>
            {/* Las dos lecturas, siempre y no solo al editar: es lo que distingue
                un tipo de otro que se llama casi igual, y lo que deja ver de un
                vistazo si la mitad de la relación está mal escrita. */}
            <ul className="mt-0.5 space-y-0.5 text-xs text-stone-600">
              {relationshipTypeReadings(entry).map((reading) => (
                <li key={reading.side}>{reading.text}</li>
              ))}
            </ul>
            {!entry.active && <span className="mt-0.5 block text-xs text-stone-500">Retirado</span>}
          </span>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label={`Cambiar las lecturas de ${entry.name}`}
              title="Cambiar las lecturas"
              className="btn-secondary"
              onClick={() => setDraft(relationshipTypeDraft(entry))}
            >
              <PenIcon className="h-5 w-5" />
            </button>
            {entry.active ? (
              <button
                type="button"
                aria-label={`Retirar ${entry.name}`}
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
