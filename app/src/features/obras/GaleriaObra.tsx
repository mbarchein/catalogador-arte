import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { urlFirmada } from '../../lib/imagenes'
import { ETIQUETA_TIPO_TOMA, type ValorTipoToma } from '../../lib/tipos'
import { useAuth } from '../../auth/AuthContext'
import { IconoSi } from '../../components/ui'

interface FilaImagen {
  id_imagen: string
  ruta_miniatura: string
  ruta_derivada: string
  ruta_master: string | null
  tipo_toma: ValorTipoToma
  imagen_indice: boolean
  fecha_fotografia: string | null
}

/**
 * Galería de la ficha, con elección de la imagen principal (RF-405).
 *
 * El cambio de principal se aplica **al momento**, con su propio botón, y no como
 * parte del formulario de la obra. Son dos cosas distintas: una toca la tabla de
 * imágenes y la otra la de obras, y mezclarlas obligaría a decidir qué pasa con la
 * imagen si alguien cancela la edición de la ficha. Además es un cambio de un solo
 * dato, reversible con otro toque, así que no necesita el ceremonial de un
 * formulario con guardar y cancelar.
 *
 * Todas las URL se piden firmadas (RF-110): el bucket es privado. Caducan en una
 * hora, que sobra para una sesión y limita el daño si alguien comparte el enlace.
 */
