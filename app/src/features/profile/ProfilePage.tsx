import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { SignOut, Layout } from '../../components/Layout'
import {
  isInstalled,
  launchInstall,
  canInstall,
  subscribeInstall,
} from '../../lib/installation'
import { ROLE_LABEL } from '../../lib/types'

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-stone-500">{label}</dt>
      {/* Never a gap: an empty datum is stated, not omitted. */}
      <dd className="min-w-0 truncate text-right text-sm">{value || 'Sin indicar'}</dd>
    </div>
  )
}

/**
 * PWA install button. Three states: already installed, installable with the
 * browser dialog, or no event available (Safari/iOS), where the only honest
 * thing is explaining the manual gesture — never an unexplained gap.
 */
function Installation() {
  const installable = useSyncExternalStore(subscribeInstall, canInstall)

  if (isInstalled()) {
    return (
      <p className="text-sm text-stone-600">
        La aplicación ya está instalada en este dispositivo.
      </p>
    )
  }

  if (installable) {
    return (
      <>
        <p className="mb-3 text-sm text-stone-600">
          Instalada ocupa toda la pantalla, arranca al instante y queda con las demás aplicaciones.
        </p>
        <button
          type="button"
          onClick={() => void launchInstall()}
          className="btn-primary w-full"
        >
          Instalar como aplicación
        </button>
      </>
    )
  }

  return (
    <p className="text-sm text-stone-600">
      Si el navegador no ofrece instalarla, en iPhone o iPad: <strong>Compartir</strong> →{' '}
      <strong>«Añadir a pantalla de inicio»</strong>.
    </p>
  )
}

export function ProfilePage() {
  const { profile, session } = useAuth()

  return (
    <Layout title="Mi perfil" back="/">
      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Cuenta</h2>
        <dl className="divide-y divide-stone-100">
          <DataRow label="Nombre" value={profile?.name ?? ''} />
          <DataRow label="Correo" value={profile?.email ?? session?.user.email ?? ''} />
          <DataRow label="Rol" value={profile ? ROLE_LABEL[profile.role] : 'Sin perfil'} />
        </dl>
        <Link
          to="/reset-password"
          className="mt-2 inline-block min-h-touch text-sm text-stone-600 underline hover:text-stone-800"
        >
          Cambiar la contraseña
        </Link>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Instalar en el móvil</h2>
        <Installation />
      </section>

      <SignOut />
    </Layout>
  )
}
