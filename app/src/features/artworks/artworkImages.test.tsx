// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtworkImages } from './artworkImages'

/**
 * Las dos preguntas de una ficha, hechas a la vez (RNF-106).
 *
 * Abrir una ficha necesita dos datos independientes: **qué fotografías tiene** y **cuál
 * es la portada**, que sale de la vista `representative_image` y no depende de la otra
 * consulta. Iban en serie, y eso eran dos idas y venidas seguidas: con datos móviles en
 * un almacén, entre medio segundo y tres segundos con el texto de la obra ya puesto
 * —ese sí se pinta al instante desde el espejo del listado— y los huecos de las fotos
 * vacíos.
 *
 * Este test existe porque **el paralelismo se pierde en una refactorización sin que se
 * note**: `await` seguido de `await` funciona igual de bien y solo es más lento. Así
 * que lo que se mide es la línea del tiempo: que la segunda consulta EMPIECE antes de
 * que la primera conteste. Es lo único que distingue las dos versiones.
 *
 * En jsdom porque lo que se comprueba es el cableado de un gancho de React, no una
 * decisión: la aritmética no tiene dónde vivir aquí.
 */

/** Lo que va pasando, en orden, para poder mirar si se solapan. */
const linea: string[] = []
/** Suelta la respuesta de cada tabla cuando el test lo diga. */
const sueltan: Record<string, () => void> = {}

function respuestaDiferida(tabla: string, data: unknown) {
  return new Promise<{ data: unknown; error: null }>((resolve) => {
    sueltan[tabla] = () => {
      linea.push(`contesta ${tabla}`)
      resolve({ data, error: null })
    }
  })
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      linea.push(`pregunta ${tabla}`)
      const datos =
        tabla === 'images'
          ? [{ image_id: 'TS-0001_v1', thumbnail_path: 't/1', derivative_path: 'd/1' }]
          : { image_id: 'TS-0001_v1', manually_chosen: false }
      const pendiente = respuestaDiferida(tabla, datos)
      // El constructor de consultas de PostgREST: todo devuelve el mismo objeto y la
      // promesa solo se resuelve cuando el test la suelta.
      const constructor: Record<string, unknown> = {
        then: (...args: unknown[]) =>
          (pendiente.then as (...a: unknown[]) => unknown).apply(pendiente, args),
        maybeSingle: () => pendiente,
      }
      for (const metodo of ['select', 'eq', 'order', 'limit']) {
        constructor[metodo] = () => constructor
      }
      return constructor
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}))

vi.mock('../../lib/signedPaths', () => ({
  signPaths: async (paths: readonly string[]) =>
    Object.fromEntries(paths.map((p) => [p, `https://firmado/${p}`])),
}))

function Ficha() {
  const { thumbUrls, mainId, loading } = useArtworkImages('TS-0001')
  return (
    <p>
      {loading ? 'cargando' : 'listo'}·{mainId ?? 'sin-portada'}·{Object.keys(thumbUrls).length}
    </p>
  )
}

describe('las dos consultas de una ficha', () => {
  beforeEach(() => {
    linea.length = 0
    for (const k of Object.keys(sueltan)) delete sueltan[k]
  })

  it('la segunda empieza antes de que la primera conteste', async () => {
    const { getByText } = render(<Ficha />)
    // Con las dos preguntas hechas y ninguna contestada, el solape está probado.
    await waitFor(() => expect(sueltan.representative_image).toBeDefined())
    expect(linea).toEqual(['pregunta images', 'pregunta representative_image'])

    sueltan.images?.()
    sueltan.representative_image?.()
    await waitFor(() => getByText('listo·TS-0001_v1·1'))
  })

  it('y contestar en el orden contrario no descoloca nada', async () => {
    // La portada puede llegar antes que la lista: la vista es más pequeña. Con dos
    // «await» en serie ese caso no existía, y ahora sí.
    const { getByText } = render(<Ficha />)
    await waitFor(() => expect(sueltan.representative_image).toBeDefined())
    sueltan.representative_image?.()
    sueltan.images?.()
    await waitFor(() => getByText('listo·TS-0001_v1·1'))
    expect(linea).toEqual([
      'pregunta images',
      'pregunta representative_image',
      'contesta representative_image',
      'contesta images',
    ])
  })
})
