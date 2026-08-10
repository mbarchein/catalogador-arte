import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BASE_FONT_PX,
  TEXT_SCALE_KEY,
  TEXT_SCALES,
  textScaleFontSize,
  type TextScale,
} from './textScale'

/**
 * `index.html`'s boot script and the module say the same thing.
 *
 * ── WHY THIS TEST EXISTS ────────────────────────────────────
 *
 * The chosen text size is applied **before React mounts**, in a `<script>` of
 * `index.html`: in an effect, the first screen would be painted at the normal size and would jump
 * to the chosen one in front of whoever is looking at it. That script cannot import anything, so
 * it repeats the key, the steps and the sizes by hand.
 *
 * An unwatched duplication is the one that goes stale: the day a step is added or a
 * percentage moved, the module will change and `index.html` will fall behind, and the symptom
 * will be a size jump on loading that nobody is going to relate to this. This test is the
 * watch, and it is the same criterion the `pipeline` in YAML is checked with: read the
 * file and assert about what it says.
 */

const HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

/** The `<script>` block applying the scale, isolated from the rest of the page. */
function bootScript(): string {
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '')
  const boot = scripts.find((body) => body.includes(TEXT_SCALE_KEY))
  expect(boot, 'no hay ningún <script> en index.html que lea la clave del tamaño de letra')
    .toBeTypeOf('string')
  return boot ?? ''
}

describe('el script de arranque de index.html', () => {
  it('lee exactamente la clave que escribe la aplicación', () => {
    // With the key mismatched nothing breaks: the setting simply stops being applied
    // on loading and the text jumps when React mounts, which is a symptom nobody relates
    // to this.
    expect(bootScript()).toContain(`'${TEXT_SCALE_KEY}'`)
  })

  it('nombra los escalones que no son el normal, y ninguno de más', () => {
    const script = bootScript()
    for (const scale of TEXT_SCALES) {
      const named = script.includes(`'${scale}'`)
      // `NORMAL` is the default case and does not need naming; the others do, because
      // each one has its own size.
      expect(named, scale).toBe(scale !== 'NORMAL')
    }
  })

  it('y el tamaño de cada uno es el que dice el módulo', () => {
    const script = bootScript()
    for (const scale of TEXT_SCALES) {
      // Without the unit: the script composes `px` separately.
      const px = textScaleFontSize(scale).replace('px', '')
      expect(script, `${scale} → ${px}`).toContain(px)
    }
  })

  it('el tamaño base también, que es el suelo del que nunca se baja', () => {
    expect(bootScript()).toContain(String(BASE_FONT_PX))
  })

  it('no toca la raíz cuando el escalón es el normal', () => {
    // Leaving `font-size: 16px` set by hand would change nothing today, but it would nail the size
    // against whoever has enlarged it from the system — and the browser already knew how to do that
    // before this setting existed.
    expect(bootScript()).toMatch(/!==\s*16|===\s*16|!= 16/)
  })

  it('y va envuelto, porque `localStorage` lanza en el modo privado de Safari', () => {
    // An exception here is an exception before the first paint: the application would
    // not start. It is the place in the project where that matters most.
    const script = bootScript()
    expect(script).toContain('try')
    expect(script).toContain('catch')
  })

  it('corre antes de la aplicación, no después', () => {
    // If it ended up behind the boot module it would lose its only reason to exist.
    const boot = HTML.indexOf(TEXT_SCALE_KEY)
    const app = HTML.indexOf('/src/main.tsx')
    expect(boot).toBeGreaterThan(-1)
    expect(app).toBeGreaterThan(-1)
    expect(boot).toBeLessThan(app)
  })
})

describe('el tamaño de los campos de formulario', () => {
  const CSS = readFileSync(new URL('./../index.css', import.meta.url), 'utf8')

  it('crece con la escala y nunca baja de 16px', () => {
    // It was nailed at 16px so iOS would not zoom on focusing a field with the artwork
    // in front. With the root scaled, the fields would be THE ONLY thing that does not grow — and they are precisely
    // where typing happens. `max(1rem, 16px)` does both things: it grows and does not fall below the threshold.
    const rule = CSS.slice(CSS.indexOf('input,'))
    expect(rule).toMatch(/font-size:\s*max\(1rem,\s*16px\)/)
  })
})

describe('ningún tamaño de letra clavado en píxeles', () => {
  it('las etiquetas pequeñas están en rem, o no crecerían con las demás', async () => {
    // There were 28 —`text-[11px]` and `text-[10px]`, the «En la papelera» badges and
    // company— and they would have stayed nailed while everything else grew, which is
    // exactly the detail that makes an accessibility setting look half
    // done. They now live in Tailwind's scale, as `text-2xs` and `text-3xs`.
    const { globSync } = await import('node:fs')
    const files = globSync('src/**/*.tsx')
    const offenders: string[] = []
    for (const file of files) {
      const body = readFileSync(file, 'utf8')
      for (const match of body.matchAll(/text-\[\d+px\]/g)) {
        offenders.push(`${file}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

/** Type check: the step map does not fall short in silence. */
const _exhaustive: Record<TextScale, true> = { NORMAL: true, LARGE: true, LARGER: true }
void _exhaustive
