import { useCallback, useEffect, useState } from 'react'
import { sortByName } from '../../lib/masterTables'
import { supabase } from '../../lib/supabase'
import type { DocumentTypeEntry } from '../../lib/types'
import {
  describeDocumentTypeLoadFailure,
  describeDocumentTypeRefusal,
  planDocumentTypeAddition,
  type DatabaseRefusal,
  type DocumentTypeAction,
} from './documentTypes'

const COLUMNS = 'id, name, active'

/**
 * The archive document-type vocabulary (RF-515), loaded from `document_types`.
 *
 * It comes back WHOLE, retired entries included, because this is the only screen a
 * retired type can be brought back from and hiding them there would hide the only
 * way out. The Cataloger's policy already allows it (`document_types_select` lets
 * `can_edit()` see everything); a Reader would only get the active ones, and a
 * Reader never reaches this screen.
 *
 * Sorting happens here with es-ES collation and not in the query, for the same
 * reason as in the other master tables: the database default collation may order
 * «Díptico» past the z.
 *
 * **Every action answers a sentence in Spanish or null**, which is the convention
 * `useTableAction` runs on, and the sentences are built by
 * `describeDocumentTypeRefusal` — a pure function with tests, because a screen
 * cannot be tested here and «which message for which refusal» is the part that has
 * decisions in it.
 */
export function useDocumentTypes() {
  const [entries, setEntries] = useState<DocumentTypeEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    // Wrapped because a load that throws instead of answering would leave `loading`
    // true for ever, and a screen stuck on «cargando» with no explanation is the
    // blank page this project does not do.
    try {
      const { data, error } = await supabase.from('document_types').select(COLUMNS)
      setLoading(false)
      if (error) {
        // Told in Spanish and not handed over raw: what arrives here is
        // PostgreSQL's or the browser's own English («TypeError: Failed to
        // fetch»), and this screen shows it to whoever catalogues.
        setError(describeDocumentTypeLoadFailure(error))
        return
      }
      setError(null)
      setEntries(sortByName((data ?? []) as DocumentTypeEntry[]))
    } catch (thrown) {
      setLoading(false)
      setError(describeDocumentTypeLoadFailure({ message: String(thrown) }))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * One write, and the answer it deserves.
   *
   * **`select('id')` is not decoration.** An update that the policies refuse comes
   * back 204 with zero rows and NO error — checked against the local base with a
   * Reader's token — so without asking for the affected rows the screen would
   * report «guardado» and change nothing. Zero rows means the write did not happen,
   * whatever the reason, and that is what gets said.
   *
   * **And it never rejects.** `useTableAction` awaits the action and clears its
   * `busy` flag afterwards; a promise that rejects would skip that line and leave
   * every button on the screen disabled until the page is reloaded. The client
   * normally hands a network failure back as an error object, but «normally» is not
   * a reason to leave the screen one broken promise away from frozen.
   */
  const write = useCallback(
    async (
      action: DocumentTypeAction,
      request: PromiseLike<{ data: unknown[] | null; error: DatabaseRefusal | null }>,
    ): Promise<string | null> => {
      try {
        const { data, error } = await request
        if (error) return describeDocumentTypeRefusal(action, error)
        if ((data ?? []).length === 0) return describeDocumentTypeRefusal(action, null)
      } catch (thrown) {
        return describeDocumentTypeRefusal(action, { message: String(thrown) })
      }
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Retires a type, or brings it back (RF-901: nothing is ever really deleted).
   *
   * The database refuses to retire one that documents of the archive still use, in
   * Spanish and with a hint about what to do first, and both halves get shown.
   * **No count is kept on this side**: this screen would have to hold it in step
   * with every document filed from a phone, and a rule with two copies is a rule
   * that drifts.
   */
  const setTypeActive = useCallback(
    (id: string, active: boolean): Promise<string | null> =>
      write(
        active ? 'restore' : 'retire',
        supabase.from('document_types').update({ active }).eq('id', id).select('id'),
      ),
    [write],
  )

  /**
   * Adds a type to the vocabulary.
   *
   * A name that is already there is a success and not a failure, in the three ways
   * it can be there: identical, equivalent but for capitals or accents, and
   * RETIRED — the last one comes back, because that is what typing it means (see
   * planDocumentTypeAddition).
   *
   * The `23505` branch is the race: someone added the same name a second ago, or
   * the loaded copy was stale. Re-reading and deciding again with fresh data is the
   * same decision, and it is the only way to tell «ya estaba» from «estaba
   * retirado». If the fresh copy still does not explain the duplicate, the refusal
   * is reported instead of being swallowed as success.
   */
  const addType = useCallback(
    async (name: string): Promise<string | null> => {
      const plan = planDocumentTypeAddition(entries, name)
      if (plan.action === 'blank') return 'Escribe el nombre del tipo de documento'
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setTypeActive(plan.entry.id, true)

      // Same reason as in `write`: a rejection here would leave the screen's buttons
      // disabled for good, because the caller clears its busy flag after the await.
      try {
        const { error } = await supabase.from('document_types').insert({ name: plan.name })
        if (error) {
          if (error.code !== '23505') return describeDocumentTypeRefusal('add', error)
          const { data } = await supabase.from('document_types').select(COLUMNS)
          const again = planDocumentTypeAddition((data ?? []) as DocumentTypeEntry[], plan.name)
          if (again.action === 'restore') return setTypeActive(again.entry.id, true)
          if (again.action === 'insert') return describeDocumentTypeRefusal('add', error)
        }
      } catch (thrown) {
        return describeDocumentTypeRefusal('add', { message: String(thrown) })
      }
      await reload()
      return null
    },
    [entries, reload, setTypeActive],
  )

  /**
   * Renames a type. ADR-007 made this one row, and the whole archive reads it.
   *
   * **One request and no copy to drag along**, unlike the artwork types:
   * `archive_documents` points at the identifier and holds no text copy of the
   * name, which is what that table was corrected into being. So «Recorte» becomes
   * «Recorte de prensa» in one write and there is no window where a document is
   * unsaveable.
   */
  const renameType = useCallback(
    (id: string, name: string): Promise<string | null> => {
      const clean = name.trim()
      if (clean === '') return Promise.resolve('El nombre no puede quedar vacío')
      return write(
        'rename',
        supabase.from('document_types').update({ name: clean }).eq('id', id).select('id'),
      )
    },
    [write],
  )

  return { entries, loading, error, reload, addType, renameType, setTypeActive }
}
