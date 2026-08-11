import { describe, expect, it } from 'vitest'
import {
  DOSSIER_COLUMNS,
  DOSSIER_INDEX_COLUMNS,
  dossierSearchText,
  dossierSubtitle,
  dossiersNotice,
  rankDossiers,
  retiredCount,
  sortDossiers,
  type DossierRow,
} from './dossierIndex'

/** RF-1601, RF-1610, RF-609: el listado de dossieres, su orden y su búsqueda. */

function dossier(over: Partial<DossierRow> = {}): DossierRow {
  return {
    id: 'd1',
    title: 'Selección para galería',
    purpose: 'Galería',
    note: '',
    cover_text: '',
    recipient_party_id: null,
    show_provenance: false,
    show_exhibitions: true,
    show_bibliography: false,
    show_prices: false,
    active: true,
    recipient: null,
    ...over,
  }
}

describe('las columnas que se piden', () => {
  it('están las once del tipo, y el destinatario viene unido', () => {
    for (const column of [
      'title',
      'purpose',
      'note',
      'cover_text',
      'recipient_party_id',
      'show_provenance',
      'show_exhibitions',
      'show_bibliography',
      'show_prices',
      'active',
    ]) {
      expect(DOSSIER_COLUMNS).toContain(column)
    }
    // Unido y no en una segunda consulta: doce dossieres serían trece peticiones.
    expect(DOSSIER_INDEX_COLUMNS).toContain('recipient:parties(')
  })
})

describe('el orden y la búsqueda', () => {
  it('ordena por título en español, con el identificador de desempate', () => {
    const rows = [
      dossier({ id: 'b', title: 'Zurbarán' }),
      dossier({ id: 'a', title: 'Álvarez' }),
      dossier({ id: 'c', title: 'Badajoz' }),
    ]
    // «Álvarez» primero: con la colación de la base podría irse detrás de la z.
    expect(sortDossiers(rows).map((row) => row.title)).toEqual(['Álvarez', 'Badajoz', 'Zurbarán'])
  })

  it('la búsqueda mira el título, el uso y el destinatario', () => {
    const row = dossier({
      title: 'Selección corta',
      purpose: 'Galería',
      recipient: { id: 'p1', name: 'Galería Serrano' },
    })
    expect(dossierSearchText(row)).toBe('Selección corta · Galería · Galería Serrano')
    expect(rankDossiers([row], 'serrano')).toHaveLength(1)
  })

  it('encuentra por destinatario, que es como se nombra un dossier meses después', () => {
    const rows = [
      dossier({ id: 'a', title: 'Uno', recipient: { id: 'p1', name: 'Galería Serrano' } }),
      dossier({ id: 'b', title: 'Dos', recipient: null }),
    ]
    expect(rankDossiers(rows, 'serrano').map((entry) => entry.row.id)).toEqual(['a'])
  })
})

describe('lo retirado no se esconde para siempre (RF-609)', () => {
  it('por omisión no sale, porque el listado es de lo vigente', () => {
    const rows = [dossier({ id: 'a' }), dossier({ id: 'b', active: false })]
    expect(rankDossiers(rows, '').map((entry) => entry.row.id)).toEqual(['a'])
  })

  it('pero se pueden pedir, que es el único camino de vuelta', () => {
    const rows = [dossier({ id: 'a' }), dossier({ id: 'b', active: false })]
    const entries = rankDossiers(rows, '', { includeRetired: true })
    expect(entries).toHaveLength(2)
    // Y no se cuelan en silencio: la fila lo dice.
    expect(entries.find((entry) => entry.row.id === 'b')?.retired).toBe(true)
  })

  it('se cuentan, para que el interruptor diga cuántos hay antes de pulsarlo', () => {
    expect(retiredCount([dossier({ id: 'a' }), dossier({ id: 'b', active: false })])).toBe(1)
  })
})

describe('la segunda línea de una fila', () => {
  it('dice a quién va', () => {
    expect(dossierSubtitle(dossier({ recipient: { id: 'p1', name: 'Galería Serrano' } }))).toContain(
      'Galería Serrano',
    )
  })

  it('sin destinatario lo dice en vez de dejar un hueco (RF-304)', () => {
    expect(dossierSubtitle(dossier({ purpose: '' }))).toBe('Sin destinatario')
  })

  it('avisa de los precios antes de que nadie lo abra', () => {
    // Es el único ajuste con consecuencia fuera del estudio, así que la fila que
    // los lleva lo dice.
    expect(dossierSubtitle(dossier({ show_prices: true }))).toContain('con precios')
    expect(dossierSubtitle(dossier({ show_prices: false }))).not.toContain('precios')
  })

  it('no repite el uso cuando es el nombre del destinatario', () => {
    const row = dossier({ purpose: 'Galería Serrano', recipient: { id: 'p1', name: 'Galería Serrano' } })
    expect(dossierSubtitle(row)).toBe('Galería Serrano')
  })
})

describe('nunca una página en blanco (RF-304)', () => {
  it('el catálogo sin dossieres dice qué es esta pantalla', () => {
    const notice = dossiersNotice({ loading: false, error: null, count: 0, query: '' })
    expect(notice).toContain('Todavía no hay ningún dossier')
  })

  it('una búsqueda sin resultados no dice que no haya dossieres', () => {
    const notice = dossiersNotice({ loading: false, error: null, count: 0, query: 'zzz' })
    expect(notice).toContain('coincida')
  })

  it('mientras carga lo dice, y tras un fallo se calla', () => {
    expect(dossiersNotice({ loading: true, error: null, count: 0, query: '' })).toContain('Cargando')
    expect(dossiersNotice({ loading: false, error: 'x', count: 0, query: '' })).toBeNull()
  })
})
