import { describe, expect, it } from 'vitest'
import {
  displayExhibitionDates,
  displayFileSize,
  displayStructuredDate,
  exhibitionDatesText,
  exhibitionOrderKey,
  fileSizeText,
  partyName,
  partyPlace,
  partyText,
  structuredDateText,
  type ExhibitionDateColumns,
  type PartyRef,
  type StructuredDateColumns,
} from './documentaryFormat'
import { sizeText } from '../artworks/archiveDownloads'

/**
 * The Spanish the five documentary blocks share.
 *
 * What is verified here is what the cataloger READS, which is the only part of
 * these blocks the battery can reach: vitest runs in node, there is no DOM, and
 * anything left inside a component is verified by nobody.
 */

function dated(over: Partial<StructuredDateColumns> = {}): StructuredDateColumns {
  return {
    start_year: null,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    ...over,
  }
}

describe('la fecha estructurada de ADR-004', () => {
  it('ADR-004: un año suelto', () => {
    expect(structuredDateText(dated({ start_year: 1978 }))).toBe('1978')
  })

  it('ADR-004: un rango', () => {
    expect(structuredDateText(dated({ start_year: 1975, end_year: 1978 }))).toBe('1975-1978')
  })

  it('ADR-004: «c.» es aproximada y «[?]» es sin confirmar, y son cosas distintas', () => {
    expect(structuredDateText(dated({ start_year: 1980, approximate_date: true }))).toBe('c. 1980')
    expect(structuredDateText(dated({ start_year: 1980, unconfirmed_date: true }))).toBe('1980 [?]')
    expect(
      structuredDateText(
        dated({ start_year: 1975, end_year: 1978, approximate_date: true, unconfirmed_date: true }),
      ),
    ).toBe('c. 1975-1978 [?]')
  })

  it('ADR-004: la nota escrita a mano gana entera, como en la columna generada', () => {
    expect(
      structuredDateText(dated({ start_year: 1972, date_note: 'finales de los setenta' })),
    ).toBe('finales de los setenta')
  })

  /**
   * The divergence from structuredDate.ts's `composeDate`, which is deliberate:
   * `artworks` requires `end_year > start_year` and there «1978-1978» cannot exist,
   * but `provenance_events` and `archive_documents` admit `end_year >=
   * start_year` and the base stores exactly that. A preview that does not
   * match what is going to be stored is worse than having no preview.
   */
  it('ADR-004: un rango de un solo año se compone como lo hace la base, sin recortarlo', () => {
    expect(structuredDateText(dated({ start_year: 1978, end_year: 1978 }))).toBe('1978-1978')
  })

  it('RF-304: sin fecha se dice, no se deja hueco', () => {
    expect(displayStructuredDate(dated())).toBe('Sin fecha')
  })

  it('el `date_text` de la base manda sobre el espejo cuando la consulta lo trajo', () => {
    // An impossible row on purpose: if the mirror were used, «1978» would come out.
    expect(displayStructuredDate(dated({ start_year: 1978, date_text: 'c. 1930 [?]' }))).toBe(
      'c. 1930 [?]',
    )
  })

  it('un `date_text` en blanco cae al espejo en vez de dejar hueco', () => {
    expect(displayStructuredDate(dated({ start_year: 1978, date_text: '   ' }))).toBe('1978')
  })
})

function shown(over: Partial<ExhibitionDateColumns> = {}): ExhibitionDateColumns {
  return { year: null, start_date: null, end_date: null, date_note: '', ...over }
}