export function GaleriaObra({ idCatalogacion }: { idCatalogacion: string }) {
  const { puedeEditar } = useAuth()
  const [imagenes, setImagenes] = useState<FilaImagen[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [verId, setVerId] = useState<string | null>(null)
  const [urlGrande, setUrlGrande] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  // Qué imagen representa a la obra lo decide la vista `imagen_representativa`,
  // que aplica la regla de RF-403. El cliente no la recalcula: si lo hiciera,
  // el listado, la ficha y el catálogo impreso podrían discrepar.
  const [principalId, setPrincipalId] = useState<string | null>(null)
  const [elegidaAMano, setElegidaAMano] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('imagenes')
      .select(
        'id_imagen, ruta_miniatura, ruta_derivada, ruta_master, tipo_toma, imagen_indice, fecha_fotografia',
      )
      .eq('id_catalogacion', idCatalogacion)
      .eq('activo', true)
      .order('id_imagen', { ascending: true })

    const filas = (data ?? []) as unknown as FilaImagen[]
    setImagenes(filas)

    const { data: rep } = await supabase
      .from('imagen_representativa')
      .select('id_imagen, elegida_a_mano')
      .eq('id_catalogacion', idCatalogacion)
      .maybeSingle()
    const representativa = rep as { id_imagen: string; elegida_a_mano: boolean } | null
    setPrincipalId(representativa?.id_imagen ?? null)
    setElegidaAMano(representativa?.elegida_a_mano ?? false)

    const pares = await Promise.all(
      filas.map(async (f) => [f.id_imagen, await urlFirmada(f.ruta_miniatura)] as const),
    )
    setUrls(Object.fromEntries(pares.filter((p): p is [string, string] => p[1] !== null)))
    setCargando(false)
    return { filas, principal: representativa?.id_imagen ?? null }
  }, [idCatalogacion])

  useEffect(() => {
    let vigente = true
    void (async () => {
      const { principal } = await cargar()
      if (!vigente) return
      setVerId(principal)
    })()
    return () => {
      vigente = false
    }
  }, [cargar])

  // La derivada se pide solo de la que se está viendo: traerlas todas gastaría
  // datos en ver lo que nadie ha abierto.
  useEffect(() => {
    let vigente = true
    const fila = imagenes.find((f) => f.id_imagen === verId)
    if (!fila) {
      setUrlGrande(null)
      return
    }
    void urlFirmada(fila.ruta_derivada).then((u) => {
      if (vigente) setUrlGrande(u)
    })
    return () => {
      vigente = false
    }
  }, [verId, imagenes])

  async function usarComoPrincipal(idImagen: string) {
    setGuardando(true)
    setError(null)
    setAviso(null)
    const { error } = await supabase.rpc('marcar_imagen_principal', { p_id_imagen: idImagen })
    if (error) {
      setError(error.message)
    } else {
      await cargar()
      setAviso('Imagen principal actualizada.')
    }
    setGuardando(false)
  }

  if (cargando) {
    return <div className="mb-3 aspect-[4/3] animate-pulse rounded-xl bg-stone-200" />
  }

  // RF-404: marcador explícito, no un hueco sin explicación.
  if (imagenes.length === 0) {
    return (
      <div className="mb-3 flex aspect-[4/3] items-center justify-center rounded-xl border border-stone-200 bg-stone-100">
        <p className="text-sm text-stone-500">Imagen no disponible</p>
      </div>
    )
  }

  const viendo = imagenes.find((f) => f.id_imagen === verId)
  const viendoEsPrincipal = viendo?.id_imagen === principalId

  return (
    <div className="mb-3">
      {urlGrande && (
        <img
          src={urlGrande}
          alt={`Obra ${idCatalogacion}`}
          className="w-full rounded-xl border border-stone-200 bg-white object-contain"
        />
      )}

      {imagenes.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {imagenes.map((f) => {
            const esPrincipal = f.id_imagen === principalId
            return (
              <li key={f.id_imagen} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setVerId(f.id_imagen)}
                  aria-label={`Ver ${ETIQUETA_TIPO_TOMA[f.tipo_toma]}${esPrincipal ? ', imagen principal' : ''}`}
                  aria-pressed={f.id_imagen === verId}
                  className={`relative block overflow-hidden rounded-lg border-2 ${
                    f.id_imagen === verId ? 'border-stone-800' : 'border-stone-200'
                  }`}
                >
                  {urls[f.id_imagen] ? (
                    <img
                      src={urls[f.id_imagen]}
                      alt=""
                      className="h-20 w-20 object-cover"
                    />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center bg-stone-100 text-[10px] text-stone-500">
                      sin vista
                    </span>
                  )}
                  {esPrincipal && (
                    <span
                      className="absolute left-1 top-1 rounded-full bg-stone-900/85 p-0.5 text-white"
                      title="Imagen principal"
                    >
                      <IconoSi clase="h-3 w-3" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* RF-405: elegir la principal entre las ya subidas. No es un punto de
          subida: eso vive en la captura. */}
      {puedeEditar && viendo && (
        <div className="mt-2">
          {viendoEsPrincipal ? (
            <p className="text-xs text-stone-500">
              {!elegidaAMano
                ? // Distinguir «elegida a mano» de «elegida por la regla de repliegue»
                  // importa: en el segundo caso, subir una foto más puede cambiarla sola.
                  'Se muestra esta por ser la general más reciente. Fíjala para que no cambie al añadir fotos.'
                : `Esta es la imagen principal · ${ETIQUETA_TIPO_TOMA[viendo.tipo_toma]}`}
              {!elegidaAMano && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void usarComoPrincipal(viendo.id_imagen)}
                  className="ml-1 underline"
                >
                  Fijar esta
                </button>
              )}
            </p>
          ) : (
            <button
              type="button"
              disabled={guardando}
              onClick={() => void usarComoPrincipal(viendo.id_imagen)}
              className="boton-secundario w-full"
            >
              {guardando ? 'Guardando…' : 'Usar esta como imagen principal'}
            </button>
          )}
        </div>
      )}

      {aviso && (
        <p role="status" className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          No se ha podido cambiar: {error}
        </p>
      )}

      <p className="mt-1 text-xs text-stone-500">
        {imagenes.length} {imagenes.length === 1 ? 'fotografía' : 'fotografías'}
        {/* El máster no se muestra en ninguna vista (RF-411). Su descarga está
            pendiente, así que solo se dice que existe. */}
        {imagenes.some((i) => i.ruta_master) && ' · máster de archivo guardado'}
      </p>
    </div>
  )
}
