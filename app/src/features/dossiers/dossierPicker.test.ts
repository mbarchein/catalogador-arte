import { describe, expect, it } from 'vitest'
import { pickableArtworks, pickerNotice, pickerText, type PickableArtwork } from './dossierPicker'

/** RF-1602: elegir las obras que entran en el dossier. */

function artwork(over: Partial<PickableArtwork> = {}): PickableArtwork {
  return {
    catalog_id: 'AR-0001',
    title: 'Figura sentada',
    artist: 'ROTILI',
    execution_date: '1965',
    active: true,
    ...over,
  }
}

describe('lo que la fila dice y lo que la búsqueda mira', () => {
  it('el código primero, que es como se pide una obra en voz alta', () => {
    expect(pickerText(artwork())).toBe('AR-0001 · Figura sentada · Alberto Rotili · 1965')
  })

  it('una obra sin título no deja un hueco', () => {
    expect(pickerText(artwork({ title: '' }))).toContain('AR-0001')
    expect(pickerText(artwork({ title: '' }))).not.toContain('· ·')
  })
})

describe('lo que ya está no se vuelve a ofrecer', () => {
  it('se descuenta y se cuenta', () => {
    const catalog = [
      artwork({ catalog_id: 'AR-0001' }),
      artwork({ catalog_id: 'AR-0002' }),
      artwork({ catalog_id: 'AR-0003' }),
    ]
    const result = pickableArtworks(catalog, ['AR-0002'], '')
    expect(result.entries.map((entry) => entry.catalogId)).toEqual(['AR-0003', 'AR-0001'])
    // Contado y dicho: un catálogo al que le faltan obras es como alguien concluye
    // que una no está catalogada.
    expect(result.alreadyIn).toBe(1)
  })

  it('una obra retirada del catálogo no se ofrece y no cuenta como «ya está»', () => {
    const catalog = [artwork({ catalog_id: 'AR-0001', active: false }), artwork({ catalog_id: 'AR-0002' })]
    const result = pickableArtworks(catalog, [], '')
    expect(result.entries.map((entry) => entry.catalogId)).toEqual(['AR-0002'])
    expect(result.alreadyIn).toBe(0)
  })
})

describe('el orden y el tope', () => {
  it('la más reciente primero: es la que se está buscando', () => {
    const catalog = [
      artwork({ catalog_id: 'AR-0001' }),
      artwork({ catalog_id: 'AR-0042' }),
      artwork({ catalog_id: 'AR-0007' }),
    ]
    expect(pickableArtworks(catalog, [], '').entries.map((entry) => entry.catalogId)).toEqual([
      'AR-0042',
      'AR-0007',
      'AR-0001',
    ])
  })

  it('con la consulta vacía se ofrece la cabeza del catálogo, no nada', () => {
    // El primer dossier se arma navegando, no buscando.
    const catalog = Array.from({ length: 5 }, (_, index) =>
      artwork({ catalog_id: `AR-000${index + 1}` }),
    )
    expect(pickableArtworks(catalog, [], '').entries).toHaveLength(5)
  })

  it('el tope corta la lista, porque nadie recorre trescientas filas en un móvil', () => {
    const catalog = Array.from({ length: 60 }, (_, index) =>
      artwork({ catalog_id: `AR-${String(index + 1).padStart(4, '0')}` }),
    )
    expect(pickableArtworks(catalog, [], '').entries).toHaveLength(20)
    expect(pickableArtworks(catalog, [], '', { limit: 3 }).entries).toHaveLength(3)
  })

  it('la búsqueda encuentra por código, por título y por año', () => {
    const catalog = [
      artwork({ catalog_id: 'AR-0001', title: 'Figura sentada', execution_date: '1965' }),
      artwork({ catalog_id: 'AR-0002', title: 'Puerto', execution_date: '1971' }),
    ]
    expect(pickableArtworks(catalog, [], 'puerto').entries[0]?.catalogId).toBe('AR-0002')
    expect(pickableArtworks(catalog, [], '0001').entries[0]?.catalogId).toBe('AR-0001')
    expect(pickableArtworks(catalog, [], '1971').entries[0]?.catalogId).toBe('AR-0002')
  })
})

describe('nunca un selector en blanco (RF-304)', () => {
  it('mientras el espejo del catálogo se llena lo dice', () => {
    expect(
      pickerNotice({ loading: true, shown: 0, alreadyIn: 0, catalogSize: 0, query: '' }),
    ).toContain('Cargando')
  })

  it('el catálogo entero dentro del dossier se explica, porque parece un fallo', () => {
    expect(
      pickerNotice({ loading: false, shown: 0, alreadyIn: 3, catalogSize: 3, query: '' }),
    ).toContain('todas las obras')
  })

  it('una búsqueda sin resultados no dice que el catálogo esté vacío', () => {
    expect(
      pickerNotice({ loading: false, shown: 0, alreadyIn: 0, catalogSize: 9, query: 'zzz' }),
    ).toContain('coincide')
  })

  it('con filas no dice nada', () => {
    expect(
      pickerNotice({ loading: false, shown: 2, alreadyIn: 0, catalogSize: 9, query: '' }),
    ).toBeNull()
  })
})
