import { useRef, useState } from 'react'
import { prepararToma, validarArchivo, type TomaPreparada } from '../../lib/imagenes'
import { ETIQUETA_TIPO_TOMA, type ValorTipoToma } from '../../lib/tipos'
import { Fichas, IconoMas, IconoNo, IconoSi } from '../../components/ui'

export interface TomaEnCola {
  /** Identificador local, solo para React. El de catálogo lo asigna la base. */
  clave: string
  preparada: TomaPreparada
  tipoToma: ValorTipoToma
  esIndice: boolean
  estado: 'pendiente' | 'subiendo' | 'subida' | 'error'
  error?: string
}

let contador = 0

/**
 * Varias fotos por ficha, con las tres vías de entrada que hacen falta:
 *
 *  - **Cámara del dispositivo**: `capture="environment"` abre directamente la
 *    cámara trasera, sin pasar por el carrete. Es el gesto del almacén.
 *  - **Elegir archivos**: para fotos ya tomadas o escaneos, y admite varias de una.
 *  - **Arrastrar y soltar**: para cuando se cataloga desde el escritorio con una
 *    carpeta de fotos abierta al lado.
 *
 * Las fotos no se suben aquí: se preparan —se decodifican y se reducen a los tres
 * niveles— y esperan en cola. La subida ocurre al guardar la ficha, porque las
 * imágenes necesitan una obra a la que colgarse y la obra todavía no existe.
 */
