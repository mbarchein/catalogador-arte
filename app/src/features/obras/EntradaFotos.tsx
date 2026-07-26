import { useRef, useState } from 'react'
import { prepararToma, validarArchivo, type TomaPreparada } from '../../lib/imagenes'
import { IconoMas } from '../../components/ui'

/**
 * Las tres vías de entrada de fotos, sin decidir qué se hace con ellas.
 *
 * Se usa desde dos sitios con comportamientos distintos: en la captura las fotos
 * esperan en cola porque la obra todavía no existe, y en la ficha se suben al
 * momento porque sí existe. Lo que comparten —cámara, selección de archivos,
 * arrastrar y soltar, validación y decodificación— vive aquí para no tenerlo dos
 * veces: dos copias de esto acabarían aceptando cosas distintas.
 */
export function EntradaFotos({
  alPreparar,
  deshabilitado,
  etiqueta = 'Fotografías',
  compacto = false,
}: {
  alPreparar: (preparadas: TomaPreparada[]) => void
  deshabilitado: boolean
  etiqueta?: string
  compacto?: boolean
}) {
  const refCamara = useRef<HTMLInputElement>(null)
  const refArchivos = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [preparando, setPreparando] = useState(0)

  async function procesar(lista: FileList | File[] | null) {
    if (!lista || deshabilitado) return
    const archivos = Array.from(lista)
    const nuevosErrores: string[] = []
    setPreparando(archivos.length)

    const preparadas: TomaPreparada[] = []
    for (const archivo of archivos) {
      const problema = validarArchivo(archivo)
      if (problema) {
        nuevosErrores.push(problema)
        setPreparando((n) => n - 1)
        continue
      }
      try {
        preparadas.push(await prepararToma(archivo))
      } catch {
        // Un fichero con extensión de imagen pero contenido corrupto llega aquí:
        // el navegador no lo puede decodificar.
        nuevosErrores.push(`No se ha podido leer «${archivo.name}».`)
      }
      setPreparando((n) => n - 1)
    }

    setErrores(nuevosErrores)
    setPreparando(0)
    if (preparadas.length > 0) alPreparar(preparadas)
  }

  return (
    <div>
      {!compacto && <p className="etiqueta">{etiqueta}</p>}

      {/* La zona de arrastre envuelve también a los botones, para que soltar en
          cualquier parte del bloque funcione. En móvil no se usa: ahí están los
          botones. */}
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
          void procesar(e.dataTransfer.files)
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
            <IconoMas clase="h-5 w-5" />
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
            está presente, el navegador ignora `multiple`. Una sola obligaría a
            elegir entre cámara directa o selección múltiple. */}
        <input
          ref={refCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void procesar(e.target.files)
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
            void procesar(e.target.files)
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
        <ul
          role="alert"
          className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
        >
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
