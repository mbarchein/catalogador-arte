import { useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { useAuth, useEditingAccess } from '../../auth/AuthContext'
import { SignOut, Layout } from '../../components/Layout'
import { AccountName } from './AccountName'
import { ResourceUsage } from './ResourceUsage'
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
import { LockIcon } from '../../components/ui'
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
 * The text size of the whole application (RNF-106).
 *
 * It is here and not in a browser setting because **in the installed PWA there is no browser
 * bar**, and the installed phone is this project's primary device: the system's
 * zoom, which would work —everything is dimensioned in `rem`—, cannot be touched there.
 *
 * Three buttons in a row and not a dropdown: they are three options, and choosing between three
 * visible things is one gesture instead of three. And **the change is applied on touching, not on
 * saving**: what is being chosen is how this very screen looks, so the sample
 * sentence and the buttons themselves already come out at the chosen size. A size setting with a
 * «Guardar» button forces one to leave to see whether one got it right.
 */
function TextSize() {
  const scale = useTextScale()
  const notice = textScaleNotice(scale)

  return (
    <section className="card mb-3">
      <h2 className="mb-1 font-medium">Tamaño de letra</h2>
      <p className="mb-3 text-sm text-stone-600">
        Agranda el texto y los botones. Se guarda en este dispositivo.
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
  const access = useEditingAccess()

  return (
    <Layout title="Mi perfil" back="/">
      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Cuenta</h2>
        {/* El nombre pinta su propia fila porque es la única que se corrige, y así el
            lápiz cae AL LADO del dato: un icono sin rótulo dice qué hace cuando está
            pegado a lo que toca, y no dice nada suelto debajo de tres filas. */}
        <dl className="divide-y divide-stone-100">
          <AccountName />
          <DataRow label="Correo" value={profile?.email ?? session?.user.email ?? ''} />
          <DataRow label="Rol" value={profile ? ROLE_LABEL[profile.role] : 'Sin perfil'} />
        </dl>

        {/* La contraseña tiene su pantalla —se pide dos veces y la escribe el servicio de
            identidad, no esta tabla—, así que es un botón que lleva allí y no un lápiz
            que abre un campo. Con rótulo: nada en la fila dice de qué contraseña se
            habla, y un candado a secas se lee como un aviso de bloqueo. */}
        <Link
          to="/reset-password"
          className="btn mt-3 flex min-h-touch w-full items-center justify-center gap-2 border border-stone-300"
        >
          <LockIcon className="h-4 w-4" />
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
          Qué versión está instalada y qué novedades trajo.
        </p>
        <Link to="/about" className="mt-2 inline-block min-h-touch text-sm underline">
          Abrir la información de la aplicación
        </Link>
      </section>

      {/* Solo para quien cataloga: la base niega la medida a una cuenta de solo
          consulta, así que pintarla sería enseñar un error a quien no puede hacer
          nada al respecto. La sección se monta ya midiendo, y por eso se espera a
          saber el rol en vez de suponerlo. */}
      {access === 'allowed' && <ResourceUsage />}

      <SignOut />
    </Layout>
  )
}
