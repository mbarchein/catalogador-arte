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

  // Un aviso, no una regla: `exhibitions` NO tiene índice único sobre el título, a
  // propósito, porque una itinerante repite título en cada sede. Lo único que se
  // puede hacer es poner delante la que ya existe antes de crear la segunda.
  const twins = useMemo(() => similarExhibitions(exhibitions, draft.title), [exhibitions, draft.title])
  const twinNotice = similarTitleNotice(twins)

  // Lo que impide guardar, calculado para el aviso ANTES de pulsar. El botón no se
  // desactiva por él: desactivar sin decir por qué es lo que hace que se pulse
  // tres veces. Solo el título en blanco lo desactiva, que es el único caso donde
  // el formulario está claramente sin empezar.
  const problem = exhibitionDraftProblem(draft)

  // La espera importa: el rol llega después de la sesión, así que decidir en el
  // primer render echaría a quien sí puede. Ver useEditingAccess.
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
    // A la ficha recién creada y no de vuelta al listado: lo siguiente que se hace
    // con una exposición es leerla o corregirla, y `replace` deja el botón «atrás»
    // volviendo al listado en vez de al formulario que ya se ha enviado.
    navigate(`/exhibitions/${result.id}`, { replace: true })
  }

  return (
    <Layout title="Nueva exposición" back="/exhibitions">
      <p className="mb-3 text-sm text-stone-600">
        La muestra, no la participación de una obra en ella. Una vez creada, cada obra se añade a
        su historial expositivo desde su propia ficha.
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
            /* El problema se dice mientras se escribe, no al pulsar: la
               catalogadora está de pie, y un viaje al servidor para que le digan
               «revisa las dos fechas» es peor que decírselo el campo que tiene
               delante. */
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
