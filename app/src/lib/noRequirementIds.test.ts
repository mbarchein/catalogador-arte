import { globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Ningún identificador de requisito llega a la pantalla.
 *
 * ── POR QUÉ ES UN TEST Y NO UNA REVISIÓN ────────────────────
 *
 * `RF-503`, `RNF-106`, `ADR-004` son la forma de citar los documentos de este proyecto, y
 * están por todo el código y por todos los tests, que es donde tienen que estar: un test
 * que no dice qué requisito verifica no sirve para detectar un requisito sin cubrir.
 *
 * Pero a quien cataloga no le dicen nada. Se colaron dos en la interfaz —el panel del
 * catálogo de una exposición y el pie de la hoja de gris, que además se IMPRIME— sin que
 * nadie lo notara, porque quien escribe el texto viene de leer el requisito y le parece
 * natural citarlo. Va a volver a pasar, y por eso esto se comprueba en vez de revisarse.
 *
 * ── QUÉ MIRA, Y QUÉ NO ──────────────────────────────────────
 *
 * Solo lo que llega a la pantalla: se quitan antes los comentarios —de bloque, de línea y
 * los de JSX, que son de bloque dentro de llaves— y los ficheros de test. Lo que queda es
 * código y literales, y ahí no debe haber ninguno.
 *
 * Y el `CHANGELOG.md`, porque desde que se lee dentro de la aplicación es texto de
 * interfaz como cualquier otro.
 */

/** `RF-`, `RNF-` y `ADR-` seguidos de un número. */
const REQUIREMENT_ID = /\b(?:RF|RNF|ADR)-\d+/g

/**
 * El fichero sin sus comentarios.
 *
 * Los de bloque primero, que es lo que cubre los de JSX (`{/* … *␘/}`): quitar antes los
 * de línea rompería una URL con `//` dentro de un comentario de bloque.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('ningún identificador de requisito en la interfaz', () => {
  it('no aparece en ningún texto que se pinte', () => {
    const offenders: string[] = []
    for (const file of globSync('src/**/*.{ts,tsx}')) {
      if (file.includes('.test.')) continue
      const source = withoutComments(readFileSync(file, 'utf8'))
      for (const match of source.matchAll(REQUIREMENT_ID)) {
        // Con algo de contexto: sin él, «RF-503» no dice dónde buscarlo.
        const at = match.index
        offenders.push(`${file}: …${source.slice(Math.max(0, at - 50), at + 30).trim()}…`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('y sí siguen en los comentarios, que es donde sirven', () => {
    // El contrapeso: si esta comprobación se «arreglara» quitándolos de todas partes, se
    // perdería la trazabilidad entre el código y los documentos de requisitos, que es lo
    // que permite detectar un requisito sin cubrir.
    const total = globSync('src/**/*.{ts,tsx}')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
      .match(REQUIREMENT_ID)
    expect(total?.length ?? 0).toBeGreaterThan(100)
  })

  it('tampoco en el registro de cambios, que se lee dentro de la aplicación', () => {
    const changelog = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8')
    const found = changelog.match(REQUIREMENT_ID) ?? []
    expect(found).toEqual([])
  })
})
