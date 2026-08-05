/**
 * El tamaño de letra de toda la aplicación (RNF-106, RF-1205).
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────
 *
 * Un navegador ya sabe agrandar el texto, y esta aplicación está preparada para eso: todo
 * está dimensionado en `rem`, así que el zoom del sistema funciona. **Pero en la PWA
 * instalada no hay barra de navegador** —y el móvil instalado es el dispositivo principal
 * de este proyecto—, así que ahí no hay forma de tocarlo. Este ajuste es ese hueco.
 *
 * ── CÓMO ESCALA ─────────────────────────────────────────────
 *
 * **Una sola variable: el tamaño de letra de la raíz.** Tailwind lo mide todo en `rem`
 * —`text-sm` son 0,875rem, `p-4` es 1rem, el objetivo de toque mínimo son 2,75rem—, así
 * que mover la raíz escala texto, botones, tarjetas y separaciones a la vez. Y eso es lo
 * que se quiere y no solo el texto: **quien necesita la letra más grande necesita también
 * el botón más grande**. Agrandar solo las letras las sacaría de botones pensados para el
 * tamaño pequeño y dejaría los objetivos de toque igual de pequeños, que es el problema.
 *
 * ── TRES ESCALONES, Y HASTA 130 % ───────────────────────────
 *
 * No es timidez: a partir de ahí, en una pantalla de 390 puntos, las rejillas de dos
 * columnas —los pares «Seguir rellenando / Salir sin guardar»— se quedan sin sitio, y una
 * aplicación descolocada no se lee mejor por tener la letra más grande. Tres escalones
 * caben en una fila de botones sin desplegable, que es un gesto menos.
 *
 * ── LO QUE NO ESCALA, Y POR QUÉ ─────────────────────────────
 *
 * El **editor de fotografía** (recorte, perspectiva, color) se queda al tamaño de siempre.
 * Mide su lienzo en píxeles y calcula las posiciones de los tiradores contra el rectángulo
 * real del elemento; y como ocupa la pantalla entera, mientras está abierto no hay nada
 * más que leer. Se hace devolviendo la raíz a su tamaño base mientras vive, que evita
 * cualquier truco de `zoom` sobre coordenadas — ver `useTextScale`.
 *
 * Todo lo que decide algo está aquí y es puro: la batería corre en node.
 */

/**
 * Los tres escalones. Valores en inglés, como todo identificador del proyecto, y con la
 * forma de un enum de la base por si algún día esto sube a una columna de `profiles`.
 */
export type TextScale = 'NORMAL' | 'LARGE' | 'LARGER'

export const TEXT_SCALES: readonly TextScale[] = ['NORMAL', 'LARGE', 'LARGER']

/** El porcentaje de cada escalón, que es lo que se dice en pantalla junto al nombre. */
export const TEXT_SCALE_PERCENT: Record<TextScale, number> = {
  NORMAL: 100,
  LARGE: 115,
  LARGER: 130,
}

export const TEXT_SCALE_LABEL: Record<TextScale, string> = {
  NORMAL: 'Normal',
  LARGE: 'Grande',
  LARGER: 'Más grande',
}

/**
 * El tamaño de letra base, en píxeles.
 *
 * 16 y no otro: es el que evita que iOS haga zoom solo al enfocar un campo, que es
 * desorientador con la obra delante durante la captura. `index.css` lo explica donde lo
 * fija, y de ahí sale el suelo de los campos — `max(1rem, 16px)`, que crece con la escala
 * y nunca baja del umbral.
 */
export const BASE_FONT_PX = 16

/**
 * La clave de `localStorage`.
 *
 * Con la forma que ya usan las demás de la aplicación (`catalogador.batch`,
 * `catalogador.photo-source`). La de los borradores tiene otra —con dos puntos y versión—
 * y se queda como está: renombrar una clave que ya está puesta en el navegador de alguien
 * exige decidir la compatibilidad, y aquí no hay nada que ganar con eso.
 */
export const TEXT_SCALE_KEY = 'catalogador.text-scale'

/**
 * Lee un escalón de lo que hubiera guardado.
 *
 * **Cualquier cosa que no se reconozca es `NORMAL`**, y sin excepciones: esto se ejecuta
 * antes de que arranque la aplicación —en el script de `index.html`— así que un valor de
 * otra versión, de una extensión del navegador o de un guardado a medias no puede dejar la
 * pantalla en un tamaño absurdo ni impedir que se pinte.
 */
export function normalizeTextScale(raw: string | null | undefined): TextScale {
  return TEXT_SCALES.includes(raw as TextScale) ? (raw as TextScale) : 'NORMAL'
}

/**
 * El valor que se le pone a `html { font-size }`.
 *
 * En píxeles y no en porcentaje: un porcentaje sobre la raíz se mide contra el tamaño de
 * letra que el navegador ya tenga —que puede venir cambiado por el propio sistema— y
 * entonces dos teléfonos con el mismo escalón elegido enseñarían tamaños distintos. Con
 * píxeles, «Grande» es lo mismo en todas partes; quien además haya agrandado el texto del
 * sistema no pierde nada, porque este ajuste está justo para cuando eso no se puede tocar.
 */
export function textScaleFontSize(scale: TextScale): string {
  const px = (BASE_FONT_PX * TEXT_SCALE_PERCENT[scale]) / 100
  // Sin decimales de más: 16, 18.4, 20.8.
  return `${Math.round(px * 100) / 100}px`
}

/** «Grande · 115 %», para el botón de cada escalón. */
export function textScaleOptionText(scale: TextScale): string {
  return `${TEXT_SCALE_LABEL[scale]} · ${TEXT_SCALE_PERCENT[scale]} %`
}

/**
 * Lo que se lee debajo de los tres botones, según el que esté puesto.
 *
 * Con `NORMAL` no se dice nada de más —el ajuste sin tocar no necesita explicarse— y con
 * los otros dos se cuenta la consecuencia práctica, que es lo que no se ve mirando la
 * pantalla del perfil: cabe menos por pantalla, hay que desplazarse más, y el editor de
 * fotografía se queda como estaba.
 */
export function textScaleNotice(scale: TextScale): string | null {
  if (scale === 'NORMAL') return null
  return (
    'Con la letra más grande cabe menos en cada pantalla y hay que desplazarse más: los botones ' +
    'crecen con el texto, para que se puedan seguir tocando. El editor de fotografía se queda al ' +
    'tamaño normal, porque sus mandos y su lienzo se miden en píxeles.'
  )
}

/** La frase de muestra del perfil, para ver el tamaño antes de salir de ahí. */
export const TEXT_SCALE_SAMPLE =
  'Paisaje de Zafra · AR-0042 · Estantería 3, carpeta azul'
