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
 * El script de arranque de `index.html` y el módulo dicen lo mismo.
 *
 * ── POR QUÉ ESTE TEST EXISTE ────────────────────────────────
 *
 * El tamaño de letra elegido se aplica **antes de que React monte**, en un `<script>` de
 * `index.html`: en un efecto, la primera pantalla se pintaría al tamaño normal y saltaría
 * al elegido delante de quien la está mirando. Ese script no puede importar nada, así que
 * repite a mano la clave, los escalones y los tamaños.
 *
 * Una duplicación sin vigilar es la que se queda vieja: el día que se añada un escalón o se
 * mueva un porcentaje, el módulo cambiará y `index.html` se quedará atrás, y el síntoma
 * será un salto de tamaño al cargar que nadie va a relacionar con esto. Este test es la
 * vigilancia, y es el mismo criterio con el que se comprueba el `pipeline` en YAML: leer el
 * fichero y afirmar sobre lo que dice.
 */

const HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

/** El bloque `<script>` que aplica la escala, aislado del resto de la página. */
function bootScript(): string {
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '')
  const boot = scripts.find((body) => body.includes(TEXT_SCALE_KEY))
  expect(boot, 'no hay ningún <script> en index.html que lea la clave del tamaño de letra')
    .toBeTypeOf('string')
  return boot ?? ''
}

describe('el script de arranque de index.html', () => {
  it('lee exactamente la clave que escribe la aplicación', () => {
    // Con la clave desparejada no se rompe nada: simplemente el ajuste deja de aplicarse
    // al cargar y la letra salta al montar React, que es un síntoma que nadie relaciona
    // con esto.
    expect(bootScript()).toContain(`'${TEXT_SCALE_KEY}'`)
  })

  it('nombra los escalones que no son el normal, y ninguno de más', () => {
    const script = bootScript()
    for (const scale of TEXT_SCALES) {
      const named = script.includes(`'${scale}'`)
      // `NORMAL` es el caso por omisión y no hace falta nombrarlo; los demás sí, porque
      // cada uno tiene su tamaño.
      expect(named, scale).toBe(scale !== 'NORMAL')
    }
  })

  it('y el tamaño de cada uno es el que dice el módulo', () => {
    const script = bootScript()
    for (const scale of TEXT_SCALES) {
      // Sin la unidad: el script compone `px` aparte.
      const px = textScaleFontSize(scale).replace('px', '')
      expect(script, `${scale} → ${px}`).toContain(px)
    }
  })

  it('el tamaño base también, que es el suelo del que nunca se baja', () => {
    expect(bootScript()).toContain(String(BASE_FONT_PX))
  })

  it('no toca la raíz cuando el escalón es el normal', () => {
    // Dejar `font-size: 16px` puesto a mano no cambiaría nada hoy, pero clavaría el tamaño
    // contra quien lo haya agrandado desde el sistema — y el navegador ya sabía hacer eso
    // antes de que existiera este ajuste.
    expect(bootScript()).toMatch(/!==\s*16|===\s*16|!= 16/)
  })

  it('y va envuelto, porque `localStorage` lanza en el modo privado de Safari', () => {
    // Una excepción aquí es una excepción antes del primer pintado: la aplicación no
    // arrancaría. Es el sitio del proyecto donde eso importa más.
    const script = bootScript()
    expect(script).toContain('try')
    expect(script).toContain('catch')
  })

  it('corre antes de la aplicación, no después', () => {
    // Si quedara detrás del módulo de arranque perdería su único motivo de existir.
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
    // Estaba clavado en 16px para que iOS no hiciera zoom al enfocar un campo con la obra
    // delante. Con la raíz escalada, los campos serían LO ÚNICO que no crece — y son justo
    // donde se teclea. `max(1rem, 16px)` hace las dos cosas: crece y no baja del umbral.
    const rule = CSS.slice(CSS.indexOf('input,'))
    expect(rule).toMatch(/font-size:\s*max\(1rem,\s*16px\)/)
  })
})

describe('ningún tamaño de letra clavado en píxeles', () => {
  it('las etiquetas pequeñas están en rem, o no crecerían con las demás', async () => {
    // Eran 28 —`text-[11px]` y `text-[10px]`, las insignias de «En la papelera» y
    // compañía— y se habrían quedado clavadas mientras todo lo demás crecía, que es
    // exactamente el detalle que hace que un ajuste de accesibilidad parezca a medio
    // hacer. Viven ahora en la escala de Tailwind, como `text-2xs` y `text-3xs`.
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

/** Comprobación de tipos: el mapa de escalones no se queda corto en silencio. */
const _exhaustive: Record<TextScale, true> = { NORMAL: true, LARGE: true, LARGER: true }
void _exhaustive
