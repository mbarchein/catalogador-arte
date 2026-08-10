/**
 * The text size of the whole application (RNF-106, RF-1205).
 *
 * ── WHY IT IS NEEDED ────────────────────────────────────────
 *
 * A browser already knows how to enlarge text, and this application is ready for that: everything
 * is dimensioned in `rem`, so the system's zoom works. **But in the installed
 * PWA there is no browser bar** —and the installed phone is this project's primary
 * device—, so there is no way of touching it there. This setting is that gap.
 *
 * ── HOW IT SCALES ───────────────────────────────────────────
 *
 * **A single variable: the root's font size.** Tailwind measures everything in `rem`
 * —`text-sm` is 0.875rem, `p-4` is 1rem, the minimum touch target is 2.75rem—, so
 * moving the root scales text, buttons, cards and spacing at once. And that is what
 * is wanted and not only the text: **whoever needs the text bigger also needs
 * the button bigger**. Enlarging only the letters would take them out of buttons designed for the
 * small size and would leave the touch targets just as small, which is the problem.
 *
 * ── THREE STEPS, AND UP TO 130 % ────────────────────────────
 *
 * It is not timidity: beyond that, on a 390-point screen, two-column
 * grids —the «Seguir rellenando / Salir sin guardar» pairs— run out of room, and an
 * application knocked out of place does not read better for having bigger text. Three steps
 * fit in a row of buttons with no dropdown, which is one gesture fewer.
 *
 * ── WHAT DOES NOT SCALE, AND WHY ────────────────────────────
 *
 * The **photograph editor** (crop, perspective, colour) stays at the usual size.
 * It measures its canvas in pixels and computes the handles' positions against the element's
 * real rectangle; and since it takes up the whole screen, while it is open there is nothing
 * else to read. It is done by returning the root to its base size while it lives, which avoids
 * any `zoom` trick over coordinates — see `useTextScale`.
 *
 * Everything that decides anything is here and is pure: the suite runs in node.
 */

/**
 * The three steps. Values in English, like every identifier in the project, and with the
 * shape of a base enum in case this ever goes up to a `profiles` column.
 */
export type TextScale = 'NORMAL' | 'LARGE' | 'LARGER'

export const TEXT_SCALES: readonly TextScale[] = ['NORMAL', 'LARGE', 'LARGER']

/** Each step's percentage, which is what is said on screen next to the name. */
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
 * The base font size, in pixels.
 *
 * 16 and not another: it is the one that prevents iOS from zooming by itself on focusing a field, which is
 * disorienting with the artwork in front during capture. `index.css` explains it where it
 * sets it, and from there comes the fields' floor — `max(1rem, 16px)`, which grows with the scale
 * and never falls below the threshold.
 */
export const BASE_FONT_PX = 16

/**
 * The `localStorage` key.
 *
 * With the shape the application's others already use (`catalogador.batch`,
 * `catalogador.photo-source`). The drafts' one has another —with a colon and a version—
 * and stays as it is: renaming a key that is already set in somebody's browser
 * requires deciding compatibility, and there is nothing to gain from that here.
 */
export const TEXT_SCALE_KEY = 'catalogador.text-scale'

/**
 * Reads a step from whatever was stored.
 *
 * **Anything that is not recognised is `NORMAL`**, with no exceptions: this runs
 * before the application starts —in `index.html`'s script— so a value from
 * another version, from a browser extension or from a half-done save cannot leave the
 * screen at an absurd size or prevent it from being painted.
 */
export function normalizeTextScale(raw: string | null | undefined): TextScale {
  return TEXT_SCALES.includes(raw as TextScale) ? (raw as TextScale) : 'NORMAL'
}

/**
 * The value given to `html { font-size }`.
 *
 * In pixels and not as a percentage: a percentage over the root is measured against the font
 * size the browser already has —which may come changed by the system itself— and
 * then two phones with the same step chosen would show different sizes. With
 * pixels, «Grande» is the same everywhere; whoever has also enlarged the system's text
 * loses nothing, because this setting is precisely for when that cannot be touched.
 */
export function textScaleFontSize(scale: TextScale): string {
  const px = (BASE_FONT_PX * TEXT_SCALE_PERCENT[scale]) / 100
  // No extra decimals: 16, 18.4, 20.8.
  return `${Math.round(px * 100) / 100}px`
}

/** «Grande · 115 %», for each step's button. */
export function textScaleOptionText(scale: TextScale): string {
  return `${TEXT_SCALE_LABEL[scale]} · ${TEXT_SCALE_PERCENT[scale]}%`
}

/**
 * What is read below the three buttons, according to which one is set.
 *
 * With `NORMAL` nothing extra is said —the untouched setting does not need explaining— and with
 * the other two the practical consequence is told, which is what is not visible looking at the
 * profile's screen: less fits per screen, one has to scroll more, and the photograph
 * editor stays as it was.
 */
export function textScaleNotice(scale: TextScale): string | null {
  if (scale === 'NORMAL') return null
  return (
    'Con la letra grande cabe menos en cada pantalla. El editor de fotografía no cambia.'
  )
}

/** The profile's sample sentence, to see the size before leaving there. */
export const TEXT_SCALE_SAMPLE =
  'Paisaje de Zafra · AR-0042 · Estantería 3, carpeta azul'