export function SelectorFotos({
  tomas,
  alCambiar,
  deshabilitado,
}: {
  tomas: TomaEnCola[]
  alCambiar: (tomas: TomaEnCola[]) => void
  deshabilitado: boolean
}) {
  const refCamara = useRef<HTMLInputElement>(null)
  const refArchivos = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [preparando, setPreparando] = useState(0)
  const [abierta, setAbierta] = useState<string | null>(null)

  async function anadir(lista: FileList | File[] | null) {
    if (!lista || deshabilitado) return
    const archivos = Array.from(lista)
    const nuevosErrores: string[] = []
    setPreparando(archivos.length)

    const preparadas: TomaEnCola[] = []
    for (const archivo of archivos) {
      const problema = validarArchivo(archivo)
      if (problema) {
        nuevosErrores.push(problema)
        setPreparando((n) => n - 1)
        continue
      }
      try {
        const preparada = await prepararToma(archivo)
        preparadas.push({
          clave: `t${++contador}`,
          preparada,
          tipoToma: 'GENERAL',
          esIndice: false,
          estado: 'pendiente',
        })
      } catch (e) {
        // Un fichero con extensión de imagen pero contenido corrupto llega hasta
        // aquí: el navegador no lo puede decodificar.
        nuevosErrores.push(`No se ha podido leer «${archivo.name}».`)
      }
      setPreparando((n) => n - 1)
    }

    const total = [...tomas, ...preparadas]
    // RF-403: la primera foto de la obra es la del índice, salvo que ya se haya
    // elegido otra. Así el caso normal no exige ninguna decisión.
    if (total.length > 0 && !total.some((t) => t.esIndice) && total[0]) {
      total[0].esIndice = true
    }
    alCambiar(total)
    setErrores(nuevosErrores)
    setPreparando(0)
  }

  function quitar(clave: string) {
    const fuera = tomas.find((t) => t.clave === clave)
    if (fuera) URL.revokeObjectURL(fuera.preparada.previsualizacion)
    const restantes = tomas.filter((t) => t.clave !== clave)
    // Si se quitó la del índice, hereda la primera que quede: la obra no puede
    // quedarse sin imagen representativa teniendo fotos.
    if (fuera?.esIndice && restantes.length > 0 && restantes[0]) {
      restantes[0].esIndice = true
    }
    alCambiar(restantes)
    setAbierta(null)
  }

  function marcarIndice(clave: string) {
    alCambiar(tomas.map((t) => ({ ...t, esIndice: t.clave === clave })))
  }

  function ponerTipo(clave: string, tipo: ValorTipoToma) {
    alCambiar(tomas.map((t) => (t.clave === clave ? { ...t, tipoToma: tipo } : t)))
  }

  const abiertaToma = tomas.find((t) => t.clave === abierta)

  return (
    <div>
      <p className="etiqueta">
        Fotografías{' '}
        {tomas.length > 0 && <span className="font-normal text-stone-500">({tomas.length})</span>}
      </p>

      {/* Zona de arrastre. En móvil no se usa, pero envuelve también a los
          botones para que soltar en cualquier parte del bloque funcione. */}
      <div
        id="zona-fotos"
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          void anadir(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed p-3 transition ${
          arrastrando ? 'border-stone-800 bg-stone-100' : 'border-stone-300'
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => refCamara.current?.click()}
            className="boton-secundario min-h-[3.25rem]"
          >
            Hacer foto
          </button>
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => refArchivos.current?.click()}
            className="boton-secundario min-h-[3.25rem]"
          >
            Elegir archivos
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-stone-500">
          {arrastrando ? 'Suelta las fotos aquí' : 'O arrastra y suelta las fotos en este recuadro'}
        </p>

        {/* Dos entradas separadas: `capture` abre la cámara directamente y, cuando
            está presente, el navegador ignora `multiple`. Una sola entrada
            obligaría a elegir entre cámara directa o selección múltiple. */}
        <input
          ref={refCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void anadir(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={refArchivos}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void anadir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {preparando > 0 && (
        <p role="status" className="mt-2 text-sm text-stone-600">
          Preparando {preparando} {preparando === 1 ? 'foto' : 'fotos'}…
        </p>
      )}

      {errores.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {tomas.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {tomas.map((t) => (
            <li key={t.clave}>
              <button
                type="button"
                onClick={() => setAbierta(abierta === t.clave ? null : t.clave)}
                className={`relative block w-full overflow-hidden rounded-lg border-2 ${
                  abierta === t.clave ? 'border-stone-800' : 'border-stone-200'
                }`}
              >
                <img
                  src={t.preparada.previsualizacion}
                  alt={`Toma ${ETIQUETA_TIPO_TOMA[t.tipoToma]}`}
                  className="aspect-square w-full object-cover"
                />
                {t.esIndice && (
                  <span className="absolute left-1 top-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Índice
                  </span>
                )}
                {t.tipoToma !== 'GENERAL' && (
                  <span className="absolute bottom-1 left-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] text-white">
                    {ETIQUETA_TIPO_TOMA[t.tipoToma]}
                  </span>
                )}
                {t.estado === 'subiendo' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs">
                    Subiendo…
                  </span>
                )}
                {t.estado === 'subida' && (
                  <span className="absolute right-1 top-1 rounded-full bg-green-600 p-0.5 text-white">
                    <IconoSi clase="h-3 w-3" />
                  </span>
                )}
                {t.estado === 'error' && (
                  <span className="absolute right-1 top-1 rounded-full bg-red-600 p-0.5 text-white">
                    <IconoNo clase="h-3 w-3" />
                  </span>
                )}
              </button>
            </li>
          ))}
          {/* Recuadro «+»: mismo gesto que en la ficha, un único punto de subida
              adicional para no obligar a subir al principio del formulario. */}
          <li>
            <button
              type="button"
              aria-label="Añadir más fotos"
              disabled={deshabilitado}
              onClick={() => refArchivos.current?.click()}
              className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-stone-400"
            >
              <IconoMas />
            </button>
          </li>
        </ul>
      )}

      {/* Panel de la toma seleccionada. Se abre al tocar la miniatura en vez de
          apilar controles bajo cada foto: con cuatro o cinco tomas, el formulario
          se volvería ilegible en una pantalla de móvil. */}
      {abiertaToma && (
        <div className="mt-3 space-y-3 rounded-lg border border-stone-300 bg-stone-50 p-3">
          <Fichas
            id={`tipo-${abiertaToma.clave}`}
            etiqueta="Tipo de toma"
            opciones={(Object.keys(ETIQUETA_TIPO_TOMA) as ValorTipoToma[]).map((v) => ({
              valor: v,
              texto: ETIQUETA_TIPO_TOMA[v],
            }))}
            valor={abiertaToma.tipoToma}
            alCambiar={(v) => ponerTipo(abiertaToma.clave, v)}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={abiertaToma.esIndice}
              onClick={() => marcarIndice(abiertaToma.clave)}
              className="boton-secundario"
            >
              {abiertaToma.esIndice ? 'Es la del índice' : 'Usar como índice'}
            </button>
            <button
              type="button"
              onClick={() => quitar(abiertaToma.clave)}
              className="boton min-h-toque border border-red-300 bg-white text-red-800"
            >
              Quitar
            </button>
          </div>

          <p className="text-xs text-stone-500">
            Original {abiertaToma.preparada.anchoOriginal}×{abiertaToma.preparada.altoOriginal} px,{' '}
            {(abiertaToma.preparada.master.size / 1_048_576).toFixed(1)} MB. Se subirán tres
            versiones: miniatura, consulta y máster de archivo.
          </p>
        </div>
      )}
    </div>
  )
}
