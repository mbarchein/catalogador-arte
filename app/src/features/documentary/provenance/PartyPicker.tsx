import { useState } from 'react'
import { draftDirty } from '../../../components/formDirty'
import { BottomSheet, Chips, YesIcon } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import { PARTY_TYPE_LABEL, type PartyType } from '../../../lib/types'
import { partyText, type PartyRef } from '../documentaryFormat'
import {
  emptyNewParty,
  findParty,
  newPartyProblem,
  noChoicesText,
  partyChoices,
} from './partyChoice'

/**
 * Choosing who a link of the chain is about (RF-508, RF-509).
 *
 * A bottom sheet, like every chooser of this application: the options have to
 * appear under the thumb, and a dropdown halfway up the record does not.
 *
 * **The link may name nobody, and that is not an escape hatch.** «Colección
 * privada, España» is a real, deliberate link of a catalogue raisonné, and the
 * database demands one of the two — a record or a written note — never neither.
 * So the sheet offers three things at the same level: pick a record, write how it
 * consta, or create the record now without losing the half-written link.
 *
 * Nothing here decides anything: which records are on offer, which retired one
 * survives in the list and what tells two «Casa de Cultura» apart come from
 * `partyChoices`, which is pure and verified.
 */
export function PartyPicker({
  parties,
  partyId,
  partyNote,
  onPick,
  onWrite,
  onCreate,
  disabled = false,
  loading = false,
  loadError = null,
}: {
  parties: readonly PartyRef[]
  partyId: string | null
  /** How the link consta when it names no record, or the precision over the record. */
  partyNote: string
  onPick: (partyId: string | null) => void
  onWrite: (note: string) => void
  /** Creates the record and answers its identifier, or the sentence to show. */
  onCreate: (draft: ReturnType<typeof emptyNewParty>) => Promise<{ id: string } | { error: string }>
  disabled?: boolean
  /**
   * The register is on its way, or it did not arrive. Neither is «there are
   * none», and the sheet says which one it is instead of claiming the catalogue
   * is empty. It does NOT disable anything: writing the link by hand is the
   * legitimate answer here, not a fallback.
   */
  loading?: boolean
  loadError?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(emptyNewParty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = findParty(parties, partyId)
  const choices = partyChoices(parties, query, partyId)

  function close() {
    setOpen(false)
    setQuery('')
    setCreating(false)
    setError(null)
  }

  async function create() {
    const problem = newPartyProblem(draft)
    if (problem !== null) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    const result = await onCreate(draft)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onPick(result.id)
    setDraft(emptyNewParty())
    close()
  }

  // Esta hoja tiene dos modos y el cambio se ve entero —la lista desaparece y sale un
  // formulario—, así que el fondo cierra mientras se elige y deja de cerrar mientras se da
  // de alta una ficha nueva. Es la excepción a «una superficie no puede cerrar unas veces
  // y otras no»: aquí no es la misma pantalla.
  const guard = useSheetGuard({
    onClose: close,
    backdropCloses: !creating,
    dirty: creating && draftDirty(draft, emptyNewParty()),
  })

  return (
    <div>
      <span className="label">De quién habla el eslabón</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex min-h-touch w-full items-center justify-between gap-2 rounded-lg border
                   border-stone-300 bg-white px-3 py-2 text-left disabled:opacity-50"
      >
        <span className="min-w-0">
          {chosen ? (
            <>
              <span className="block truncate text-sm font-medium">{partyText(chosen)}</span>
              <span className="block text-xs text-stone-500">
                {PARTY_TYPE_LABEL[chosen.party_type]}
                {chosen.active ? '' : ' · ficha retirada'}
              </span>
            </>
          ) : partyNote.trim() !== '' ? (
            <>
              <span className="block truncate text-sm font-medium">{partyNote.trim()}</span>
              <span className="block text-xs text-stone-500">Sin ficha, escrito a mano</span>
            </>
          ) : (
            /* RF-304: nunca un hueco. El control dice qué falta. */
            <span className="block text-sm text-stone-500">
              Sin elegir: toca para buscar una ficha o escribirlo a mano
            </span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-stone-500">
          Cambiar
        </span>
      </button>

      {/* La precisión sobre la ficha, o el eslabón entero cuando no hay ficha.
          Se edita fuera de la hoja porque se escribe mirando el documento. */}
      <label className="label mt-2" htmlFor="prov-party-note">
        {chosen ? 'Precisión sobre esta ficha' : 'Cómo consta, si no hay ficha'}
      </label>
      <input
        id="prov-party-note"
        className="field"
        disabled={disabled}
        value={partyNote}
        onChange={(event) => onWrite(event.target.value)}
        placeholder={chosen ? 'propiedad de la tía de Almudena' : 'Colección particular, España'}
      />

      <BottomSheet
        open={open}
        onClose={close}
        title="Persona o institución"
        guard={guard}
      >
        {creating ? (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="new-party-name">
                Nombre
              </label>
              <input
                id="new-party-name"
                className="field"
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                placeholder="Museo de Bellas Artes de Badajoz (MUBA)"
              />
            </div>

            <Chips
              id="new-party-type"
              label="Qué es"
              columns={2}
              options={(['PERSON', 'INSTITUTION'] as PartyType[]).map((value) => ({
                value,
                text: PARTY_TYPE_LABEL[value],
              }))}
              value={draft.party_type}
              onChange={(value) => setDraft((d) => ({ ...d, party_type: value }))}
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="new-party-locality">
                  Localidad
                </label>
                <input
                  id="new-party-locality"
                  className="field"
                  value={draft.locality}
                  onChange={(event) => setDraft((d) => ({ ...d, locality: event.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="new-party-country">
                  País
                </label>
                <input
                  id="new-party-country"
                  className="field"
                  value={draft.country}
                  onChange={(event) => setDraft((d) => ({ ...d, country: event.target.value }))}
                />
              </div>
            </div>

            <p className="text-xs text-stone-500">
              La ficha se añade al catálogo compartido y la usa todo el equipo.
            </p>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="btn-primary"
              >
                {busy ? 'Creando…' : 'Crear y usar'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCreating(false)}
                className="btn-secondary"
              >
                Volver a la lista
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="field"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar una persona o institución"
              autoComplete="off"
              autoCapitalize="none"
            />

            <div role="radiogroup" aria-label="Persona o institución" className="space-y-1">
              {choices.map(({ party, text, hint, retired }) => {
                const active = party.id === partyId
                return (
                  <button
                    key={party.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      onPick(party.id)
                      close()
                    }}
                    className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg
                                px-3 py-2 text-left ${
                                  active ? 'bg-stone-800 text-white' : 'text-stone-800 active:bg-stone-100'
                                }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {text}
                        {retired && ' · retirada'}
                      </span>
                      <span
                        className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}
                      >
                        {hint}
                      </span>
                    </span>
                    {active && <YesIcon className="h-5 w-5 shrink-0" />}
                  </button>
                )
              })}

              {/* Nunca una lista vacía sin explicación, y «no hay ninguna» solo
                  cuando de verdad no hay ninguna. */}
              {choices.length === 0 && (
                <p className="px-3 py-2 text-sm text-stone-600">
                  {noChoicesText({ loading, error: loadError, query })}
                </p>
              )}
            </div>

            <div className="grid gap-2 border-t border-stone-200 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...emptyNewParty(), name: query.trim() })
                  setError(null)
                  setCreating(true)
                }}
                className="btn-secondary text-sm"
              >
                Crear una ficha nueva
              </button>
              {/* Quitar la ficha no vacía el eslabón: lo devuelve al caso
                  legítimo de «así es como consta», que se escribe fuera. */}
              <button
                type="button"
                onClick={() => {
                  onPick(null)
                  close()
                }}
                className="btn-secondary text-sm"
              >
                Sin ficha: lo escribo a mano
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
