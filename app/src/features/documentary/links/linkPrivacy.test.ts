import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as externalLinks from './externalLinks'
import * as linkDraft from './linkDraft'
import * as useExternalLinks from './useExternalLinks'

/**
 * RF-1404: **the catalogue does not tell anybody which artwork is being catalogued.**
 *
 * A negative requirement, and that is why it has a test. Storing the address of a
 * museum's record is storing text; asking that site for something is a completely
 * different matter, because the request leaves the cataloguer's browser carrying
 * the address of the record it was pressed from. A site icon, a
 * preview, a thumbnail or an automatic check of whether the link is
 * still alive tell a third party **which artwork is being catalogued and when**, which
 * is precisely what this requirement forbids. That is why a link's check is
 * stamped by a person by hand (RF-1405) and not by a robot.
 *
 * ── WHY THIS TEST READS THE SOURCE CODE ─────────────────────────
 *
 * Because what has to be verified is an ABSENCE across the whole module, and an absence
 * cannot be called. With no DOM environment the block cannot be mounted and the requests
 * that leave cannot be counted, so the two things that can be
 * checked without a browser are checked: that no exported name speaks of those ideas, and that
 * in the text of the piece's five files none of the ways
 * of going out to the network appears.
 *
 * It is the kind of line that gets added in six months' time «because after all it is just one
 * call», and then nobody remembers why it was not there. Now the test fails.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** The piece's code, without its own tests: a test does name what it forbids. */
function featureSources(): { name: string; code: string }[] {
  return readdirSync(HERE)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => ({ name, code: readFileSync(`${HERE}${name}`, 'utf8') }))
}

describe('RF-1404: la aplicación no le pide nada al sitio enlazado', () => {
  /**
   * The names first, because a name is the footprint of an intention: nobody
   * writes `linkFavicon` without going to fetch a favicon.
   */
  it('ningún nombre exportado habla de rastreador, icono, previsualización, instantánea ni acortador', () => {
    const forbidden =
      /favicon|tracker|tracking|beacon|pixel|preview|unfurl|opengraph|og_?image|screenshot|snapshot|thumbnail|shorten|shortener|expand_?url|resolve_?url|ping|probe|reachab|liveness|healthcheck/i
    for (const module of [externalLinks, linkDraft, useExternalLinks]) {
      for (const name of Object.keys(module)) {
        expect(name).not.toMatch(forbidden)
      }
    }
  })

  /**
   * And the ways of going out to the network, in the whole piece's text. `fetch`, `XHR`,
   * an `Image` whose `src` is the stored address, an `<img>` or an `<iframe>`
   * pointing outside, and the tags that make the browser contact a
   * site **before** anybody presses anything.
   *
   * `supabase.rpc` and `supabase.from` are not on the list and are not an exception to
   * the rule: they go to the catalogue, which is the user's, and not to the linked site. The
   * piece's only call that goes out is `is_web_url`, and it is to the base.
   */
  it('en el código de la pieza no hay ninguna forma de contactar con el sitio', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /navigator\.sendBeacon/,
      /new\s+Image\s*\(/,
      /<img\b/i,
      /<iframe\b/i,
      /rel=["'{`]?\s*(preconnect|dns-prefetch|prefetch|preload)/i,
      /window\.open\s*\(/,
    ]
    for (const { name, code } of featureSources()) {
      for (const pattern of forbidden) {
        // The file's name goes in the assertion: with five files, a failure without
        // it forces a hand search for which of the five it is in.
        expect(`${name}: ${pattern.test(code)}`).toBe(`${name}: false`)
      }
    }
  })

  /**
   * The safety net of the check above: if the piece is split into more
   * files and the name pattern stops catching them, this assertion falls and one has to
   * look again. Five files today, checked on 4 August 2026.
   */
  it('la comprobación anterior mira todos los ficheros de la pieza, y se entera si aparecen más', () => {
    const names = featureSources().map((source) => source.name).sort()
    expect(names).toEqual([
      'ExternalLinksSection.tsx',
      'LinkForm.tsx',
      'externalLinks.ts',
      'index.ts',
      'linkDraft.ts',
      'useExternalLinks.ts',
    ])
  })

  /**
   * And what the screen PROMISES the user about this, which is the half that can
   * be read: the form says that the application does not open the page or ask the
   * site for anything. If the call were ever added, this sentence would be a lie, and
   * this assertion ties it to the absence above.
   */
  it('el formulario promete que no se le pide nada al sitio, y la promesa está atada al código', () => {
    const form = readFileSync(`${HERE}LinkForm.tsx`, 'utf8')
    // The sentence was shortened when sweeping the over-explaining; what cannot be lost
    // is the promise, so the assertion follows it by its essential part.
    expect(form).toContain('No se abre la página')
  })
})
