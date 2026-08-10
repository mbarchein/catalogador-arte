import { signedUrls } from './images'

/**
 * Las firmas de las rutas de almacenamiento, guardadas y reutilizadas (RF-110, RNF-106).
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────
 *
 * El *bucket* es privado, así que cada imagen se pinta con una URL firmada. Los bytes
 * ya no viajan dos veces —el *service worker* los guarda por ruta, recortando la firma
 * de la clave (ver `runtimeCaching` en vite.config.ts)—, pero **la firma sí viajaba**:
 * la ficha de fotografías firmaba cada miniatura por separado y con una hora de
 * validez, sin guardarla. Abrir una ficha de cuatro fotos eran cuatro peticiones de
 * firma, más las de las copias del carrusel, cada vez.
 *
 * Y lo que se notaba no era el tráfico, era esto: **sin cobertura, una ficha ya vista
 * no enseñaba sus fotos aunque los bytes estuvieran en el teléfono**, porque sin firma
 * no hay `src` que buscar en el caché. Se quedaba en «Cargando…».
 *
 * ── LO QUE HACE ─────────────────────────────────────────────
 *
 * Lo mismo que el listado de obras ya hacía con sus miniaturas, y por eso este módulo
 * existe: para hacerlo una vez. Firma **en lote**, con una validez **larga**, y guarda
 * el resultado; en la visita siguiente no hay ninguna petición.
 *
 * ── LAS TRES DECISIONES QUE IMPORTAN ────────────────────────
 *
 * **La clave es la ruta, no el identificador de la imagen.** Reencuadrar una foto
 * conserva su identificador y escribe ficheros nuevos, así que una caché por
 * identificador seguiría enseñando el recorte anterior. La ruta es la identidad del
 * contenido: es lo mismo en lo que se apoya el caché de bytes.
 *
 * **Una firma que sigue valiendo se reutiliza tal cual.** Volver a firmar el mismo
 * fichero produce una URL distinta, y una URL distinta es otra imagen para cualquier
 * caché: se perdería justo lo que se quería ganar. De ahí el margen — una firma que
 * caduca dentro de la propia visita para la que se entregó no vale.
 *
 * **Está acotado.** Son datos del catálogo en el navegador de un dispositivo que puede
 * ser compartido, y `localStorage` tiene un límite pequeño; así que caduca, se poda al
 * leer y hay un tope de entradas. Y se borra al cerrar sesión, como el espejo del
 * listado y por el mismo motivo.
 */

const KEY = 'catalogador.signed-paths'
const VERSION = 1

/** Una semana, como las miniaturas del listado. */
export const SIGNED_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Cuánto antes de caducar se vuelve a firmar.
 *
 * Seis horas: una firma que expira a media visita deja imágenes roas en pantalla, y
 * quien cataloga puede tener la aplicación abierta toda la mañana.
 */
export const SIGN_MARGIN_MS = 6 * 60 * 60 * 1000

/**
 * Tope de rutas guardadas.
 *
 * Cada entrada es una URL firmada de unos 300 caracteres, así que 600 son del orden de
 * 200 kB de los 5 MB que suele dar `localStorage` — y con eso caben las fotografías de
 * más de cien fichas. Al pasarse se tiran las que caducan antes, que con una validez
 * fija son las más antiguas.
 */
export const MAX_SIGNED_PATHS = 600

export interface SignedPath {
  url: string
  /** Caducidad absoluta, en ms desde la época. */
  expiresAt: number
}

export type SignedPathMap = Record<string, SignedPath>

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isSigned(value: unknown): value is SignedPath {
  const s = value as SignedPath | null
  return typeof s?.url === 'string' && typeof s.expiresAt === 'number'
}

/**
 * Lee lo guardado y tira lo caducado: una URL vencida no sirve para nada, y pintar una
 * imagen roa es peor que pintar el hueco mientras llega la buena.
 */
