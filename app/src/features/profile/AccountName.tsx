import { useState } from 'react'
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
 * Corregir el propio nombre, desde el perfil (RF-109).
 *
 * Se edita en el sitio y no en otra pantalla: es un campo, y mandar a alguien a
 * una pantalla aparte para escribir su nombre es un viaje por un dato. La
 * contraseña sí tiene la suya, y con razón — pide la nueva dos veces y la escribe
 * el servicio de identidad, no esta tabla.
 *
 * Al guardar se vuelve a leer el perfil de la sesión: el nombre viaja a «Cuenta»,
 * al pie de esta misma pantalla y a lo que se escriba a partir de ahora en las
 * fichas, así que dejarlo desactualizado hasta la siguiente recarga haría dudar
 * de si el cambio entró.
 */
export function AccountName() {
  const { profile, refreshProfile } = useAuth()
  const current = profile?.name ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function save(value: string) {
    const invalid = validateFullName(value)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setNotice(null)

    if (!nameChanged(value, current)) {
      // Sin cambio no se manda nada, y se dice: un «Guardado» tras no hacer nada
      // enseña que el botón miente, y a partir de ahí no se cree ninguno.
      setDraft(null)
      return
    }

    setSaving(true)
    const clean = cleanFullName(value)
    // `select('id')` por lo mismo que las pantallas de mantenimiento: una
    // actualización que la política deniega vuelve sin error y sin filas.
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
        <button
          type="button"
          className="mt-2 block min-h-touch text-sm text-stone-600 underline hover:text-stone-800"
          onClick={() => {
            setNotice(null)
            setError(null)
            setDraft(current)
          }}
        >
          Cambiar el nombre
        </button>
        {notice && (
          <p role="status" className="mt-1 text-xs text-stone-600">
            {notice}
          </p>
        )}
      </>
    )
  }

  return (
    <form
      className="mt-3 space-y-2"
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
