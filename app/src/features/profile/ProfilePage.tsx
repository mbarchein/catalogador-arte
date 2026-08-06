import { useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { SignOut, Layout } from '../../components/Layout'
import {
  isInstalled,
  launchInstall,
  canInstall,
  subscribeInstall,
} from '../../lib/installation'
import {
  TEXT_SCALE_SAMPLE,
  TEXT_SCALES,
  textScaleNotice,
  textScaleOptionText,
} from '../../lib/textScale'
import { ROLE_LABEL } from '../../lib/types'
import { setTextScale, useTextScale } from '../../lib/useTextScale'

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

/**
 * El tamaño de letra de toda la aplicación (RNF-106).
 *
 * Está aquí y no en un ajuste del navegador porque **en la PWA instalada no hay barra de
 * navegador**, y el móvil instalado es el dispositivo principal de este proyecto: el zoom
 * del sistema, que funcionaría —todo está dimensionado en `rem`—, ahí no se puede tocar.
 *
 * Tres botones en una fila y no un desplegable: son tres opciones, y elegir entre tres
 * cosas visibles es un gesto en vez de tres. Y **el cambio se aplica al tocar, no al
 * guardar**: lo que se está eligiendo es cómo se ve esta misma pantalla, así que la frase
 * de muestra y los propios botones ya salen al tamaño elegido. Un ajuste de tamaño con un
 * botón «Guardar» obliga a salir para ver si acertaste.
 */
function TextSize() {
  const scale = useTextScale()
  const notice = textScaleNotice(scale)

  return (
    <section className="card mb-3">
      <h2 className="mb-1 font-medium">Tamaño de letra</h2>
      <p className="mb-3 text-sm text-stone-600">
        Agranda el texto de toda la aplicación, y con él los botones. Se guarda en este
        dispositivo, así que cada móvil u ordenador tiene el suyo.
      </p>

      <div role="radiogroup" aria-label="Tamaño de letra" className="grid grid-cols-3 gap-2">
        {TEXT_SCALES.map((option) => {
          const active = option === scale
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTextScale(option)}
              className={`min-h-touch rounded-lg border px-2 py-2 text-sm ${
                active
                  ? 'border-stone-800 bg-stone-800 text-white'
                  : 'border-stone-300 bg-white text-stone-800 active:bg-stone-50'
              }`}
            >
              {textScaleOptionText(option)}
            </button>
          )
        })}
      </div>

      {/* La muestra, con un dato de verdad y no «Lorem ipsum»: lo que hay que poder leer es
          un título de obra con su código y su sitio, que es lo que se lee todo el día. */}
      <p className="mt-3 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
        {TEXT_SCALE_SAMPLE}
      </p>

      {notice !== null && <p className="mt-2 text-xs text-stone-500">{notice}</p>}
    </section>
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

      <TextSize />

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Instalar en el móvil</h2>
        <Installation />
      </section>

      {/* La información de la aplicación —qué versión corre, qué se puede hacer y qué
          no, y las novedades— vive en su propia pantalla: aquí es la CUENTA lo que se
          consulta, y mezclarlas hacía del perfil una lista de cosas sin relación. */}
      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Sobre la aplicación</h2>
        <p className="text-sm text-stone-600">
          Qué versión está instalada, las novedades que trajo y lo que todavía no se puede
          hacer desde aquí.
        </p>
        <Link to="/about" className="mt-2 inline-block min-h-touch text-sm underline">
          Abrir la información de la aplicación
        </Link>
      </section>

      <SignOut />
    </Layout>
  )
}
