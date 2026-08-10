import { useMemo, useState } from 'react'
import { anyWritten } from '../../../components/formDirty'
import { BottomSheet, SheetFooter } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import { displayExhibitionDates } from '../documentaryFormat'
import type { ExhibitionRow } from '../documentaryRows'
import { exhibitionKindText, exhibitionVenueLine } from './exhibitionHistory'
import { noOptionsText, rankExhibitionOptions } from './participationEdits'
import { useExhibitionOptions } from './useParticipations'

/**
 * Adding this artwork to an exhibition already in the catalogue (RF-501).
 *
 * Two steps inside one sheet: choose the show, then say with what number it
 * appeared in its catalogue. They are two steps and not one form because they are
 * two different acts — the first is a search among what the catalogue knows, the
 * second is a datum copied off a printed page — and on a phone a search field
 * above two text inputs is a screen where the keyboard covers whichever one is
 * not being used.
 *
 * Everything that decides is next door in `participationEdits.ts`: what is
 * offered, what is marked as already linked, and what is said instead of an empty
 * list. Here there is a sheet, a text field and a button.
 */
export function ExhibitionPicker({
  taken,
  blockedReason,
  saving,
  onAdd,
}: {
  /** Exhibitions this artwork is already in: listed, marked, not choosable again. */
  taken: ReadonlySet<string>
  /** Why nothing can be added right now (RF-218), or null. */
  blockedReason: string | null
  saving: boolean
  /** Answers null when it worked, and the database's own message when it did not. */
  onAdd: (exhibitionId: string, catalogueNumber: string, note: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<ExhibitionRow | null>(null)
  const [catalogueNumber, setCatalogueNumber] = useState('')
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  // Asked for only once the sheet has been opened: this component is mounted,
  // hidden, inside every record of the catalogue.
  const { options, loading, error } = useExhibitionOptions(open)

  const choices = useMemo(
    () => rankExhibitionOptions(options, query, taken),
    [options, query, taken],
  )

  function close() {
    setOpen(false)
    setQuery('')
    setChosen(null)
    setCatalogueNumber('')
    setNote('')
    setFailure(null)
  }

  async function add() {
    if (!chosen) return
    const message = await onAdd(chosen.id, catalogueNumber, note)
    if (message !== null) {
      setFailure(message)
      return
    }
    close()
  }

  if (blockedReason !== null) {
    // The control is not hidden, it is explained. A missing button is read as a
    // missing permission, and this is neither: it is a state of the research
    // that the cataloger herself can change, right above this line.
    return <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{blockedReason}</p>
  }

  // Same as the person selector: a list while the show is being searched for, a form as
  // soon as one is chosen.
  const guard = useSheetGuard({
    onClose: close,
    backdropCloses: chosen === null,
    dirty: anyWritten(catalogueNumber, note),
  })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary min-h-touch w-full text-sm">
        Añadir a una exposición
      </button>

      <BottomSheet
        open={open}
        onClose={close}
        title="Añadir a una exposición"
        guard={guard}
      >
        {chosen === null ? (
          <>
            <input
              type="search"
              className="field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Título, año o sede"
              aria-label="Buscar entre las exposiciones registradas"
              autoComplete="off"
              autoCapitalize="none"
            />

            {error !== null ? (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                No se ha podido cargar la lista de exposiciones, así que no se muestra ninguna.
                Vuelve a intentarlo donde haya cobertura. ({error})
              </p>
            ) : loading ? (
              <p className="mt-2 p-2 text-sm text-stone-600">Cargando…</p>
            ) : choices.length === 0 ? (
              /* Never an empty list without an explanation, and this one also has
                 to say where a show that is not here gets created. */
              <p className="mt-2 p-2 text-sm text-stone-600">
                {noOptionsText(options.length, query)}
              </p>
            ) : (
              <ul className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto">
                {choices.map((choice) => (
                  <li key={choice.option.id}>
                    <button
                      type="button"
                      disabled={choice.alreadyInHistory}
                      onClick={() => {
                        setFailure(null)
                        setChosen(choice.option)
                      }}
                      className="flex min-h-touch w-full flex-col items-start rounded-lg px-3 py-2 text-left
                                 active:bg-stone-100 disabled:bg-stone-50 disabled:text-stone-400"
                    >
                      <span className="text-sm font-medium">
                        <Marked text={choice.text} indices={choice.indices} />
                      </span>
                      <span className="text-xs text-stone-500">
                        {choice.alreadyInHistory
                          ? 'Ya está en el historial de esta obra'
                          : exhibitionKindText(choice.option.exhibition_type)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{chosen.title}</p>
            <p className="text-xs text-stone-500">
              {displayExhibitionDates(chosen)} · {exhibitionVenueLine(chosen)}
            </p>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="mt-1 text-xs text-stone-600 underline"
            >
              Elegir otra exposición
            </button>

            <div className="mt-3">
              <label className="label" htmlFor="add-catalogue-number">
                Número en el catálogo de la muestra
              </label>
              <input
                id="add-catalogue-number"
                className="field"
                value={catalogueNumber}
                onChange={(event) => setCatalogueNumber(event.target.value)}
                placeholder="12 bis · s/n"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-stone-500">
                Tal como aparece impreso. Si no lo sabes, déjalo vacío.
              </p>
            </div>

            <div className="mt-3">
              <label className="label" htmlFor="add-participation-note">
                Nota de esta participación
              </label>
              <textarea
                id="add-participation-note"
                className="field"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="prestada por la familia; sin marco"
              />
            </div>

            {failure !== null && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
                No se ha podido añadir: {failure}
              </p>
            )}

            <SheetFooter>
              <button
                type="button"
                disabled={saving}
                onClick={() => void add()}
                className="btn-primary min-h-touch flex-1"
              >
                {saving ? 'Añadiendo…' : 'Añadir'}
              </button>
              <button type="button" disabled={saving} onClick={close} className="btn-secondary">
                Cancelar
              </button>
            </SheetFooter>
          </>
        )}
      </BottomSheet>
    </>
  )
}

/**
 * The option with the letters the search matched emphasized: with subsequence
 * matching the letters need not sit together, and without seeing WHICH ones
 * matched an option looks arbitrary. Same reasoning — and same shape — as the
 * one inside `ui.tsx`, which is not exported.
 */
function Marked({ text, indices }: { text: string; indices: readonly number[] }) {
  if (indices.length === 0) return <>{text}</>
  const marked = new Set(indices)
  return (
    <>
      {[...text].map((character, index) =>
        marked.has(index) ? (
          <strong key={index} className="font-semibold underline decoration-stone-400">
            {character}
          </strong>
        ) : (
          <span key={index}>{character}</span>
        ),
      )}
    </>
  )
}
