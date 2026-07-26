import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { subirToma, urlFirmada, type TomaPreparada } from '../../lib/imagenes'
import { ETIQUETA_TIPO_TOMA, type ValorTipoToma } from '../../lib/tipos'
import { useAuth } from '../../auth/AuthContext'
import { IconoSi } from '../../components/ui'
import { EntradaFotos } from './EntradaFotos'

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
  const [subiendo, setSubiendo] = useState<string | null>(null)
  // Confirmación en dos toques para quitar una foto. En una pantalla táctil, un
  // botón de quitar a un solo toque junto a las miniaturas se pulsa sin querer.
  const [confirmarQuitar, setConfirmarQuitar] = useState<string | null>(null)

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

  /**
   * En la ficha las fotos se suben **al momento**: la obra ya existe, así que no
   * hay nada que encolar. Es la diferencia con la captura, donde la obra aún no
   * tiene identificador al que colgar las imágenes.
   */
  async function anadirFotos(preparadas: TomaPreparada[]) {
    setError(null)
    setAviso(null)
    const fallos: string[] = []
    for (let i = 0; i < preparadas.length; i += 1) {
      const toma = preparadas[i]
      if (!toma) continue
      setSubiendo(`Subiendo ${i + 1} de ${preparadas.length}…`)
      try {
        // Sin marcar como índice: la que representa a la obra se decide aparte, y
        // añadir una foto no debería cambiar la portada sin que nadie lo pida.
        await subirToma(idCatalogacion, toma, { tipoToma: 'GENERAL', esIndice: false })
      } catch (e) {
        fallos.push(e instanceof Error ? e.message : String(e))
      }
      URL.revokeObjectURL(toma.previsualizacion)
    }
    setSubiendo(null)
    await cargar()
    if (fallos.length > 0) {
      setError(`No se han podido subir ${fallos.length} de ${preparadas.length}: ${fallos[0]}`)
    } else {
      setAviso(
        preparadas.length === 1 ? 'Fotografía añadida.' : `${preparadas.length} fotografías añadidas.`,
      )
    }
  }

  /**
   * Retirar una foto es una baja lógica: la fila se conserva y el fichero del
   * bucket no se borra. Un máster borrado no se recupera, y para una obra
   * destruida o perdida la fotografía puede ser la única prueba de que existió.
   */
  async function quitarFoto(idImagen: string) {
    setGuardando(true)
    setError(null)
    setAviso(null)
    const { error } = await supabase
      .from('imagenes')
      .update({ activo: false })
      .eq('id_imagen', idImagen)
    if (error) {
      setError(error.message)
    } else {
      const { principal } = await cargar()
      // La que se estaba viendo ya no está: se pasa a la que ahora representa la obra.
      setVerId(principal)
      setAviso('Fotografía retirada. El archivo se conserva.')
    }
    setConfirmarQuitar(null)
    setGuardando(false)
  }

  if (cargando) {
    return <div className="mb-3 aspect-[4/3] animate-pulse rounded-xl bg-stone-200" />
  }

  // RF-404: marcador explícito, no un hueco sin explicación.
  if (imagenes.length === 0) {
    return (
      <div className="mb-3">
        <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-stone-200 bg-stone-100">
          <p className="text-sm text-stone-500">Imagen no disponible</p>
        </div>
        {puedeEditar && (
          <div className="mt-2">
            {subiendo ? (
              <p role="status" className="text-sm text-stone-600">
                {subiendo}
              </p>
            ) : (
              <EntradaFotos alPreparar={anadirFotos} deshabilitado={false} compacto />
            )}
            {error && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                {error}
              </p>
            )}
          </div>
        )}
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

      {/* Añadir y quitar fotos desde la ficha: la captura resuelve el alta inicial,
          pero una obra se re-fotografía —después de una restauración, con mejor
          luz, o porque faltaba el reverso— y eso pasa mucho después del alta. */}
      {puedeEditar && (
        <div className="mt-3 space-y-2">
          {subiendo ? (
            <p role="status" className="text-sm text-stone-600">
              {subiendo}
            </p>
          ) : (
            <EntradaFotos alPreparar={anadirFotos} deshabilitado={guardando} compacto />
          )}

          {viendo &&
            (confirmarQuitar === viendo.id_imagen ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="text-xs text-red-900">
                  ¿Quitar esta fotografía de la ficha? El archivo se conserva, pero deja de
                  mostrarse.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => void quitarFoto(viendo.id_imagen)}
                    className="boton min-h-toque bg-red-700 text-white"
                  >
                    {guardando ? 'Quitando…' : 'Sí, quitar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarQuitar(null)}
                    className="boton-secundario"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarQuitar(viendo.id_imagen)}
                className="boton min-h-toque w-full border border-red-300 bg-white text-sm text-red-800"
              >
                Quitar esta fotografía
              </button>
            ))}
        </div>
      )}

      {/* RF-405: elegir la principal entre las ya subidas. */}
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
