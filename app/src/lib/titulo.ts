import type { Obra, ValorTituloAtribuido } from './tipos'

/**
 * RF-209. La distinción es fina y el esquema le dedicó una revisión entera:
 *
 *  - Obra sin ningún título       → `titulo` vacío, se muestra «[Sin título]»
 *    entre corchetes. El texto es una referencia visual, no un dato: no se
 *    guarda nunca en la base.
 *  - Obra que el artista tituló literalmente *Sin título* → `titulo` contiene
 *    "Sin título" y se muestra tal cual, sin corchetes.
 *
 * Los corchetes son, por tanto, lo único que separa las dos situaciones en
 * pantalla, y de ahí que no se puedan escribir a mano en el campo.
 */
export function mostrarTitulo(titulo: string): string {
  return titulo.trim() === '' ? '[Sin título]' : titulo
}

/** True si el título que se muestra es un marcador y no un título real. */
export function esTituloMarcador(titulo: string): boolean {
  return titulo.trim() === ''
}

/**
 * RF-307: un título atribuido tiene que distinguirse en la cabecera de la ficha.
 * Si no, la diferencia entre un título de Rotili y un nombre que le puso la
 * familia solo existe dentro de la base de datos, que es donde no la ve nadie.
 */
export function avisoTituloAtribuido(valor: ValorTituloAtribuido): string | null {
  switch (valor) {
    case 'SI':
      return 'Nombre atribuido, no del artista'
    case 'SIN_REVISAR':
      return 'Autoría del título sin confirmar'
    case 'NO':
    case 'NO_APLICA':
      return null
  }
}

/**
 * RF-306: un estado de existencia distinto de «Conservada» sube a la cabecera.
 * Que una obra esté destruida o en paradero desconocido es lo primero que hay
 * que ver al abrir su ficha, no un dato enterrado entre otros veinte.
 */
export function avisoExistencia(obra: Pick<Obra, 'estado_existencia'>): string | null {
  switch (obra.estado_existencia) {
    case 'DESTRUIDA':
      return 'Obra destruida'
    case 'PERDIDA':
      return 'Paradero desconocido'
    case 'DESCONOCIDO':
      return 'Estado desconocido'
    case 'CONSERVADA':
    case 'SIN_REVISAR':
      return null
  }
}

/** Dimensiones legibles: «73 × 60 cm», con profundidad solo si aplica. */
export function mostrarMedidas(
  obra: Pick<Obra, 'alto_cm' | 'ancho_cm' | 'profundidad_cm'>,
): string {
  const { alto_cm, ancho_cm, profundidad_cm } = obra
  if (alto_cm == null && ancho_cm == null) return 'Sin medir'

  const num = (v: number | null) => (v == null ? '?' : String(v).replace(/\.00?$/, ''))
  const base = `${num(alto_cm)} × ${num(ancho_cm)}`
  return profundidad_cm == null ? `${base} cm` : `${base} × ${num(profundidad_cm)} cm`
}
