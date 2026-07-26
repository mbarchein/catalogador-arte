import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
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
  BarraAcciones,
  Conmutador,
  Fichas,
  Grupo,
  IconoCandado,
  PasoAnio,
  TriEstadoIconos,
} from '../../components/ui'
import { subirToma } from '../../lib/imagenes'
import { SelectorFotos, type TomaEnCola } from './SelectorFotos'
import { guardarCola, leerCola, rehidratar, vaciarCola } from './colaFotos'
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
  const [tomas, setTomas] = useState<TomaEnCola[]>([])
  // Obra ya creada cuyas fotos no acabaron de subir. Mientras tenga valor, el
  // botón reintenta la subida en vez de dar de alta otra obra: en un almacén con
  // cobertura intermitente, el fallo a mitad es lo normal, y crear una segunda
  // ficha por ello sería justo el duplicado que el esquema teme.
  const [obraPendiente, setObraPendiente] = useState<string | null>(null)
  const [colaRestaurada, setColaRestaurada] = useState(false)

  useEffect(() => {
    guardarLote(lote)
  }, [lote])

  // Restaura las fotos que quedaron pendientes. Es la red de seguridad ante que el
  // móvil descarte la pestaña mientras la cámara está en primer plano: al volver,
  // la página se recarga y sin esto las fotos ya tomadas desaparecerían.
  useEffect(() => {
    let vigente = true
    void leerCola().then((filas) => {
      if (!vigente) return
      if (filas.length > 0) {
        setTomas(filas.map((f) => ({ ...rehidratar(f), estado: 'pendiente' as const })))
      }
      setColaRestaurada(true)
    })
    return () => {
      vigente = false
    }
  }, [])

  // Se persiste en cuanto cambia, no al guardar: el descarte de la pestaña no
  // avisa, y guardar «cuando toque» sería exactamente tarde.
  //
  // El guardia de `colaRestaurada` no es una precaución teórica: sin él, este
  // efecto se ejecuta al montar con la cola todavía vacía y BORRA lo que acaba de
  // guardarse, con lo que la red de seguridad destruía justo lo que venía a
  // salvar. Se vio al reproducir el fallo.
  useEffect(() => {
    if (!colaRestaurada) return
    void guardarCola(tomas)
  }, [tomas, colaRestaurada])

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
      <Layout titulo="Captura" atras="/">
        <div className="tarjeta">
          <p className="font-medium">No tienes permiso para dar de alta obra.</p>
          <p className="mt-1 text-sm text-stone-600">
            Tu cuenta es de solo consulta. Habla con el responsable del catálogo si necesitas
            catalogar.
          </p>
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
      <Layout titulo="Abrir lote" atras="/">
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Un lote agrupa las obras que vas a capturar seguidas: una estantería, una carpeta, una
            serie.
          </p>

          <Grupo titulo="Fijo en todo el lote" pista="cambiarlo exige cerrar el lote">
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
                columnas={3}
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
          </Grupo>

          <Grupo titulo="Ubicación física" pista="se arrastra, ajustable en cada obra">
            <input
              id="ubicacion-lote"
              className="campo"
              autoCapitalize="none"
              aria-label="Ubicación física"
              placeholder="edificio a, habitacion amarilla, bloque 3"
              value={lote.arrastrados.ubicacion}
              onChange={(e) =>
                setLote((l) => ({
                  ...l,
                  arrastrados: { ...l.arrastrados, ubicacion: normalizarUbicacion(e.target.value) },
                }))
              }
            />
          </Grupo>

          <BarraAcciones
            aviso={
              !loteConfigurado(lote) ? (
                <p className="text-xs text-stone-500">
                  Elige o escribe un tipo de obra para empezar.
                </p>
              ) : null
            }
          >
            <button
              type="button"
              className="boton-primario min-h-[3.25rem] flex-1 text-base"
              disabled={!loteConfigurado(lote)}
              onClick={() => setAbierto(true)}
            >
              Empezar a capturar
            </button>
          </BarraAcciones>
        </div>
      </Layout>
    )
  }

  // ── Captura ───────────────────────────────────────────────

  /**
   * Sube las tomas que aún no están arriba, de una en una. Secuencial y no en
   * paralelo a propósito: tres ficheros por foto sobre una conexión de almacén se
   * estorban entre sí, y el progreso foto a foto es lo que permite saber qué falta
   * si algo se corta.
   */
  async function subirPendientes(idObra: string, cola: TomaEnCola[]): Promise<TomaEnCola[]> {
    let actual = cola
    for (const t of cola) {
      if (t.estado === 'subida') continue
      actual = actual.map((x) =>
        x.clave === t.clave ? { ...x, estado: 'subiendo' as const, error: undefined } : x,
      )
      setTomas(actual)
      try {
        await subirToma(idObra, t.preparada, { tipoToma: t.tipoToma, esIndice: t.esIndice })
        actual = actual.map((x) => (x.clave === t.clave ? { ...x, estado: 'subida' as const } : x))
      } catch (err) {
        actual = actual.map((x) =>
          x.clave === t.clave
            ? { ...x, estado: 'error' as const, error: err instanceof Error ? err.message : String(err) }
            : x,
        )
      }
      setTomas(actual)
    }
    return actual
  }

  function limpiarPieza(idGuardada: string) {
    tomas.forEach((t) => URL.revokeObjectURL(t.preparada.previsualizacion))
    setTomas([])
    void vaciarCola()
    setObraPendiente(null)
    setGuardadas((g) => (g.includes(idGuardada) ? g : [...g, idGuardada]))
    setTitulo('')
    setAlto('')
    setAncho('')
    setProfundidad('')
    setFirmada('SIN_REVISAR')
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    // Reintento: la obra ya existe y solo faltan fotos.
    if (obraPendiente) {
      const resultado = await subirPendientes(obraPendiente, tomas)
      const fallidas = resultado.filter((t) => t.estado === 'error')
      if (fallidas.length === 0) {
        limpiarPieza(obraPendiente)
      } else {
        setError(`Siguen fallando ${fallidas.length} de ${resultado.length} fotos.`)
      }
      setGuardando(false)
      return
    }

    const aNumero = (v: string) => {
      const limpio = v.replace(',', '.').trim()
      if (limpio === '') return null
      const n = Number(limpio)
      return Number.isFinite(n) ? n : null
    }

    // id_catalogacion se omite: lo asigna la base con un cerrojo por fondo
    // (ADR-003). Y fecha_ejecucion NO se envía: es una columna generada que la
    // base compone desde los campos estructurados (ADR-004) — escribirla sería
    // un error, y así texto y estructura no pueden divergir.
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
        anio_inicio: fecha.anio,
        anio_fin: rango ? fecha.anioFin : null,
        fecha_aproximada: fecha.anio != null && fecha.aproximada,
        fecha_sin_confirmar: fecha.anio != null && fecha.sinConfirmar,
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

    const id = (data as { id_catalogacion: string }).id_catalogacion

    // La obra ya existe; ahora las fotos. Si alguna falla, la ficha NO se pierde:
    // queda anotada como pendiente y el botón pasa a reintentar solo las fotos.
    if (tomas.length > 0) {
      const resultado = await subirPendientes(id, tomas)
      const fallidas = resultado.filter((t) => t.estado === 'error')
      if (fallidas.length > 0) {
        setObraPendiente(id)
        setError(
          `La ficha ${id} se ha guardado, pero ${fallidas.length} de ${resultado.length} fotos no han subido.`,
        )
        setGuardando(false)
        return
      }
    }

    // Solo se limpia lo que pertenece a la pieza. Fondo y tipo siguen fijos; la
    // fecha, la técnica y la ubicación se arrastran tal como quedaron.
    limpiarPieza(id)
    setGuardando(false)
  }

  const ultima = guardadas[guardadas.length - 1]

  return (
    <Layout titulo="Captura en lote" atras="/">
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

      <form onSubmit={guardar} className="space-y-3">
        {/* El orden de los grupos sigue el gesto físico: se llega a la obra, se
            FOTOGRAFÍA, se mide y se examina, y solo al final se ajusta lo que se
            arrastra de la pieza anterior — que la mayoría de las veces no se toca. */}

        <Grupo
          titulo="Fotografías"
          pista={tomas.length > 0 ? `${tomas.length} en cola` : 'la primera será la del índice'}
        >
          <SelectorFotos tomas={tomas} alCambiar={setTomas} deshabilitado={guardando} />
        </Grupo>

        <Grupo titulo="Esta pieza" pista="se vacía al guardar">
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
        </Grupo>

        <Grupo titulo="Fecha de ejecución" pista="se arrastra a la siguiente">
          {rango ? (
            /* Las dos fechas del rango en la misma línea: son un solo dato. */
            <div className="grid grid-cols-2 gap-2">
              <PasoAnio
                id="anio"
                etiqueta="Año inicial"
                compacto
                valor={fecha.anio}
                minimo={ANIO_MINIMO}
                maximo={anioMaximo()}
                alCambiar={(anio) => ponerFecha({ anio })}
              />
              <PasoAnio
                id="anio-fin"
                etiqueta="Año final"
                compacto
                valor={fecha.anioFin}
                minimo={ANIO_MINIMO}
                maximo={anioMaximo()}
                alCambiar={(anioFin) => ponerFecha({ anioFin })}
              />
            </div>
          ) : (
            <PasoAnio
              id="anio"
              etiqueta="Año"
              valor={fecha.anio}
              minimo={ANIO_MINIMO}
              maximo={anioMaximo()}
              alCambiar={(anio) => ponerFecha({ anio })}
            />
          )}

          {/* Las tres banderas en una línea, con el mismo lenguaje visual que el
              Sí/No/Sin revisar. Lo que cada una significa vive en la línea de
              ayuda de abajo, una sola vez. */}
          <div className="grid grid-cols-3 gap-2">
            <Conmutador
              etiqueta="Aproximada"
              activo={fecha.aproximada}
              alCambiar={(v) => ponerFecha({ aproximada: v })}
            />
            <Conmutador
              etiqueta="Rango"
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
            <Conmutador
              etiqueta="Sin confirmar"
              activo={fecha.sinConfirmar}
              alCambiar={(v) => ponerFecha({ sinConfirmar: v })}
            />
          </div>

          <p className="text-xs text-stone-500">
            «Aproximada»: de alrededor de ese año (c.). «Sin confirmar»: se desconoce; el año es
            una estimación ([?]).
          </p>

          {/* Se muestra lo que se va a guardar. aria-live porque el texto cambia
              sin que el foco se mueva. */}
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
        </Grupo>

        <Grupo titulo="Técnica y ubicación" pista="se arrastran a la siguiente">
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
        </Grupo>

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

        <button
          type="button"
          className="boton-secundario w-full"
          onClick={() => {
            olvidarLote()
            void vaciarCola()
            tomas.forEach((t) => URL.revokeObjectURL(t.preparada.previsualizacion))
            setTomas([])
            setLote(LOTE_INICIAL)
            setGuardadas([])
            setRango(false)
            setAbierto(false)
          }}
        >
          Cerrar lote
        </button>

        {/* Barra fija: guardar siempre bajo el pulgar, y el resultado de guardar
            —el código que hay que escribir en la etiqueta física— siempre a la
            vista, no arriba de la página donde habría que ir a buscarlo. */}
        <BarraAcciones
          aviso={
            error ? (
              <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
                No se ha podido guardar: {error} Los datos siguen aquí.
              </p>
            ) : ultima ? (
              <p
                role="status"
                className="flex items-baseline justify-between gap-2 rounded-lg bg-green-50 p-2 text-sm text-green-900"
              >
                <span>
                  Guardada como{' '}
                  <span className="font-mono text-base font-bold">{ultima}</span> — escríbelo en
                  la etiqueta
                </span>
                <Link to={`/obra/${ultima}`} className="shrink-0 underline">
                  Ver ficha
                </Link>
              </p>
            ) : null
          }
        >
          {obraPendiente && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                // Salida honesta: la ficha existe y se completa después desde su
                // página. Lo que no se hace es fingir que las fotos subieron.
                limpiarPieza(obraPendiente)
                setError(null)
              }}
            >
              Sin esas fotos
            </button>
          )}
          <button className="boton-primario min-h-[3.25rem] flex-1 text-base" disabled={guardando}>
            {guardando
              ? 'Guardando…'
              : obraPendiente
                ? `Reintentar fotos de ${obraPendiente}`
                : tomas.length > 0
                  ? `Guardar con ${tomas.length} ${tomas.length === 1 ? 'foto' : 'fotos'}`
                  : 'Guardar y siguiente'}
          </button>
        </BarraAcciones>
      </form>
    </Layout>
  )
}
