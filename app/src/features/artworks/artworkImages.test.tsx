// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtworkImages, type ImageRow } from './artworkImages'
import { readArtworkImagesSnapshot, saveArtworkImagesSnapshot } from './artworkImagesCache'

/**
 * The two questions of a record, asked at once (RNF-106).
 *
 * Opening a record needs two independent data: **which photographs it has** and **which
 * one is the cover**, which comes from the `representative_image` view and needs nothing
 * from the other query. They went in series, and that was two round trips back to back: on
 * mobile data in a storeroom, between half a second and three seconds with the artwork's
 * text already painted —that one does paint instantly, off the list's mirror— and the
 * photo gaps empty.
 *
 * This test exists because **the parallelism is lost in a refactor without anyone
 * noticing**: `await` followed by `await` works just as well and is only slower. So what
 * is measured is the timeline: that the second query STARTS before the first one answers.
 * It is the only thing that tells the two versions apart.
 *
 * In jsdom because what is checked is the wiring of a React hook, not a decision: the
 * arithmetic has nowhere to live here.
 */

/** What happens, in order, so the overlap can be looked at. */
const linea: string[] = []
/** Releases each table's answer when the test says so. */
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
          ? [
              {
                image_id: 'TS-0001_v1',
                thumbnail_path: 't/1',
                derivative_path: 'd/1',
                // El tipo de toma viaja en la consulta y el espejo lo exige: es el rótulo
                // de la tira, y sin él la fila se pintaría como «undefined».
                shot_type: 'GENERAL',
              },
            ]
          : { image_id: 'TS-0001_v1', manually_chosen: false }
      const pendiente = respuestaDiferida(tabla, datos)
      // The PostgREST query builder: everything returns the same object and the promise
      // only resolves when the test releases it.
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
  // Todo lo pedido cuenta como ya firmado: el espejo de firmas tiene sus propios tests
  // (`signedPaths.test.ts`), y lo que se mira aquí es que la ficha pinte sin esperar.
  cachedSignedPaths: (paths: readonly string[]) =>
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
    window.localStorage.clear()
  })

  it('la segunda empieza antes de que la primera conteste', async () => {
    const { getByText } = render(<Ficha />)
    // With both questions asked and neither answered, the overlap is proven.
    await waitFor(() => expect(sueltan.representative_image).toBeDefined())
    expect(linea).toEqual(['pregunta images', 'pregunta representative_image'])

    sueltan.images?.()
    sueltan.representative_image?.()
    await waitFor(() => getByText('listo·TS-0001_v1·1'))
  })

  it('con espejo la ficha ya está pintada antes de que contesten', async () => {
    // El parpadeo al reabrir una ficha: las fotografías no se piden a la red, pero QUÉ
    // fotografías tiene sí. La consulta se deja colgada a propósito —si contestara al
    // instante, los dos estados serían indistinguibles y el test pasaría con y sin
    // espejo—.
    saveArtworkImagesSnapshot('TS-0001', {
      rows: [
        {
          image_id: 'TS-0001_v1',
          thumbnail_path: 't/1',
          derivative_path: 'd/1',
          shot_type: 'GENERAL',
        } as ImageRow,
      ],
      mainId: 'TS-0001_v1',
      manuallyChosen: false,
    })

    const { getByText } = render(<Ficha />)

    // Ni el aviso de espera ni el hueco de la miniatura, en el primer fotograma.
    getByText('listo·TS-0001_v1·1')
    expect(linea).toEqual(['pregunta images', 'pregunta representative_image'])

    // Y lo que contesta la base se queda, que es el refresco por detrás.
    sueltan.images?.()
    sueltan.representative_image?.()
    await waitFor(() => getByText('listo·TS-0001_v1·1'))
  })

  it('y lo que contestan queda en el espejo para la vez siguiente', async () => {
    const { getByText } = render(<Ficha />)
    sueltan.images?.()
    sueltan.representative_image?.()
    await waitFor(() => getByText('listo·TS-0001_v1·1'))

    expect(readArtworkImagesSnapshot('TS-0001')?.mainId).toBe('TS-0001_v1')
  })

  it('y contestar en el orden contrario no descoloca nada', async () => {
    // The cover can arrive before the list: the view is smaller. With two `await` in
    // series that case did not exist, and now it does.
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
