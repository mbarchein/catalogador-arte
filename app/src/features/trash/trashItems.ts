/**
 * Lo retirado, convertido en líneas que se leen y se pueden decidir.
 *
 * Una papelera que solo dice «hay cinco cosas» no sirve para nada: lo que hace
 * decidible si algo se recupera es **qué es, cuándo se retiró y quién lo retiró**.
 * Ese es el trabajo de este módulo, y está separado de la pantalla porque ahí es
 * donde están las decisiones —qué nombre se le pone a un autor que ya no existe,
 * qué se dice de una fecha que no consta— y una pantalla no se puede probar en esta
 * batería.
 *
 * **La firma no se redacta aquí por segunda vez.** El historial de cambios ya fijó
 * cómo se nombra a quien hizo algo —nombre, y si no correo, y si no «El sistema»—, y
 * `authorName` se reutiliza en vez de reescribirse: si la papelera y el historial
 * firmaran a la misma persona de dos maneras, una de las dos estaría mal.
 */

import { authorName, type ChangeLogRow } from '../history/changeEntry'
import {
  cell,
  embeddedRetired,
  kindSpec,
  type TrashKindId,
  type TrashKindSpec,
  type TrashParent,
  type TrashRow,
} from './trashKinds'

/** The profile of whoever withdrew something, in the shape the history already has. */
export type TrashAuthor = NonNullable<ChangeLogRow['author']>

/**
 * Quién retiró la cosa, tal como se firma en pantalla.
 *
 * Delega en el historial a propósito. `authorName` solo lee `row.author`, así que se
 * le pasa una fila con ese único campo relleno; la conversión es estrecha y está
 * cubierta por un test que recorre los tres escalones del respaldo, que es lo que
 * avisaría si el historial cambiara la escalera por debajo.
 */
export function retiredByText(author: TrashAuthor | null): string {
  return authorName({ author } as Pick<ChangeLogRow, 'author'> as ChangeLogRow)
}

/**
 * Cuándo se retiró, en español y sin la hora cuando no aporta.
 *
 * Misma redacción que el historial de cambios: hoy y ayer se nombran, porque una
 * papelera se abre casi siempre para recuperar algo que se acaba de tirar, y una
 * fecha completa para eso obliga a calcular mentalmente qué día es hoy.
 *
 * **Y la fecha puede no constar.** Medido: `deactivated_at` lo sella la base en
 * cada baja, pero una fila trasladada por una migración no la retiró nadie y llega
 * nula. Decir «en una fecha que no consta» es la verdad; poner la fecha de hoy o
 * dejar el hueco serían las dos formas de mentir.
 */
export function retiredWhenText(iso: string | null, now: Date): string {
  if (iso === null || iso.trim() === '') return 'en una fecha que no consta'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'en una fecha que no se ha podido leer'
  const hora = at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const dia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const ayer = new Date(now)
  ayer.setDate(ayer.getDate() - 1)
  if (dia(at) === dia(now)) return `hoy a las ${hora}`
  if (dia(at) === dia(ayer)) return `ayer a las ${hora}`
  const fecha = at.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return `el ${fecha} a las ${hora}`
}

/**
 * La frase completa de la traza: «Retirada por Victoria hoy a las 10:24».
 *
 * El participio lo trae la clase con su género, porque el español no lo perdona: de
 * deducirlo del nombre salen «la fotografía retirado» y «el eslabón retirada».
 */
export function retiredTraceText(item: TrashItem, now: Date): string {
  const spec = kindSpec(item.kind)
  const participle = spec.retired.charAt(0).toUpperCase() + spec.retired.slice(1)
  return `${participle} por ${item.retiredBy} ${retiredWhenText(item.retiredAt, now)}`
}

/** A thing in the wastebasket, already ready to paint. */
export interface TrashItem {
  readonly kind: TrashKindId
  /** The key's value, for the `update` that recovers it. */
  readonly key: string
  /** What it is. Never empty. */
  readonly label: string
  /** What it hangs from or how it is told apart. Empty when it adds nothing. */
  readonly context: string
  readonly retiredAt: string | null
  /** Already resolved to a readable name. */
  readonly retiredBy: string
  /**
   * Por qué recuperarla todavía no serviría, o `null` si se puede.
   *
   * Se decide **antes** de escribir, y no es una precaución de más: medido contra la
   * base, restaurar algo cuyo padre sigue retirado NO falla —la fila vuelve a estar
   * activa y sigue sin verse—. Ver `restoreBlock`.
   */
  readonly blocked: string | null
}

/**
 * Si el padre de una fila está retirado, con las dos formas de saberlo.
 *
 * `retiredKeys` es el conjunto de claves retiradas de la MISMA tabla, que la
 * pantalla ya tiene cargado. Es lo que resuelve las dos tablas anidadas sobre sí
 * mismas, que PostgREST no puede incrustar.
 */
function parentRetired(
  parent: TrashParent,
  row: TrashRow,
  retiredKeys: ReadonlySet<string>,
): boolean | null {
  if (parent.via === 'embed') return embeddedRetired(row, parent.key)
  const id = cell(row, parent.column)
  // With no parent there is no withdrawn parent: a root location has a null `parent_id`.
  if (id === '') return null
  return retiredKeys.has(id)
}