describe('las fechas de una exposición (RF-502)', () => {
  it('RF-502: dos días del mismo mes no repiten el mes', () => {
    expect(
      exhibitionDatesText(shown({ year: 1985, start_date: '1985-03-12', end_date: '1985-03-28' })),
    ).toBe('12-28 de marzo de 1985')
  })

  it('RF-502: dos meses del mismo año no repiten el año', () => {
    expect(
      exhibitionDatesText(shown({ year: 1985, start_date: '1985-03-12', end_date: '1985-05-04' })),
    ).toBe('12 de marzo – 4 de mayo de 1985')
  })

  it('RF-502: una exposición a caballo de dos años lleva los dos años', () => {
    expect(
      exhibitionDatesText(shown({ year: 1985, start_date: '1985-12-12', end_date: '1986-01-04' })),
    ).toBe('12 de diciembre de 1985 – 4 de enero de 1986')
  })

  it('RF-502: el año pelado es lo único que da media prensa de época', () => {
    expect(exhibitionDatesText(shown({ year: 1985 }))).toBe('1985')
  })

  it('con fecha de apertura y sin cierre no se inventa ninguna de las dos cosas', () => {
    expect(exhibitionDatesText(shown({ year: 1985, start_date: '1985-03-12' }))).toBe(
      '12 de marzo de 1985',
    )
  })

  it('apertura y cierre el mismo día se dicen una sola vez', () => {
    expect(
      exhibitionDatesText(shown({ year: 1985, start_date: '1985-03-12', end_date: '1985-03-12' })),
    ).toBe('12 de marzo de 1985')
  })

  it('la nota de fechas se añade detrás, no sustituye a las fechas', () => {
    expect(
      exhibitionDatesText(shown({ year: 1985, date_note: 'fechas exactas sin confirmar' })),
    ).toBe('1985 · fechas exactas sin confirmar')
  })

  it('la fecha no se desplaza un día por el huso horario de quien la lee', () => {
    // A 1 January in Madrid, read as UTC, would be 31 December of the previous
    // year if it were built with `new Date(iso)` and formatted in local time.
    expect(exhibitionDatesText(shown({ year: 1986, start_date: '1986-01-01' }))).toBe(
      '1 de enero de 1986',
    )
  })

  it('RF-304: una exposición sin ninguna fecha lo dice', () => {
    expect(displayExhibitionDates(shown())).toBe('Sin fechar')
  })

  it('RF-502: el orden cronológico usa la apertura, o el 1 de enero del año pelado', () => {
    expect(exhibitionOrderKey({ year: 1985, start_date: '1985-03-12' })).toBe('1985-03-12')
    expect(exhibitionOrderKey({ year: 1985, start_date: null })).toBe('1985-01-01')
    expect(exhibitionOrderKey({ year: null, start_date: null })).toBeNull()
  })
})

function party(over: Partial<PartyRef> = {}): PartyRef {
  return {
    id: 'p1',
    party_type: 'INSTITUTION',
    name: 'Museo de Bellas Artes de Badajoz',
    locality: 'Badajoz',
    country: 'España',
    active: true,
    ...over,
  }
}

describe('el nombre de una persona o una institución (RF-508)', () => {
  it('RF-508: el nombre de la ficha manda', () => {
    expect(partyName(party(), 'lo que sea')).toBe('Museo de Bellas Artes de Badajoz')
  })

  /**
   * RF-509: «Colección privada, España» is a real link with no record behind it, not
   * a loading failure. The base requires `party_id` or `party_note`, never neither of
   * the two.
   */
  it('RF-509: sin ficha, el eslabón se lee por su nota', () => {
    expect(partyName(null, 'Colección privada, España')).toBe('Colección privada, España')
  })

  it('RF-304: sin ficha y sin nota se dice, no se deja hueco', () => {
    expect(partyName(null, '   ')).toBe('Sin identificar')
  })

  it('la localidad distingue a las cuatro «Casa de Cultura» del catálogo', () => {
    expect(partyText(party({ name: 'Casa de Cultura', locality: 'Zafra' }))).toBe(
      'Casa de Cultura (Zafra, España)',
    )
  })

  it('sin localidad ni país, el nombre va solo y sin paréntesis vacíos', () => {
    expect(partyText(party({ locality: '', country: '' }))).toBe(
      'Museo de Bellas Artes de Badajoz',
    )
    expect(partyPlace(party({ locality: '', country: '' }))).toBe('')
  })

  it('con solo el país, no queda una coma suelta', () => {
    expect(partyPlace(party({ locality: '' }))).toBe('España')
  })
})

describe('el tamaño de un fichero subido', () => {
  it('RF-114: por debajo del mega se cuenta en KB', () => {
    expect(fileSizeText(40_960)).toBe('40 KB')
  })

  it('RF-114: por encima, en MB con coma decimal (es-ES)', () => {
    expect(fileSizeText(3_355_443)).toBe('3,2 MB')
  })

  it('un fichero diminuto no se anuncia como 0 KB', () => {
    expect(fileSizeText(120)).toBe('1 KB')
  })

  it('sin tamaño registrado no hay fichero, y no es un fichero de tamaño cero', () => {
    expect(fileSizeText(null)).toBeNull()
    expect(fileSizeText(0)).toBeNull()
    expect(fileSizeText(Number.NaN)).toBeNull()
  })

  it('RF-304: en pantalla, un tamaño que falta se dice', () => {
    expect(displayFileSize(null)).toBe('Tamaño sin registrar')
    expect(displayFileSize(3_355_443)).toBe('3,2 MB')
  })

  /**
   * The deliberate copy of `sizeText` (see the comment in documentaryFormat.ts)
   * is pinned down here: if somebody changes one of the two, this test says so before
   * the record and the photograph downloads start counting the megabytes in
   * two different ways.
   */
  it('dice exactamente lo mismo que `sizeText`, que es de dónde está copiado', () => {
    for (const bytes of [0, 1, 512, 1024, 40_960, 1_048_575, 1_048_576, 3_355_443, 19_922_944]) {
      expect(fileSizeText(bytes)).toBe(sizeText(bytes))
    }
  })
})
