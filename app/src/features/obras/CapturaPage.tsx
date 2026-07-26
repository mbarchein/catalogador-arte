import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { derivarFechaOrden } from '../../lib/fechas'
import {
  ETIQUETA_ARTISTA,
  ETIQUETA_TRI_ESTADO,
  TIPOS_OBRA_SUGERIDOS,
  type FondoArtista,
  type TriEstado,
} from '../../lib/tipos'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { previsualizarId } from './useObras'

/**
 * RF-1204: captura rápida. Solo el mínimo imprescindible para que la ficha
 * exista, pensada para rellenarse de pie, con una mano y con la obra delante.
 * El resto se completa después desde cualquier dispositivo.
 */
export function CapturaPage() {
  const navegar = useNavigate()
  const { puedeEditar } = useAuth()

  const [artista, setArtista] = useState<FondoArtista>('ROTILI')
  const [tipoObra, setTipoObra] = useState('')
  const [titulo, setTitulo] = useState('')
  const [alto, setAlto] = useState('')
  const [ancho, setAncho] = useState('')
  const [profundidad, setProfundidad] = useState('')
  const [tecnica, setTecnica] = useState('')
  const [fechaEjecucion, setFechaEjecucion] = useState('')
  const [firmada, setFirmada] = useState<TriEstado>('SIN_REVISAR')
  const [ubicacion, setUbicacion] = useState('')

  const [idPrevisto, setIdPrevisto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultimaGuardada, setUltimaGuardada] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    void previsualizarId(artista).then((id) => {
      if (vigente) setIdPrevisto(id)
    })
    return () => {
      vigente = false
    }
  }, [artista, ultimaGuardada])

  if (!puedeEditar) {
    // RF-106: al Lector no se le ofrece este camino. La política RLS lo
    // rechazaría igualmente, pero dejarle rellenar un formulario para fallar al
    // guardar sería una interfaz que promete lo que no cumple.
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

    // id_catalogacion se omite a propósito: lo asigna el trigger de la base con
    // un cerrojo por fondo. Generarlo en el cliente produciría duplicados en
    // cuanto dos personas catalogasen a la vez (DP-01).
    const { data, error } = await supabase
      .from('obras')
      .insert({
        artista,
        tipo_obra: tipoObra.trim(),
        titulo: titulo.trim(),
        alto_cm: aNumero(alto),
        ancho_cm: aNumero(ancho),
        profundidad_cm: aNumero(profundidad),
        tecnica: tecnica.trim(),
        fecha_ejecucion: fechaEjecucion.trim(),
        fecha_orden: derivarFechaOrden(fechaEjecucion),
        firmada,
        ubicacion_fisica: ubicacion.trim().toLowerCase(),
      })
      .select('id_catalogacion')
      .single()

    if (error) {
      // No se limpia el formulario: si el guardado falla en el almacén por
      // cobertura intermitente, volver a teclear todo es inaceptable (RF-1207).
      setError(error.message)
      setGuardando(false)
      return
    }

    const id = (data as { id_catalogacion: string }).id_catalogacion
    setUltimaGuardada(id)

    // Se conservan artista y ubicación: se cataloga una estantería de una vez, y
    // esos dos campos son los que menos cambian entre obras consecutivas.
    setTipoObra('')
    setTitulo('')
    setAlto('')
    setAncho('')
    setProfundidad('')
    setTecnica('')
    setFechaEjecucion('')
    setFirmada('SIN_REVISAR')
    setGuardando(false)
  }

  return (
    <Layout miga="Captura rápida">
      {ultimaGuardada && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm"
        >
          <p className="font-medium text-green-900">Guardada como {ultimaGuardada}</p>
          <p className="mt-1 text-green-800">
            Escribe ese código en la etiqueta de la obra.{' '}
            <Link to={`/obra/${ultimaGuardada}`} className="underline">
              Ver la ficha
            </Link>
          </p>
        </div>
      )}

      <form onSubmit={guardar} className="space-y-4">
        <div className="tarjeta space-y-4">
          <div>
            <label className="etiqueta" htmlFor="artista">
              Fondo
            </label>
            <select
              id="artista"
              className="campo"
              value={artista}
              onChange={(e) => setArtista(e.target.value as FondoArtista)}
            >
              {(Object.keys(ETIQUETA_ARTISTA) as FondoArtista[]).map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_ARTISTA[a]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              {idPrevisto
                ? `Se guardará como ${idPrevisto} (aproximado: el número definitivo lo asigna el servidor)`
                : 'Calculando el siguiente código…'}
            </p>
          </div>

          <div>
            <label className="etiqueta" htmlFor="tipo_obra">
              Tipo de obra
            </label>
            <input
              id="tipo_obra"
              className="campo"
              list="tipos-obra"
              value={tipoObra}
              onChange={(e) => setTipoObra(e.target.value)}
              placeholder="Pintura, dibujo, escultura…"
            />
            {/* Lista abierta (RF-213): sugiere sin cerrar. */}
            <datalist id="tipos-obra">
              {TIPOS_OBRA_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

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
            <p className="mt-1 text-xs text-stone-500">
              Déjalo vacío si la obra no tiene título: la ficha mostrará «[Sin título]». Escribe
              «Sin título» solo si el artista la tituló así.
            </p>
          </div>
        </div>

        <div className="tarjeta space-y-4">
          <p className="text-sm font-medium text-stone-700">Medidas en centímetros</p>
          {/* RF-1205: teclado numérico, y los tres campos en una fila para que
              quepan en pantalla sin desplazarse. */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="etiqueta" htmlFor="alto">
                Alto
              </label>
              <input
                id="alto"
                className="campo"
                inputMode="decimal"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="ancho">
                Ancho
              </label>
              <input
                id="ancho"
                className="campo"
                inputMode="decimal"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="profundidad">
                Prof.
              </label>
              <input
                id="profundidad"
                className="campo"
                inputMode="decimal"
                value={profundidad}
                onChange={(e) => setProfundidad(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="etiqueta" htmlFor="tecnica">
              Técnica
            </label>
            <input
              id="tecnica"
              className="campo"
              value={tecnica}
              onChange={(e) => setTecnica(e.target.value)}
              placeholder="Óleo sobre lienzo"
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="fecha">
              Fecha de ejecución
            </label>
            <input
              id="fecha"
              className="campo"
              value={fechaEjecucion}
              onChange={(e) => setFechaEjecucion(e.target.value)}
              placeholder="1978 · 1975-1978 · c. 1980"
            />
            <p className="mt-1 text-xs text-stone-500">
              Tal como se documente. Admite rango y aproximación.
              {derivarFechaOrden(fechaEjecucion) !== null &&
                ` Se ordenará por ${derivarFechaOrden(fechaEjecucion)}.`}
            </p>
          </div>

          <div>
            <label className="etiqueta" htmlFor="firmada">
              Firmada
            </label>
            <select
              id="firmada"
              className="campo"
              value={firmada}
              onChange={(e) => setFirmada(e.target.value as TriEstado)}
            >
              {(Object.keys(ETIQUETA_TRI_ESTADO) as TriEstado[]).map((v) => (
                <option key={v} value={v}>
                  {ETIQUETA_TRI_ESTADO[v]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              «Sin revisar» no es «No»: deja constancia de que aún no se ha mirado.
            </p>
          </div>

          <div>
            <label className="etiqueta" htmlFor="ubicacion">
              Ubicación física
            </label>
            <input
              id="ubicacion"
              className="campo"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="edificio a, habitacion amarilla, bloque 3"
              autoCapitalize="none"
            />
            <p className="mt-1 text-xs text-stone-500">
              De mayor a menor, separado por comas. Se guarda en minúsculas y se conserva para la
              obra siguiente.
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No se ha podido guardar: {error}
            <br />
            Los datos siguen en el formulario, puedes reintentarlo.
          </p>
        )}

        <div className="flex gap-2">
          <button className="boton-primario flex-1" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar y seguir'}
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => navegar('/')}
            disabled={guardando}
          >
            Listado
          </button>
        </div>

        <p className="pb-4 text-center text-xs text-stone-500">
          Faltan campos por rellenar: se completan después desde la ficha.
        </p>
      </form>
    </Layout>
  )
}
