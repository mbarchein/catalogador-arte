import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { derivarFechaOrden } from '../../lib/fechas'
import { normalizarUbicacion, ubicacionParaGuardar } from '../../lib/ubicacion'
import {
  ANIO_MINIMO,
  ajustarAnio,
  anioMaximo,
  componerFecha,
  type FechaEstructurada,
} from '../../lib/fechaEstructurada'
import {
  ETIQUETA_ARTISTA,
  TIPOS_OBRA_SUGERIDOS,
  type FondoArtista,
  type TriEstado,
} from '../../lib/tipos'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import {
  Fichas,
  IconoCandado,
  Interruptor,
  PasoAnio,
  TriEstadoIconos,
} from '../../components/ui'
import { previsualizarId } from './useObras'
import {
  LOTE_INICIAL,
  guardarLote,
  leerLote,
  loteConfigurado,
  olvidarLote,
  type Lote,
} from './lote'

const FONDOS = [
  { valor: 'ROTILI' as FondoArtista, texto: ETIQUETA_ARTISTA.ROTILI },
  { valor: 'RUIZ_CAMPINS' as FondoArtista, texto: ETIQUETA_ARTISTA.RUIZ_CAMPINS },
]

/**
 * RF-1204 y RF-1205: captura en lote, táctil y a una mano.
 *
 * La pantalla tiene dos estados. Primero se **abre un lote** eligiendo fondo y
 * tipo de obra, que quedan fijos. Después se capturan obras una tras otra sin
 * volver a tocarlos.
 *
 * La distinción entre lo fijo y lo arrastrado es deliberada y está a la vista:
 * los campos fijos aparecen bajo un candado, y cambiarlos exige cerrar el lote.
 * Si fueran simplemente «valores que se conservan», sería fácil arrastrar sin
 * darse cuenta un tipo de obra a una pieza que no lo es, y eso es un dato falso
 * en el catálogo, no una molestia de interfaz.
 */