/**
 * La frase que explica por qué recuperar algo todavía no serviría, o `null`.
 *
 * **Este es el motivo por el que la papelera no es un botón mudo.** La base acepta
 * restaurar un eslabón cuya obra sigue retirada: el `update` afecta a una fila,
 * contesta 200 y la usuaria ve «recuperado» mientras en la ficha no aparece nada,
 * porque lo que no se ve es la obra. Comprobado en la base local. Así que el caso se
 * detiene aquí, se dice qué hay que recuperar primero, y no se escribe nada.
 *
 * Se nombran TODOS los padres retirados y no solo el primero: recuperar la obra para
 * descubrir después que también falta la referencia es hacer el mismo viaje dos
 * veces.
 */
export function restoreBlock(
  spec: TrashKindSpec,
  row: TrashRow,
  retiredKeys: ReadonlySet<string>,
): string | null {
  const missing = spec.parents
    .filter((parent) => parentRetired(parent, row, retiredKeys) === true)
    .map((parent) => `${parent.what} (${parent.name(row)})`)
  if (missing.length === 0) return null
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`
  const head =
    missing.length === 1
      ? `Todavía no se puede recuperar: ${list} sigue en la papelera.`
      : `Todavía no se puede recuperar: ${list} siguen en la papelera.`
  return `${head} Recupera eso primero y esto volverá a verse; hacerlo al revés lo devolvería a un sitio que nadie mira.`
}

/**
 * Convierte las filas de una clase en líneas de la papelera.
 *
 * `authors` viene resuelto de una sola consulta a `profiles` para toda la pantalla,
 * como en el historial: son unas pocas personas y no todo el equipo.
 */
export function toTrashItems(
  spec: TrashKindSpec,
  rows: readonly TrashRow[],
  authors: ReadonlyMap<string, TrashAuthor>,
): readonly TrashItem[] {
  // El conjunto se calcula una vez por clase, no una por fila: es lo que resuelve
  // el padre de las tablas anidadas sobre sí mismas.
  const retiredKeys = new Set(rows.map((row) => cell(row, spec.key)))
  return rows.map((row) => {
    const by = cell(row, 'deactivated_by')
    const at = row['deactivated_at']
    return {
      kind: spec.id,
      key: cell(row, spec.key),
      label: spec.label(row),
      context: spec.context(row),
      retiredAt: typeof at === 'string' && at.trim() !== '' ? at : null,
      retiredBy: retiredByText(by === '' ? null : (authors.get(by) ?? null)),
      blocked: restoreBlock(spec, row, retiredKeys),
    }
  })
}

/**
 * «3 obras», «1 obra», «Nada retirado».
 *
 * El caso vacío es una frase y no un cero, por lo mismo que en los bloques de la
 * ficha: «0 obras» se lee como una respuesta sobre el catálogo, y aquí la respuesta
 * es que en la papelera no hay nada de esa clase.
 */
export function kindCountText(spec: TrashKindSpec, count: number): string {
  if (count <= 0) return 'Nada retirado'
  return `${count} ${count === 1 ? spec.one : spec.many}`
}

/** Una clase con lo que tiene dentro, para pintar su bloque. */
export interface TrashKindView {
  readonly spec: TrashKindSpec
  readonly items: readonly TrashItem[]
  /** Si la base tenía más de las que caben en una página. */
  readonly truncated: boolean
  /** Lo que salió mal al leer justo esta clase, si salió algo. */
  readonly error: string | null
}

/**
 * Cuántas cosas hay en la papelera, contando todas las clases.
 *
 * Es lo primero que se lee al abrir la pantalla, y por eso cuenta cosas y no clases:
 * «5 cosas retiradas» responde la pregunta con la que se entra.
 */
export function trashTotalText(views: readonly TrashKindView[]): string {
  const total = views.reduce((sum, view) => sum + view.items.length, 0)
  if (total === 0) return 'No hay nada en la papelera.'
  const suffix = views.some((view) => view.truncated) ? ' o más' : ''
  return total === 1
    ? '1 cosa retirada, y nada se ha borrado de verdad.'
    : `${total}${suffix} cosas retiradas, y nada se ha borrado de verdad.`
}

/**
 * Cuántas de ellas no se pueden recuperar todavía.
 *
 * Se dice arriba y no solo línea por línea: si de treinta cosas veinte están
 * bloqueadas por una obra retirada, lo que hay que hacer es recuperar la obra, y eso
 * no se ve leyendo treinta avisos iguales.
 */
export function blockedCountText(views: readonly TrashKindView[]): string | null {
  const blocked = views.reduce(
    (sum, view) => sum + view.items.filter((item) => item.blocked !== null).length,
    0,
  )
  if (blocked === 0) return null
  return blocked === 1
    ? 'Una de ellas no se puede recuperar todavía: hay que recuperar antes de lo que cuelga.'
    : `${blocked} de ellas no se pueden recuperar todavía: hay que recuperar antes de lo que cuelgan.`
}
