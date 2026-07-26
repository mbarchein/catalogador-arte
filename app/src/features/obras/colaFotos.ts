import type { TomaPreparada } from '../../lib/imagenes'
import type { ValorTipoToma } from '../../lib/tipos'

/**
 * Cola de fotos preparadas, guardada en IndexedDB.
 *
 * Existe por un fallo real: al abrir la cámara desde el móvil, el sistema pone la
 * aplicación de cámara en primer plano y el navegador puede **descartar la
 * pestaña** por presión de memoria. Al volver, la página se recarga y todo lo que
 * vivía en memoria desaparece — incluidas las fotos ya tomadas. El catalogador ve
 * que «se han borrado las anteriores» sin haber hecho nada.
 *
 * No sirve localStorage: solo guarda texto, y aquí hay tres blobs por toma que
 * suman megabytes. IndexedDB guarda blobs de forma nativa.
 *
 * Lo que se guarda es únicamente la cola pendiente de subir. En cuanto las fotos
 * están arriba, se vacía: la fuente de verdad pasa a ser la base de datos.
 */

const BASE = 'catalogador'
const ALMACEN = 'cola-fotos'
const VERSION = 1

export interface TomaGuardada {
  clave: string
  tipoToma: ValorTipoToma
  esIndice: boolean
  // El máster se guarda como blob más su nombre y tipo, y se reconstruye como
  // File al leerlo: no todos los navegadores conservan un File en IndexedDB, y el
  // nombre hace falta para la extensión del fichero al subirlo.
  master: Blob
  nombreMaster: string
  tipoMaster: string
  miniatura: Blob
  derivada: Blob
  anchoOriginal: number
  altoOriginal: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, VERSION)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(ALMACEN)) {
        bd.createObjectStore(ALMACEN, { keyPath: 'clave' })
      }
    }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

function esperar<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

/**
 * Reescribe la cola completa. Se borra y se vuelve a escribir en vez de calcular
 * diferencias: son unas pocas fotos, y una cola a medio actualizar sería peor que
 * cualquier ineficiencia.
 */
export async function guardarCola(
  tomas: { clave: string; tipoToma: ValorTipoToma; esIndice: boolean; preparada: TomaPreparada }[],
): Promise<void> {
  try {
    const bd = await abrir()
    const tx = bd.transaction(ALMACEN, 'readwrite')
    const almacen = tx.objectStore(ALMACEN)
    almacen.clear()
    for (const t of tomas) {
      const fila: TomaGuardada = {
        clave: t.clave,
        tipoToma: t.tipoToma,
        esIndice: t.esIndice,
        master: t.preparada.master,
        nombreMaster: t.preparada.master.name,
        tipoMaster: t.preparada.master.type,
        miniatura: t.preparada.miniatura,
        derivada: t.preparada.derivada,
        anchoOriginal: t.preparada.anchoOriginal,
        altoOriginal: t.preparada.altoOriginal,
      }
      almacen.put(fila)
    }
    await new Promise<void>((resolver, rechazar) => {
      tx.oncomplete = () => resolver()
      tx.onerror = () => rechazar(tx.error)
    })
    bd.close()
  } catch {
    // Sin IndexedDB —navegación privada en algunos navegadores, cuota agotada— se
    // sigue catalogando; solo se pierde la red de seguridad ante una recarga.
  }
}

export async function leerCola(): Promise<TomaGuardada[]> {
  try {
    const bd = await abrir()
    const tx = bd.transaction(ALMACEN, 'readonly')
    const filas = await esperar(tx.objectStore(ALMACEN).getAll() as IDBRequest<TomaGuardada[]>)
    bd.close()
    // Se comprueba la forma de lo que vuelve: una cola escrita por una versión
    // anterior no puede impedir catalogar hoy.
    return filas.filter(
      (f): f is TomaGuardada =>
        typeof f?.clave === 'string' && f.master instanceof Blob && f.miniatura instanceof Blob,
    )
  } catch {
    return []
  }
}

export async function vaciarCola(): Promise<void> {
  try {
    const bd = await abrir()
    const tx = bd.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).clear()
    await new Promise<void>((resolver) => {
      tx.oncomplete = () => resolver()
      tx.onerror = () => resolver()
    })
    bd.close()
  } catch {
    /* nada que hacer */
  }
}

/** Reconstruye una toma utilizable a partir de lo guardado. */
export function rehidratar(fila: TomaGuardada): {
  clave: string
  tipoToma: ValorTipoToma
  esIndice: boolean
  preparada: TomaPreparada
} {
  return {
    clave: fila.clave,
    tipoToma: fila.tipoToma,
    esIndice: fila.esIndice,
    preparada: {
      master: new File([fila.master], fila.nombreMaster, { type: fila.tipoMaster }),
      miniatura: fila.miniatura,
      derivada: fila.derivada,
      anchoOriginal: fila.anchoOriginal,
      altoOriginal: fila.altoOriginal,
      // La URL del objeto anterior murió con la página: se crea una nueva.
      previsualizacion: URL.createObjectURL(fila.miniatura),
    },
  }
}
