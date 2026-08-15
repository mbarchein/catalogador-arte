import { useState } from 'react'
import { PenIcon } from '../../components/ui'
import { useAutoClear } from '../../components/useAutoClear'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  cleanFullName,
  nameChanged,
  nameSavedNotice,
  validateFullName,
  NAME_HINT,
  NAME_MAX_LENGTH,
} from './accountName'

/**
 * Correcting one's own name, from the profile (RF-109).
 *
 * It is edited in place and not on another screen: it is one field, and sending somebody to
 * a separate screen to write their name is a trip for one datum. The
 * password does have its own, and rightly so — it asks for the new one twice and it is written
 * by the identity service, not by this table.
 *
 * On saving, the session's profile is read again: the name travels to «Cuenta»,
 * to the foot of this same screen and to whatever gets written from now on in the
 * records, so leaving it out of date until the next reload would make one doubt
 * whether the change went in.
 *
 * **Pinta su propia fila de la lista**, y no solo el botón de corregir. Es lo que permite
 * que ese botón sea un lápiz sin rótulo: al lado del dato que corrige, el icono ya dice
 * qué corrige; suelto debajo de tres filas, un lápiz no dice cuál de las tres.
 */
export function AccountName() {
  const { profile, refreshProfile } = useAuth()
  const current = profile?.name ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // It confirms something that already happened, so it leaves on its own: see `useAutoClear`.
  useAutoClear(notice, () => setNotice(null))

  async function save(value: string) {
    const invalid = validateFullName(value)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setNotice(null)

    if (!nameChanged(value, current)) {
      // With no change nothing is sent, and it is said: a «Guardado» after doing nothing
      // teaches that the button lies, and from then on none of them is believed.
      setDraft(null)
      return
    }

    setSaving(true)
    const clean = cleanFullName(value)
    // `select('id')` for the same reason as the maintenance screens: an
    // update the policy denies comes back with no error and with no rows.
    const { data, error: failure } = await supabase
      .from('profiles')
      .update({ name: clean })
      .eq('id', profile?.id ?? '')
      .select('id')
    setSaving(false)

    if (failure) {
      setError(
        failure.message?.trim()
          ? `No se ha podido guardar el nombre: ${failure.message}`
          : 'No se ha podido guardar el nombre.',
      )
      return
    }
    if ((data ?? []).length === 0) {
      setError('No se ha podido guardar el nombre: la base no ha aceptado el cambio.')
      return
    }

    await refreshProfile()
    setDraft(null)
    setNotice(nameSavedNotice(clean))
  }

  if (draft === null) {
    return (
      <>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="shrink-0 text-sm text-stone-500">Nombre</dt>
          <dd className="flex min-w-0 items-center gap-2">
            {/* Nunca un hueco: un dato vacío se dice, no se omite. */}
            <span className="min-w-0 truncate text-right text-sm">{current || 'Sin indicar'}</span>
            <button
              type="button"
              aria-label="Cambiar el nombre"
              title="Cambiar el nombre"
              className="flex min-h-touch w-11 shrink-0 items-center justify-center rounded-lg border border-stone-300 text-stone-700"
              onClick={() => {
                setNotice(null)
                setError(null)
                setDraft(current)
              }}
            >
              <PenIcon className="h-5 w-5" />
            </button>
          </dd>
        </div>
        {notice && (
          <p role="status" className="pb-2 text-xs text-stone-600">
            {notice}
          </p>
        )}
      </>
    )
  }

  return (
    <form
      className="space-y-2 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save(draft)
      }}
    >
      <label className="label" htmlFor="account-name">
        Nombre completo
      </label>
      <input
        id="account-name"
        className="field"
        autoFocus
        maxLength={NAME_MAX_LENGTH}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <p className="text-xs text-stone-500">{NAME_HINT}</p>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => {
            setDraft(null)
            setError(null)
          }}
        >
          Cancelar
        </button>
        <button className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
