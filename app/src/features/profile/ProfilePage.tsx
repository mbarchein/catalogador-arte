import { useEffect, useState, useSyncExternalStore } from 'react'
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
import {
  BUILD,
  apiHost,
  cleanRange,
  formatBuildDate,
  platformInfo,
  type PlatformInfo,
} from '../../lib/buildInfo'

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
 * Version of what is running, on both sides. It goes last because it is not
 * read daily, and it exists because «it works in local but not in production»
 * gets answered by comparing these lines — without opening any dashboard.
 */
function Diagnostics() {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)

  useEffect(() => {
    let current = true
    void platformInfo().then((info) => {
      if (current) setPlatform(info)
    })
    return () => {
      current = false
    }
  }, [])

  return (
    <section className="card mb-3">
      <h2 className="mb-2 font-medium">Versión</h2>

      <dl className="divide-y divide-stone-100">
        <DataRow label="Aplicación" value={BUILD.version} />
        <DataRow label="Compilada" value={formatBuildDate()} />
        {/* In local there is no commit: the environment does not provide one,
            and saying «desarrollo» beats showing an empty datum. */}
        <DataRow label="Revisión" value={BUILD.commit || 'desarrollo'} />
      </dl>

      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">
        Interfaz
      </h3>
      <dl className="divide-y divide-stone-100">
        <DataRow label="React" value={cleanRange(BUILD.deps.react)} />
        <DataRow label="React Router" value={cleanRange(BUILD.deps['react-router-dom'])} />
        <DataRow label="Cliente Supabase" value={cleanRange(BUILD.deps['@supabase/supabase-js'])} />
        <DataRow label="Vite" value={`${cleanRange(BUILD.deps.vite)} (compilación)`} />
      </dl>

      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">
        Servicios
      </h3>
      <dl className="divide-y divide-stone-100">
        <DataRow label="API y datos" value={apiHost()} />
        <DataRow label="PostgreSQL" value={platform?.postgres ?? 'Consultando…'} />
        <DataRow
          label="Esquema"
          value={
            platform
              ? `${platform.schema_version ?? 'sin registro'} · ${platform.migrations} migraciones`
              : 'Consultando…'
          }
        />
        {/* Named, not versioned: the masters' provider is decided by the Edge
            function's configuration (B2 in production, MinIO in local) and the
            client legitimately does not know which one answered. */}
        <DataRow label="Másters de archivo" value="S3 externo vía función sign-file" />
      </dl>
    </section>
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

      <Diagnostics />

      <SignOut />
    </Layout>
  )
}
