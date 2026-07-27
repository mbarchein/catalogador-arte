import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { mostrarFecha } from '../../lib/fechas'
import { avisoExistencia, mostrarMedidas, mostrarTitulo } from '../../lib/titulo'
import { ETIQUETA_ARTISTA } from '../../lib/tipos'
import { useCambiosEnVivo } from '../../lib/enVivo'
import { useObras } from './useObras'

export function ObrasPage() {
  const [busqueda, setBusqueda] = useState('')
  const { obras, miniaturas, cargando, error, recargar } = useObras(busqueda)
  const { puedeEditar } = useAuth()

  // El listado se actualiza en caliente: si otro catalogador da de alta o edita
  // una obra, aparece sin recargar. Es la vista donde dos personas trabajando a
  // la vez se pisan sin saberlo.
  useCambiosEnVivo('obras', recargar)

  return (
    <Layout
      titulo="Obras"
      // RF-1104: el botón de alta solo para quien puede editar. En la cabecera
      // fija queda disponible también con el listado desplazado — con cientos de
      // obras, «capturar la siguiente» no debe exigir volver arriba.
      accion={
        puedeEditar ? (
          <Link to="/captura" className="boton-primario min-h-[2.5rem] px-4 text-sm">
            + Nueva
          </Link>
        ) : undefined
      }
    >
      <div className="mb-4">
        <input
          className="campo"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o título"
          aria-label="Buscar obras"
        />
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No se ha podido cargar el listado: {error}
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-stone-600">Cargando…</p>
      ) : obras.length === 0 ? (
        /* RF-605: nunca una página en blanco. Se mantiene la búsqueda y se
           explica qué ha pasado en el lugar donde iría la lista. */
        <div className="tarjeta text-sm">
          {busqueda.trim() === '' ? (
            <>
              <p className="font-medium">Todavía no hay obra catalogada.</p>
              {puedeEditar && (
                <p className="mt-1 text-stone-600">
                  Empieza por la <Link to="/captura" className="underline">captura rápida</Link>.
                </p>
              )}
            </>
          ) : (
            <p>No se han encontrado obras con estos criterios.</p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-stone-500">
            {obras.length} {obras.length === 1 ? 'obra' : 'obras'}
          </p>
          <ul className="space-y-2">
            {obras.map((obra) => {
              const aviso = avisoExistencia(obra)
              return (
                <li key={obra.id_catalogacion}>
                  {/* El código es el único enlace a la ficha (RF-604), pero en
                      móvil toda la tarjeta debe ser pulsable: apuntar a un texto
                      de doce caracteres con el pulgar no es razonable. */}
                  <Link
                    to={`/obra/${obra.id_catalogacion}`}
                    className="tarjeta flex gap-3 hover:border-stone-400"
                  >
                    {/* RF-604: miniatura de la imagen representativa. Cuál es la
                        decide la vista de la base de datos, no esta pantalla. */}
                    <Miniatura url={miniaturas[obra.id_catalogacion]} fotografiada={obra.fotografiada} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {obra.id_catalogacion}
                        </span>
                        <span className="shrink-0 text-xs text-stone-500">
                          {mostrarFecha(obra.fecha_ejecucion)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate">{mostrarTitulo(obra.titulo)}</p>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {ETIQUETA_ARTISTA[obra.artista]}
                        {obra.tipo_obra && ` · ${obra.tipo_obra}`}
                        {' · '}
                        {mostrarMedidas(obra)}
                      </p>
                      {aviso && (
                        <p className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                          {aviso}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Layout>
  )
}

/**
 * Miniatura del listado, de tamaño fijo para que las filas no bailen mientras las
 * imágenes llegan: el listado se pinta antes que las firmas de las URL, y sin una
 * caja reservada el texto saltaría al aparecer cada foto.
 *
 * Tres estados distintos, y distinguirlos importa:
 *  - hay foto y ya tenemos su URL → se muestra;
 *  - la obra está fotografiada pero la URL aún no ha llegado → hueco neutro;
 *  - la obra no tiene ninguna foto → se dice, porque en un inventario «sin
 *    fotografiar» es trabajo pendiente y conviene que se vea de un vistazo.
 */
function Miniatura({ url, fotografiada }: { url?: string; fotografiada: boolean }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-lg border border-stone-200 bg-white object-cover"
      />
    )
  }
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-1 text-center text-[10px] leading-tight text-stone-400"
      aria-hidden={fotografiada}
    >
      {fotografiada ? '' : 'Sin foto'}
    </div>
  )
}
