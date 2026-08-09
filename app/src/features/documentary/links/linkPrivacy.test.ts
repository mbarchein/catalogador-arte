import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as externalLinks from './externalLinks'
import * as linkDraft from './linkDraft'
import * as useExternalLinks from './useExternalLinks'

/**
 * RF-1404: **el catálogo no le cuenta a nadie qué obra se está catalogando.**
 *
 * Requisito negativo, y por eso tiene test. Guardar la dirección de la ficha de un
 * museo es guardar texto; pedirle algo a ese sitio es otra cosa completamente
 * distinta, porque la petición sale del navegador de la catalogadora y lleva encima
 * la dirección de la ficha desde la que se pulsó. Un icono del sitio, una
 * previsualización, una miniatura o una comprobación automática de si el enlace
 * sigue vivo le cuentan a un tercero **qué obra se está catalogando y cuándo**, que
 * es justo lo que este requisito prohíbe. Por eso la comprobación de un enlace la
 * sella una persona a mano (RF-1405) y no un robot.
 *
 * ── POR QUÉ ESTE TEST LEE EL CÓDIGO FUENTE ──────────────────────
 *
 * Porque lo que hay que verificar es una AUSENCIA en todo el módulo, y una ausencia
 * no se puede llamar. Sin entorno de DOM no se puede montar el bloque y contar las
 * peticiones que salen, así que se comprueban las dos cosas que sí se pueden
 * comprobar sin navegador: que ningún nombre exportado hable de esas ideas, y que
 * en el texto de los cinco ficheros de la pieza no aparezca ninguna de las formas
 * de salir a la red.
 *
 * Es la clase de línea que se añade dentro de seis meses «porque total es una
 * llamada», y entonces nadie se acuerda de por qué no estaba. Ahora falla el test.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** El código de la pieza, sin sus propios tests: un test sí nombra lo que prohíbe. */
function featureSources(): { name: string; code: string }[] {
  return readdirSync(HERE)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => ({ name, code: readFileSync(`${HERE}${name}`, 'utf8') }))
}

describe('RF-1404: la aplicación no le pide nada al sitio enlazado', () => {
  /**
   * Los nombres primero, porque un nombre es la huella de una intención: nadie
   * escribe `linkFavicon` sin ir a buscar un favicon.
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
   * Y las formas de salir a la red, en el texto de la pieza entera. `fetch`, `XHR`,
   * un `Image` cuyo `src` sea la dirección guardada, un `<img>` o un `<iframe>`
   * apuntando fuera, y las etiquetas que hacen que el navegador contacte con un
   * sitio **antes** de que nadie pulse nada.
   *
   * `supabase.rpc` y `supabase.from` no están en la lista y no son una excepción a
   * la regla: van al catálogo, que es de la usuaria, y no al sitio enlazado. La
   * única llamada de la pieza que sale es `is_web_url`, y es a la base.
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
        // El nombre del fichero va en el aserto: con cinco ficheros, un fallo sin
        // él obliga a buscar a mano en cuál de los cinco está.
        expect(`${name}: ${pattern.test(code)}`).toBe(`${name}: false`)
      }
    }
  })

  /**
   * La red de seguridad de la comprobación de arriba: si la pieza se parte en más
   * ficheros y el patrón de nombres deja de cazarlos, este aserto se cae y hay que
   * volver a mirar. Cinco ficheros hoy, comprobado el 4 de agosto de 2026.
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
   * Y lo que la pantalla le PROMETE a la usuaria sobre esto, que es la mitad que se
   * puede leer: el formulario dice que la aplicación no abre la página ni le pide
   * nada al sitio. Si algún día se añadiera la llamada, esta frase sería mentira, y
   * este aserto la ata a la ausencia de arriba.
   */
  it('el formulario promete que no se le pide nada al sitio, y la promesa está atada al código', () => {
    const form = readFileSync(`${HERE}LinkForm.tsx`, 'utf8')
    // La frase se acortó al barrer la sobreexplicación; lo que no puede perderse
    // es la promesa, así que el aserto la sigue por su parte esencial.
    expect(form).toContain('No se abre la página')
  })
})
