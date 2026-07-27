import { useSyncExternalStore } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { CerrarSesion, Layout } from '../../components/Layout'
import {
  estaInstalada,
  lanzarInstalacion,
  sePuedeInstalar,
  suscribirInstalacion,
} from '../../lib/instalacion'
import { ETIQUETA_ROL } from '../../lib/tipos'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-stone-500">{etiqueta}</dt>
      {/* Nunca un hueco: el dato vacío se dice, no se omite. */}
      <dd className="min-w-0 truncate text-right text-sm">{valor || 'Sin indicar'}</dd>
    </div>
  )
}

/**
 * Botón de instalación de la PWA. Tres estados: ya instalada, instalable con
 * diálogo del navegador, o sin evento disponible (Safari/iOS), donde lo único
 * honesto es explicar el gesto manual — nunca un hueco sin explicación.
 */
function Instalacion() {
  const instalable = useSyncExternalStore(suscribirInstalacion, sePuedeInstalar)

  if (estaInstalada()) {
    return (
      <p className="text-sm text-stone-600">
        La aplicación ya está instalada en este dispositivo.
      </p>
    )
  }

  if (instalable) {
    return (
      <>
        <p className="mb-3 text-sm text-stone-600">
          Instalada ocupa toda la pantalla, arranca al instante y queda con las demás aplicaciones.
        </p>
        <button
          type="button"
          onClick={() => void lanzarInstalacion()}
          className="boton-primario w-full"
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

export function PerfilPage() {
  const { perfil, sesion } = useAuth()

  return (
    <Layout titulo="Mi perfil" atras="/">
      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Cuenta</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Nombre" valor={perfil?.nombre ?? ''} />
          <Dato etiqueta="Correo" valor={perfil?.email ?? sesion?.user.email ?? ''} />
          <Dato etiqueta="Rol" valor={perfil ? ETIQUETA_ROL[perfil.rol] : 'Sin perfil'} />
        </dl>
      </section>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Instalar en el móvil</h2>
        <Instalacion />
      </section>

      <CerrarSesion />
    </Layout>
  )
}
