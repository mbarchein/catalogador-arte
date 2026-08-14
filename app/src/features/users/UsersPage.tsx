import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { BottomSheet, ConfirmSheet, LoadingNotice, Toast } from '../../components/ui'
import { useAutoClear } from '../../components/useAutoClear'
import { useTableAction } from '../tables/MasterTableRow'
import type { UserRole } from '../../lib/types'
import {
  LAST_SUPERUSER_HINT,
  REMOVE_ACCESS_CONFIRM_TEXT,
  accessChangedNotice,
  removeAccessConfirmTitle,
  roleChangedNotice,
  roleOptions,
  teamEntries,
  type TeamEntry,
} from './team'
import { useTeam } from './useTeam'

/**
 * El equipo: quién entra al catálogo y qué puede hacer (RF-1107, revisa RF-1105).
 *
 * Solo Superusuario (RF-104, RF-108), y comprobado aquí dentro además de en la fila que
 * lleva hasta aquí: un botón escondido no es una protección. Y comprobado también por la
 * base, que es la que de verdad decide — esta pantalla no puede dar un permiso que las
 * políticas no den.
 *
 * ── LO QUE ESTA PANTALLA NO HACE ────────────────────────────
 *
 * No borra cuentas. Quitar el acceso deja la fila en su sitio, y eso no es delicadeza: el
 * perfil cae en cascada desde la cuenta, así que borrarla dejaría el catálogo entero
 * firmado por un identificador que ya no existe — cada «actualizado por» de cada obra que
 * esa persona tocó.
 */
export function UsersPage() {
  const { canManageUsers, roleKnown, profile } = useAuth()
  const { members, loading, error, setRole, setAccess } = useTeam()
  const { busy, failure, failureRef, run } = useTableAction()
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<TeamEntry | null>(null)
  useAutoClear(notice, () => setNotice(null))

  // El mismo orden que el resto de las pantallas de quien edita: la espera antes de la
  // negativa, o recargar esta dirección echaría de aquí a quien sí administra.
  if (!canManageUsers && !roleKnown) return <LoadingNotice />
  if (!canManageUsers) return <Navigate to="/" replace />

  const entries = teamEntries(members, profile?.id ?? null)

  async function act(said: string, write: () => Promise<string | null>) {
    setNotice(null)
    if (await run(write)) setNotice(said)
  }

  return (
    <Layout title="Usuarios" back="/tables">
      {notice && <Toast>{notice}</Toast>}
      <p className="mb-3 text-sm text-stone-600">
        Quién entra al catálogo y qué puede hacer.
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

      {loading && members.length === 0 && <LoadingNotice />}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.member.id} className={`card ${entry.withoutAccess ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {entry.title}
                  {entry.self && <span className="ml-1 text-sm text-stone-500">· tú</span>}
                </p>
                {entry.subtitle !== '' && (
                  <p className="break-words text-sm text-stone-600">{entry.subtitle}</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">
                    {entry.role}
                  </span>
                  {/* Gris a secas es decoración: se dice con palabras. */}
                  {entry.withoutAccess && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
                      Sin acceso
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditing(entry.member.id)}
                className="min-h-touch shrink-0 rounded-lg border border-stone-300 px-3 text-sm"
              >
                Cambiar
              </button>
            </div>

            {!entry.demotable && (
              <p className="mt-2 border-t border-stone-200 pt-2 text-xs text-stone-500">
                {LAST_SUPERUSER_HINT}
              </p>
            )}

            <BottomSheet
              open={editing === entry.member.id}
              onClose={() => setEditing(null)}
              title={entry.title}
            >
              <fieldset disabled={busy}>
                <legend className="label">Qué puede hacer</legend>
                <div className="space-y-2">
                  {roleOptions(entry).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={option.value === entry.member.role}
                      onClick={() => {
                        setEditing(null)
                        if (option.value === entry.member.role) return
                        void act(roleChangedNotice(entry.member, option.value), () =>
                          setRole(entry.member.id, option.value as UserRole),
                        )
                      }}
                      className={`block w-full rounded-lg border p-3 text-left ${
                        option.value === entry.member.role
                          ? 'border-stone-800 bg-stone-50'
                          : 'border-stone-300'
                      }`}
                    >
                      <span className="block font-medium">{option.text}</span>
                      <span className="block text-sm text-stone-600">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* El acceso, separado de los roles: es otra pregunta —si entra o no— y
                  mezclarla como un cuarto rol diría que «sin acceso» es un rol. */}
              <div className="mt-4 border-t border-stone-200 pt-3">
                {entry.withoutAccess ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn min-h-touch w-full border border-stone-300 disabled:opacity-60"
                    onClick={() => {
                      setEditing(null)
                      void act(accessChangedNotice(entry.member, true), () =>
                        setAccess(entry.member.id, true),
                      )
                    }}
                  >
                    Devolver el acceso
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !entry.demotable}
                    className="btn min-h-touch w-full border border-red-200 text-red-800 disabled:opacity-60"
                    onClick={() => {
                      setEditing(null)
                      setRemoving(entry)
                    }}
                  >
                    Quitar el acceso
                  </button>
                )}
              </div>
            </BottomSheet>
          </li>
        ))}
      </ul>

      <ConfirmSheet
        open={removing !== null}
        title={removing ? removeAccessConfirmTitle(removing.member) : ''}
        text={REMOVE_ACCESS_CONFIRM_TEXT}
        confirmLabel="Sí, quitar"
        busy={busy}
        onConfirm={() => {
          const entry = removing
          setRemoving(null)
          if (entry) {
            void act(accessChangedNotice(entry.member, false), () =>
              setAccess(entry.member.id, false),
            )
          }
        }}
        onClose={() => setRemoving(null)}
      />

      {/* Dónde está lo que esta pantalla no hace, dicho donde se busca. */}
      <p className="mt-4 text-xs text-stone-500">
        Nadie se borra: quitar el acceso se deshace y conserva su nombre en las fichas que tocó.
      </p>
    </Layout>
  )
}
