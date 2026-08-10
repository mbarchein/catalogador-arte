import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ActionBar, LoadingNotice } from '../../components/ui'
import { ExhibitionForm } from './ExhibitionForm'
import { emptyExhibitionDraft, exhibitionDraftProblem } from './exhibitionDraft'
import { similarExhibitions, similarTitleNotice } from './exhibitionIndex'
import { useExhibitions } from './useExhibitions'

/**
 * Registering an exhibition (RF-501, RF-512, RF-1106).
 *
 * The screen the exhibition history of every artwork has been pointing at: until
 * now a show could only be created from SQL, so a piece could be said to have been
 * in a muestra that could not be created.
 *
 * **A route of its own and not a sheet on the index.** Nine fields in four groups
 * do not fit in a bottom sheet on a phone, and this is not a quick add: a show has
 * a title copied off a printed page, two dates, a venue chosen from a master table
 * and a tri-state about its catalogue. Being a route also means the phone's back
 * button leaves the form instead of leaving the application, and a half-typed show
 * survives a reload of the address.
 *
 * Cataloger only. A Lector who reaches the address is sent to the index — the
 * button is not painted for one either, but a hidden button is not a protection.
 */
export function NewExhibitionPage() {
  const access = useEditingAccess()
  const navigate = useNavigate()
  const { exhibitions, addExhibition } = useExhibitions()
  const [draft, setDraft] = useState(emptyExhibitionDraft)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // A warning, not a rule: `exhibitions` does NOT have a unique index on the title, on
  // purpose, because a touring show repeats its title at every venue. The only thing that
  // can be done is to put the one that already exists in front before the second is created.
  const twins = useMemo(() => similarExhibitions(exhibitions, draft.title), [exhibitions, draft.title])
  const twinNotice = similarTitleNotice(twins)

  // What prevents saving, computed for the warning BEFORE pressing. The button is not
  // disabled by it: disabling without saying why is what makes people press it
  // three times. Only the blank title disables it, which is the one case where
  // the form is clearly not started.
  const problem = exhibitionDraftProblem(draft)

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/exhibitions" replace />

  async function create() {
    setSaving(true)
    setFailure(null)
    const result = await addExhibition(draft)
    setSaving(false)
    if ('message' in result) {
      setFailure(result.message)
      return
    }
    // To the freshly created record and not back to the listing: the next thing done
    // with an exhibition is reading it or correcting it, and `replace` leaves the «back» button
    // returning to the listing instead of to the form already submitted.
    navigate(`/exhibitions/${result.id}`, { replace: true })
  }

  return (
    <Layout title="Nueva exposición" back="/exhibitions">
      <p className="mb-3 text-sm text-stone-600">
        La muestra, no la participación de una obra. Cada obra se añade después desde su ficha.
      </p>

      {twinNotice && (
        <p className="card mb-3 border-amber-200 bg-amber-50 text-sm text-amber-900">{twinNotice}</p>
      )}

      <ExhibitionForm draft={draft} onChange={setDraft} disabled={saving} />

      <ActionBar
        notice={
          failure !== null ? (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
              {failure}
            </p>
          ) : problem !== null && draft.title.trim() !== '' ? (
            /* The problem is said while typing, not on pressing: the
               cataloguer is on her feet, and a trip to the server just to be told
               «check the two dates» is worse than the field in front of her
               saying so. */
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{problem}</p>
          ) : undefined
        }
      >
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={saving || draft.title.trim() === ''}
          onClick={() => void create()}
        >
          {saving ? 'Creando…' : 'Crear exposición'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => navigate('/exhibitions')}
        >
          Cancelar
        </button>
      </ActionBar>
    </Layout>
  )
}
