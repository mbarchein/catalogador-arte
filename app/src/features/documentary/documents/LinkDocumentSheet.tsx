import { useMemo, useState } from 'react'
import { anyWritten } from '../../../components/formDirty'
import { BottomSheet } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import {
  allLinkedText,
  noDocumentOptionsText,
  rankDocumentOptions,
  type DocumentOption,
} from './documentLink'

/**
 * Enlazar un documento que YA está en el archivo (RF-516), con una obra o con una
 * exposición.
 *
 * Two steps inside one sheet: find the document, then say what it says about THIS
 * artwork. They are two steps and not one form because they are two different acts
 * — the first is a search through the archive, the second is a sentence somebody
 * writes — and on a phone a search field above a textarea is a screen where the
 * keyboard covers whichever one is not in use.
 *
 * **Nothing here decides anything.** What is offered, what is marked as already
 * linked and what is said instead of an empty list are all answered by
 * `documentLink.ts`, which the battery can reach. What is left in this file is the fold
 * of the sheet and the plumbing.
 *
 * It takes the chosen document and the note rather than the arguments of one RPC: the two
 * ends of the bridge call two different functions —`document_artwork` and
 * `document_exhibition`— and each caller builds its own. That is the only thing that had
 * to change for the exhibition to reuse this sheet instead of growing a copy of it.
 */
export function LinkDocumentSheet({
  documents,
  linked,
  loading,
  error,
  onLink,
  onClose,
}: {
  /** The whole archive, retired rows included. The chooser drops the retired. */
  documents: readonly DocumentOption[]
  /** Documents already linked here: listed, marked, not choosable again. */
  linked: ReadonlySet<string>
  loading: boolean
  /** Why the archive could not be read, already in Spanish. */
  error: string | null
  /** Answers null when it worked, and the sentence to show when it did not. */
  onLink: (documentId: string, note: string) => Promise<string | null>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<DocumentOption | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const choices = useMemo(
    () => rankDocumentOptions(documents, query, linked),
    [documents, query, linked],
  )
  const everythingLinked = allLinkedText(choices)

  async function link() {
    if (chosen === null) return
    setSaving(true)
    setFailure(null)
    const problem = await onLink(chosen.id, note)
    setSaving(false)
    if (problem !== null) {
      setFailure(problem)
      return
    }
    onClose()
  }

  // The link's note is the only thing typed here, and the only thing that would be lost. The
  // search does not count.
  const guard = useSheetGuard({ onClose, dirty: anyWritten(note) })

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Enlazar un documento del archivo"
      guard={guard}
    >
      {chosen === null ? (
        <>
          <input
            type="search"
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Signatura, título, tipo o año"
            aria-label="Buscar entre los documentos del archivo"
            autoComplete="off"
            autoCapitalize="none"
          />

          {error !== null ? (
            /* El buscador se apaga y se dice por qué: sin la lista no hay forma de
               saber si el documento ya está en el archivo, y subirlo otra vez
               dejaría dos copias del mismo PDF en el almacén. */
            <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : loading ? (
            <p className="mt-2 p-2 text-sm text-stone-600">Cargando el archivo…</p>
          ) : choices.length === 0 ? (
            /* Never an empty list with no explanation, and this one also has to say
               where whatever is missing gets uploaded. */
            <p className="mt-2 p-2 text-sm text-stone-600">
              {noDocumentOptionsText(documents.length, query)}
            </p>
          ) : (
            <>
              {everythingLinked !== null && (
                <p className="mt-2 rounded-lg bg-stone-100 p-2 text-xs text-stone-700">
                  {everythingLinked}
                </p>
              )}
              <ul className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto">
                {choices.map((choice) => (
                  <li key={choice.option.id}>
                    <button
                      type="button"
                      disabled={choice.alreadyLinked}
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
                      <span className="text-xs text-stone-500">{choice.fileText}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{chosen.title}</p>
          <p className="text-xs text-stone-500">
            {chosen.archive_code ?? 'Sin signatura'} ·{' '}
            {chosen.document_type?.name ?? 'Tipo sin clasificar'}
          </p>
          <button
            type="button"
            onClick={() => setChosen(null)}
            className="mt-1 min-h-touch text-xs text-stone-600 underline"
          >
            Elegir otro documento
          </button>

          <div className="mt-3">
            <label className="label" htmlFor="link-document-note">
              Qué dice este documento de esta obra
            </label>
            <textarea
              id="link-document-note"
              className="field"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="reproducida en la página 3; la obra aparece al fondo de la fotografía"
            />
            {/* Las dos notas son distintas y la diferencia hay que decirla: la del
                documento habla del documento, y esta habla de ESTA obra. El mismo
                recorte puede estar enlazado con tres obras y decir algo distinto de
                cada una. */}
            <p className="mt-1 text-xs text-stone-500">
              Solo de esta obra. Vacía no borra lo que ya hubiera.
            </p>
          </div>

          {failure !== null && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
              {failure}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void link()}
              className="btn-primary min-h-touch"
            >
              {saving ? 'Enlazando…' : 'Enlazar con esta obra'}
            </button>
            <button type="button" disabled={saving} onClick={guard.cancel} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}

/**
 * The option with the letters the search matched emphasized: with subsequence
 * matching the letters need not sit together, and without seeing WHICH ones matched
 * an option looks arbitrary. Same shape as the one in `ExhibitionPicker`, which is
 * not exported either — a third copy would be worth extracting; a second is worth
 * less than the import.
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
