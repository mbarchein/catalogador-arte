import { useState } from 'react'
import type { TomaPreparada } from '../../lib/imagenes'
import { ETIQUETA_TIPO_TOMA, type ValorTipoToma } from '../../lib/tipos'
import { Fichas, IconoMas, IconoNo, IconoSi } from '../../components/ui'
import { EntradaFotos } from './EntradaFotos'

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

/** Clave local para una toma recién preparada. */
export function nuevaClave(): string {
  contador += 1
  return `t${contador}`
}

/**
 * Cola de fotos de la captura: se preparan y esperan a que se guarde la obra,
 * porque las imágenes necesitan una obra a la que colgarse y todavía no existe.
 *
 * La cola se persiste en IndexedDB (ver colaFotos.ts): al abrir la cámara, el móvil
 * puede descartar la pestaña y al volver la página se recarga.
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
  const [abierta, setAbierta] = useState<string | null>(null)

  function anadir(preparadas: TomaPreparada[]) {
    const total: TomaEnCola[] = [
      ...tomas,
      ...preparadas.map((preparada) => ({
        clave: nuevaClave(),
        preparada,
        tipoToma: 'GENERAL' as ValorTipoToma,
        esIndice: false,
        estado: 'pendiente' as const,
      })),
    ]
    // RF-403: la primera foto es la del índice, salvo que ya se haya elegido otra.
    // Así el caso normal no exige ninguna decisión.
    if (total.length > 0 && !total.some((t) => t.esIndice) && total[0]) {
      total[0] = { ...total[0], esIndice: true }
    }
    alCambiar(total)
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
      <EntradaFotos
        alPreparar={anadir}
        deshabilitado={deshabilitado}
        etiqueta={`Fotografías${tomas.length > 0 ? ` (${tomas.length})` : ''}`}
      />

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
          {/* Recuadro «+» al final de la tira: repite el acceso a la selección de
              archivos junto a las miniaturas, para no obligar a subir de vuelta al
              principio del formulario cuando ya hay varias fotos. */}
          <li>
            <button
              type="button"
              aria-label="Añadir más fotos"
              disabled={deshabilitado}
              onClick={() =>
                document
                  .querySelector<HTMLInputElement>("#zona-fotos input[type='file'][multiple]")
                  ?.click()
              }
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
