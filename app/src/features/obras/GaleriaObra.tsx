import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { urlFirmada } from '../../lib/imagenes'
import { ETIQUETA_TIPO_TOMA, type ValorTipoToma } from '../../lib/tipos'

interface FilaImagen {
  id_imagen: string
  ruta_miniatura: string
  ruta_derivada: string
  ruta_master: string | null
  tipo_toma: ValorTipoToma
  imagen_indice: boolean
}

/**
 * Galería de la ficha. RF-404: si la obra no tiene ninguna imagen, se muestra el
 * marcador «Imagen no disponible» en vez de un hueco sin explicación.
 *
 * Todas las URL se piden firmadas (RF-110): el bucket es privado y no hay forma
 * de construir un enlace directo. Caducan en una hora, que sobra para una sesión
 * de consulta y limita el daño si alguien comparte el enlace sin pensar.
 */
export function GaleriaObra({ idCatalogacion }: { idCatalogacion: string }) {
  const [imagenes, setImagenes] = useState<FilaImagen[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [grande, setGrande] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    void (async () => {
      const { data } = await supabase
        .from('imagenes')
        .select('id_imagen, ruta_miniatura, ruta_derivada, ruta_master, tipo_toma, imagen_indice')
        .eq('id_catalogacion', idCatalogacion)
        .eq('activo', true)
        .order('imagen_indice', { ascending: false })
        .order('id_imagen', { ascending: true })

      if (!vigente) return
      const filas = (data ?? []) as unknown as FilaImagen[]
      setImagenes(filas)

      // Miniaturas para la tira y la derivada solo de la que se muestra grande:
      // pedir las derivadas de todas gastaría datos en ver lo que nadie ha abierto.
      const pares = await Promise.all(
        filas.map(async (f) => [f.id_imagen, await urlFirmada(f.ruta_miniatura)] as const),
      )
      const principal = filas[0]
      const derivada = principal ? await urlFirmada(principal.ruta_derivada) : null

      if (!vigente) return
      setUrls(Object.fromEntries(pares.filter((p): p is [string, string] => p[1] !== null)))
      setGrande(derivada)
      setCargando(false)
    })()
    return () => {
      vigente = false
    }
  }, [idCatalogacion])

  async function mostrar(fila: FilaImagen) {
    setGrande(await urlFirmada(fila.ruta_derivada))
  }

  if (cargando) {
    return <div className="mb-3 aspect-[4/3] animate-pulse rounded-xl bg-stone-200" />
  }

  if (imagenes.length === 0) {
    return (
      <div className="mb-3 flex aspect-[4/3] items-center justify-center rounded-xl border border-stone-200 bg-stone-100">
        <p className="text-sm text-stone-500">Imagen no disponible</p>
      </div>
    )
  }

  return (
    <div className="mb-3">
      {grande && (
        <img
          src={grande}
          alt={`Obra ${idCatalogacion}`}
          className="w-full rounded-xl border border-stone-200 bg-white object-contain"
        />
      )}

      {imagenes.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {imagenes.map((f) => (
            <li key={f.id_imagen} className="shrink-0">
              <button
                type="button"
                onClick={() => void mostrar(f)}
                className="block overflow-hidden rounded-lg border-2 border-stone-200"
              >
                {urls[f.id_imagen] ? (
                  <img
                    src={urls[f.id_imagen]}
                    alt={ETIQUETA_TIPO_TOMA[f.tipo_toma]}
                    className="h-16 w-16 object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center bg-stone-100 text-[10px] text-stone-500">
                    sin vista
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-stone-500">
        {imagenes.length} {imagenes.length === 1 ? 'fotografía' : 'fotografías'}
        {/* El máster no se muestra nunca en una vista (RF-411): se descarga a
            propósito y solo quien lo necesita. Esa descarga está pendiente, así
            que aquí solo se dice que existe — prometer un botón que no hay sería
            peor que no mencionarlo. */}
        {imagenes.some((i) => i.ruta_master) && ' · máster de archivo guardado'}
      </p>
    </div>
  )
}
