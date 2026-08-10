import { globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * No requirement identifier reaches the screen.
 *
 * ── WHY IT IS A TEST AND NOT A REVIEW ───────────────────────
 *
 * `RF-503`, `RNF-106`, `ADR-004` are the way of citing this project's documents, and they
 * are all over the code and all over the tests, which is where they have to be: a test
 * that does not say which requirement it verifies is of no use for detecting an uncovered requirement.
 *
 * But to whoever catalogues they say nothing. Two slipped into the interface —the panel of
 * an exhibition's catalogue and the foot of the grey sheet, which is also PRINTED— without
 * anybody noticing, because whoever writes the text comes from reading the requirement and finds it
 * natural to cite it. It is going to happen again, and that is why this is checked instead of reviewed.
 *
 * ── WHAT IT LOOKS AT, AND WHAT IT DOES NOT ──────────────────
 *
 * Only what reaches the screen: the comments are removed first —block, line and
 * the JSX ones, which are block comments inside braces— and the test files. What is left is
 * code and literals, and there must be none there.
 *
 * And `CHANGELOG.md`, because since it is read inside the application it is interface
 * text like any other.
 */

/** `RF-`, `RNF-` and `ADR-` followed by a number. */
const REQUIREMENT_ID = /\b(?:RF|RNF|ADR)-\d+/g

/**
 * The file without its comments.
 *
 * The block ones first, which is what covers the JSX ones (`{/* … *␘/}`): removing the
 * line ones first would break a URL with `//` inside a block comment.
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
        // With some context: without it, «RF-503» does not say where to look for it.
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