export function CapturaPage() {
  const navegar = useNavigate()
  const { puedeEditar } = useAuth()

  const [lote, setLote] = useState<Lote>(() => leerLote())
  const [abierto, setAbierto] = useState(() => loteConfigurado(leerLote()))

  // Campos de la obra concreta: nunca se arrastran.
  const [titulo, setTitulo] = useState('')
  const [alto, setAlto] = useState('')
  const [ancho, setAncho] = useState('')
  const [profundidad, setProfundidad] = useState('')
  const [firmada, setFirmada] = useState<TriEstado>('SIN_REVISAR')

  const [rango, setRango] = useState(false)
  const [idPrevisto, setIdPrevisto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadas, setGuardadas] = useState<string[]>([])

  useEffect(() => {
    guardarLote(lote)
  }, [lote])

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    void previsualizarId(lote.fijos.artista).then((id) => {
      if (vigente) setIdPrevisto(id)
    })
    return () => {
      vigente = false
    }
  }, [abierto, lote.fijos.artista, guardadas.length])

  if (!puedeEditar) {
    return (
      <Layout miga="Captura">
        <div className="tarjeta">
          <p className="font-medium">No tienes permiso para dar de alta obra.</p>
          <p className="mt-1 text-sm text-stone-600">
            Tu cuenta es de solo consulta. Habla con el responsable del catálogo si necesitas
            catalogar.
          </p>
          <Link to="/" className="boton-secundario mt-4">
            Volver al listado
          </Link>
        </div>
      </Layout>
    )
  }

  const fecha = lote.arrastrados.fecha
  function ponerFecha(cambio: Partial<FechaEstructurada>) {
    setLote((l) => ({
      ...l,
      arrastrados: { ...l.arrastrados, fecha: { ...l.arrastrados.fecha, ...cambio } },
    }))
  }

  // ── Apertura del lote ─────────────────────────────────────
  if (!abierto) {
    const esSugerido = TIPOS_OBRA_SUGERIDOS.includes(lote.fijos.tipoObra)
    return (
      <Layout miga="Abrir lote">
        <div className="tarjeta space-y-5">
          <div>
            <h1 className="text-lg font-semibold">Abrir un lote</h1>
            <p className="text-sm text-stone-600">
              Estos dos datos quedan fijos para todas las obras que captures seguidas. Para cambiarlos
              habrá que cerrar el lote.
            </p>
          </div>

          <Fichas
            id="fondo"
            etiqueta="Fondo"
            opciones={FONDOS}
            valor={lote.fijos.artista}
            alCambiar={(v) => setLote((l) => ({ ...l, fijos: { ...l.fijos, artista: v } }))}
          />

          <div>
            <Fichas
              id="tipo"
              etiqueta="Tipo de obra"
              opciones={TIPOS_OBRA_SUGERIDOS.map((t) => ({ valor: t, texto: t }))}
              valor={esSugerido ? lote.fijos.tipoObra : null}
              alCambiar={(v) => setLote((l) => ({ ...l, fijos: { ...l.fijos, tipoObra: v } }))}
            />
            {/* Lista abierta (RF-213): las fichas sugieren, no cierran. */}
            <input
              className="campo mt-2"
              placeholder="U otro tipo, escríbelo"
              value={esSugerido ? '' : lote.fijos.tipoObra}
              onChange={(e) =>
                setLote((l) => ({ ...l, fijos: { ...l.fijos, tipoObra: e.target.value } }))
              }
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="ubicacion-lote">
              Ubicación física
            </label>
            <input
              id="ubicacion-lote"
              className="campo"
              autoCapitalize="none"
              placeholder="edificio a, habitacion amarilla, bloque 3"
              value={lote.arrastrados.ubicacion}
              onChange={(e) =>
                setLote((l) => ({
                  ...l,
                  arrastrados: { ...l.arrastrados, ubicacion: normalizarUbicacion(e.target.value) },
                }))
              }
            />
            <p className="mt-1 text-xs text-stone-500">
              Se arrastra de una obra a la siguiente, pero se puede ajustar en cada una: no queda
              fija como el fondo y el tipo.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="boton-primario flex-1"
              disabled={!loteConfigurado(lote)}
              onClick={() => setAbierto(true)}
            >
              Empezar a capturar
            </button>
            <button type="button" className="boton-secundario" onClick={() => navegar('/')}>
              Listado
            </button>
          </div>
          {!loteConfigurado(lote) && (
            <p className="text-xs text-stone-500">Elige o escribe un tipo de obra para empezar.</p>
          )}
        </div>
      </Layout>
    )
  }

  // ── Captura ───────────────────────────────────────────────

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const aNumero = (v: string) => {
      const limpio = v.replace(',', '.').trim()
      if (limpio === '') return null
      const n = Number(limpio)
      return Number.isFinite(n) ? n : null
    }

    const textoFecha = componerFecha(rango ? fecha : { ...fecha, anioFin: null })

    // id_catalogacion se omite: lo asigna la base con un cerrojo por fondo
    // (ADR-003). Generarlo aquí produciría duplicados en cuanto dos personas
    // capturasen a la vez.
    const { data, error } = await supabase
      .from('obras')
      .insert({
        artista: lote.fijos.artista,
        tipo_obra: lote.fijos.tipoObra.trim(),
        titulo: titulo.trim(),
        alto_cm: aNumero(alto),
        ancho_cm: aNumero(ancho),
        profundidad_cm: aNumero(profundidad),
        tecnica: lote.arrastrados.tecnica.trim(),
        fecha_ejecucion: textoFecha,
        fecha_orden: derivarFechaOrden(textoFecha),
        firmada,
        ubicacion_fisica: ubicacionParaGuardar(lote.arrastrados.ubicacion),
      })
      .select('id_catalogacion')
      .single()

    if (error) {
      // No se limpia nada: en un almacén con cobertura intermitente, volver a
      // teclear todo es inaceptable (RF-1207).
      setError(error.message)
      setGuardando(false)
      return
    }

    setGuardadas((g) => [...g, (data as { id_catalogacion: string }).id_catalogacion])

    // Solo se limpia lo que pertenece a la pieza. Fondo y tipo siguen fijos; la
    // fecha, la técnica y la ubicación se arrastran tal como quedaron.
    setTitulo('')
    setAlto('')
    setAncho('')
    setProfundidad('')
    setFirmada('SIN_REVISAR')
    setGuardando(false)
  }

  const ultima = guardadas[guardadas.length - 1]

  return (
    <Layout miga="Captura en lote">
      {/* Cabecera del lote: lo fijo, bajo candado y siempre a la vista. Saber qué
          se está heredando es lo que impide descubrir a las treinta obras que el
          tipo estaba mal. */}
      <div className="mb-3 rounded-xl border-2 border-stone-800 bg-stone-800 p-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-stone-300">
              <IconoCandado />
              Fijo en este lote
            </p>
            <p className="mt-0.5 truncate font-medium">
              {ETIQUETA_ARTISTA[lote.fijos.artista]} · {lote.fijos.tipoObra}
            </p>
            <p className="mt-0.5 text-xs text-stone-300">
              {guardadas.length === 0
                ? 'Ninguna obra guardada todavía'
                : `${guardadas.length} ${guardadas.length === 1 ? 'obra' : 'obras'} en este lote`}
              {idPrevisto && ` · siguiente ${idPrevisto}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="min-h-toque shrink-0 rounded-lg border border-stone-500 px-3 text-sm"
          >
            Cambiar
          </button>
        </div>
      </div>

      {ultima && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm"
        >
          <p className="font-medium text-green-900">Guardada como {ultima}</p>
          <p className="mt-0.5 text-green-800">
            Escribe ese código en la etiqueta.{' '}
            <Link to={`/obra/${ultima}`} className="underline">
              Ver la ficha
            </Link>
          </p>
        </div>
      )}

      <form onSubmit={guardar} className="space-y-3">
        <div className="tarjeta space-y-4">
          <div>
            <label className="etiqueta" htmlFor="titulo">
              Título <span className="font-normal text-stone-500">(vacío si no tiene)</span>
            </label>
            <input
              id="titulo"
              className="campo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div>
            <p className="etiqueta">Medidas en centímetros</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['alto', 'Alto', alto, setAlto],
                  ['ancho', 'Ancho', ancho, setAncho],
                  ['prof', 'Prof.', profundidad, setProfundidad],
                ] as const
              ).map(([id, etiqueta, valor, poner]) => (
                <div key={id}>
                  <label className="mb-1 block text-xs text-stone-500" htmlFor={id}>
                    {etiqueta}
                  </label>
                  <input
                    id={id}
                    className="campo h-14 text-center text-xl tabular-nums"
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) => poner(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <TriEstadoIconos
            id="firmada"
            etiqueta="Firmada"
            valor={firmada}
            alCambiar={setFirmada}
          />
        </div>

        {/* ── Fecha: se arrastra y se ajusta con los botones ── */}
        <div className="tarjeta space-y-3">
          <PasoAnio
            id="anio"
            etiqueta={rango ? 'Año inicial' : 'Año de ejecución'}
            valor={fecha.anio}
            minimo={ANIO_MINIMO}
            maximo={anioMaximo()}
            alCambiar={(anio) => ponerFecha({ anio })}
          />

          <div className="grid grid-cols-2 gap-2">
            <Interruptor
              etiqueta="Aproximada"
              ayuda="c. 1980 — de alrededor de ese año"
              activo={fecha.aproximada}
              alCambiar={(v) => ponerFecha({ aproximada: v })}
            />
            <Interruptor
              etiqueta="Rango"
              ayuda="1975-1978"
              activo={rango}
              alCambiar={(v) => {
                setRango(v)
                // Al abrir el rango se propone el año siguiente, para que el
                // primer toque del + ya sirva de algo.
                if (v && fecha.anio != null && fecha.anioFin == null) {
                  ponerFecha({ anioFin: ajustarAnio(fecha.anio, 1) })
                }
              }}
            />
          </div>

          {/* A ancho completo y separado de los dos de arriba porque dice algo
              más grave: «Aproximada» es «la obra es de alrededor de 1980», con el
              periodo establecido; «Sin confirmar» es «no sabemos de cuándo es, y
              este año es lo que estimamos». */}
          <Interruptor
            etiqueta="Sin confirmar"
            ayuda="[?] — se desconoce; el año es una estimación"
            activo={fecha.sinConfirmar}
            alCambiar={(v) => ponerFecha({ sinConfirmar: v })}
          />

          {rango && (
            <PasoAnio
              id="anio-fin"
              etiqueta="Año final"
              valor={fecha.anioFin}
              minimo={ANIO_MINIMO}
              maximo={anioMaximo()}
              alCambiar={(anioFin) => ponerFecha({ anioFin })}
            />
          )}

          {/* Se muestra lo que se va a guardar, no lo que se ha pulsado: el campo
              del esquema es texto, y conviene ver el texto. */}
          {/* aria-live: al pulsar «Aproximada» o «Rango» el texto cambia sin que el
              foco se mueva, así que quien use lector de pantalla no se enteraría. */}
          <p
            id="vista-fecha"
            aria-live="polite"
            className="rounded-lg bg-stone-100 px-3 py-2 text-sm"
          >
            {fecha.anio == null ? (
              <span className="text-stone-500">Sin fechar</span>
            ) : (
              <>
                Se guardará como{' '}
                <span className="font-medium">
                  {componerFecha(rango ? fecha : { ...fecha, anioFin: null })}
                </span>
              </>
            )}
          </p>

          <div>
            <label className="etiqueta" htmlFor="tecnica">
              Técnica
            </label>
            <input
              id="tecnica"
              className="campo"
              placeholder="Óleo sobre lienzo"
              value={lote.arrastrados.tecnica}
              onChange={(e) =>
                setLote((l) => ({ ...l, arrastrados: { ...l.arrastrados, tecnica: e.target.value } }))
              }
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="ubicacion">
              Ubicación física
            </label>
            <input
              id="ubicacion"
              className="campo"
              autoCapitalize="none"
              value={lote.arrastrados.ubicacion}
              onChange={(e) =>
                setLote((l) => ({
                  ...l,
                  arrastrados: { ...l.arrastrados, ubicacion: normalizarUbicacion(e.target.value) },
                }))
              }
            />
          </div>

          <p className="text-xs text-stone-500">
            Fecha, técnica y ubicación se arrastran a la obra siguiente tal como los dejes.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No se ha podido guardar: {error}
            <br />
            Los datos siguen aquí, puedes reintentarlo.
          </p>
        )}

        <button className="boton-primario min-h-[3.5rem] w-full text-lg" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar y siguiente'}
        </button>

        {guardadas.length > 0 && (
          <div className="tarjeta">
            <p className="text-sm font-medium">Guardadas en este lote</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {guardadas.map((id) => (
                <li key={id}>
                  <Link
                    to={`/obra/${id}`}
                    className="inline-block rounded bg-stone-100 px-2 py-1 font-mono text-xs underline"
                  >
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">
              Comprueba que las etiquetas físicas coinciden con esta lista antes de cerrar el lote.
            </p>
          </div>
        )}

        <div className="flex gap-2 pb-4">
          <button type="button" className="boton-secundario flex-1" onClick={() => navegar('/')}>
            Ir al listado
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => {
              olvidarLote()
              setLote(LOTE_INICIAL)
              setGuardadas([])
              setRango(false)
              setAbierto(false)
            }}
          >
            Cerrar lote
          </button>
        </div>
      </form>
    </Layout>
  )
}