export function readSignedPaths(
  storage: Storage | undefined = getStorage(),
  now: number = Date.now(),
): SignedPathMap {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: unknown; paths?: unknown }
    if (parsed.v !== VERSION || parsed.paths === null || typeof parsed.paths !== 'object') return {}
    const out: SignedPathMap = {}
    for (const [path, value] of Object.entries(parsed.paths as Record<string, unknown>)) {
      if (isSigned(value) && value.expiresAt > now) out[path] = value
    }
    return out
  } catch {
    // Cualquier cosa que no se reconozca es «no hay nada»: se vuelve a firmar, que es
    // lento pero funciona. Una excepción aquí dejaría la ficha sin pintar.
    return {}
  }
}

export function saveSignedPaths(
  map: SignedPathMap,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, paths: map }))
  } catch {
    // Sin almacenamiento —cuota, navegación privada— todo sigue funcionando: lo único
    // que se pierde es no tener que volver a firmar.
  }
}

/** Borra las firmas guardadas. Al cerrar sesión, como el espejo del listado. */
export function clearSignedPaths(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nada que borrar */
  }
}

/**
 * De las rutas pedidas, las que hay que firmar: las que no están y las que caducan
 * dentro del margen. Sin repeticiones — la misma ruta pedida dos veces se firma una.
 */
export function pathsToSign(
  paths: readonly string[],
  cached: SignedPathMap,
  now: number = Date.now(),
  marginMs: number = SIGN_MARGIN_MS,
): string[] {
  const stale = new Set<string>()
  for (const path of paths) {
    const hit = cached[path]
    if (!hit || hit.expiresAt - marginMs <= now) stale.add(path)
  }
  return [...stale]
}

/**
 * Mete las firmas nuevas, poda las caducadas y respeta el tope.
 *
 * Al recortar se van las que caducan antes: con una validez fija son las más antiguas,
 * es decir las fichas que se visitaron hace más tiempo. Lo que se acaba de firmar —lo
 * que se está mirando ahora mismo— nunca es lo que se tira.
 */
export function mergeSigned(
  cached: SignedPathMap,
  fresh: Record<string, string>,
  expiresAt: number,
  now: number = Date.now(),
  max: number = MAX_SIGNED_PATHS,
): SignedPathMap {
  const merged: SignedPathMap = {}
  for (const [path, signed] of Object.entries(cached)) {
    if (signed.expiresAt > now) merged[path] = signed
  }
  for (const [path, url] of Object.entries(fresh)) merged[path] = { url, expiresAt }

  const entries = Object.entries(merged)
  if (entries.length <= max) return merged
  entries.sort((a, b) => b[1].expiresAt - a[1].expiresAt)
  return Object.fromEntries(entries.slice(0, max))
}

// ── El acceso, con una sola copia en memoria ─────────────────

/**
 * Lo guardado, leído una vez por sesión.
 *
 * Una sola copia y **mutada en su sitio**, no una por componente: la ficha pide sus
 * miniaturas y el carrusel sus copias casi a la vez, y con una copia cada uno el que
 * guardara segundo borraría las firmas del primero.
 */
let memory: SignedPathMap | null = null

function loaded(now: number): SignedPathMap {
  if (memory === null) memory = readSignedPaths(getStorage(), now)
  return memory
}

/** Olvida lo leído. Para cerrar sesión, y para que los tests no se contagien. */
export function forgetSignedPaths(): void {
  memory = null
}

/**
 * Devuelve una URL firmada por cada ruta pedida, firmando solo lo que hace falta.
 *
 * Las rutas que no se puedan firmar salen fuera del resultado en vez de con una URL
 * inservible: quien pinta ya sabe qué hacer con una imagen que no está —enseña el
 * hueco explicado, nunca una imagen roa—.
 */
export async function signPaths(
  paths: readonly string[],
  sign: (paths: string[], seconds: number) => Promise<Record<string, string>> = signedUrls,
  now: number = Date.now(),
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const cached = loaded(now)
  const stale = pathsToSign(paths, cached, now)

  if (stale.length > 0) {
    const fresh = await sign(stale, SIGNED_TTL_SECONDS)
    if (Object.keys(fresh).length > 0) {
      memory = mergeSigned(cached, fresh, now + SIGNED_TTL_SECONDS * 1000, now)
      saveSignedPaths(memory)
    }
  }

  const map = memory ?? cached
  const out: Record<string, string> = {}
  for (const path of paths) {
    const hit = map[path]
    if (hit) out[path] = hit.url
  }
  return out
}
