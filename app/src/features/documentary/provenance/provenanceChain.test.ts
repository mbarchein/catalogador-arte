import { describe, expect, it } from 'vitest'
import {
  acquisitionText,
  capacityText,
  chainBlockState,
  chainContinuity,
  chainGaps,
  chainLinks,
  chainLoadState,
  chainReach,
  chainTimeline,
  composeProvenanceLine,
  currentHolder,
  currentHolderText,
  gapLabel,
  gapsBefore,
  linkSpan,
  narrativeBlockState,
  provenanceNarrative,
  trailingGap,
  type ChainGap,
} from './provenanceChain'
import type { ProvenanceEventRow } from '../documentaryRows'
import type { PartyRef } from '../documentaryFormat'
import { blockState } from '../researchState'
import { sectionSpec } from '../sections'

/**
 * RF-509, RF-510 y la regla que decide si esta pantalla sirve: un HUECO en la
 * cadena no es un tramo investigado sin resultado.
 *
 * Una procedencia se juzga por lo que NO dice. Que entre 1971 y 1984 no haya
 * ningún eslabón no significa que la obra se quedara donde estaba, ni que no
 * cambiara de manos: significa que nadie lo ha documentado. Confundir las dos
 * cosas es publicar una afirmación que ningún investigador ha hecho, y es
 * exactamente lo que un comisario mira primero.
 */

// ── Working material ─────────────────────────────────────────

function party(over: Partial<PartyRef> = {}): PartyRef {
  return {
    id: 'party-1',
    party_type: 'INSTITUTION',
    name: 'Museo de Bellas Artes de Badajoz',
    locality: 'Badajoz',
    country: 'España',
    active: true,
    ...over,
  }
}

let counter = 0

/** A link with the minimum, and its years when they are passed in. */
function link(over: Partial<ProvenanceEventRow> = {}): ProvenanceEventRow {
  counter += 1
  const row: ProvenanceEventRow = {
    id: `event-${counter}`,
    catalog_id: 'AR-0042',
    position: counter,
    party_id: null,
    party_note: 'Colección particular, España',
    capacity: 'UNREVIEWED',
    acquisition: 'UNREVIEWED',
    start_year: null,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    date_text: '',
    note: '',
    active: true,
    party: null,
    ...over,
  }
  // `date_text` is a generated column: the test material imitates what the base
  // would return, so the record does not read a date the base would not compose.
  if (over.date_text === undefined) {
    row.date_text =
      row.date_note !== ''
        ? row.date_note
        : row.start_year === null
          ? ''
          : `${row.approximate_date ? 'c. ' : ''}${row.start_year}${
              row.end_year === null ? '' : `-${row.end_year}`
            }${row.unconfirmed_date ? ' [?]' : ''}`
  }
  return row
}

// ── The links, one by one ────────────────────────────────────

describe('un eslabón de la cadena (RF-509)', () => {
  it('con ficha, se lee por su nombre y su localidad', () => {
    const [one] = chainLinks([link({ party_id: 'party-1', party: party(), party_note: '' })])
    expect(one?.name).toBe('Museo de Bellas Artes de Badajoz')
    expect(one?.place).toBe('Badajoz, España')
    expect(one?.identified).toBe(true)
    expect(one?.detail).toBe('')
  })

  it('sin ficha, la nota libre ES el nombre y no se repite debajo', () => {
    const [one] = chainLinks([link({ party_note: 'Colección privada, España' })])
    expect(one?.name).toBe('Colección privada, España')
    expect(one?.identified).toBe(false)
    expect(one?.detail).toBe('')
  })

  it('con ficha Y nota, la nota es la precisión que la ficha no da', () => {
    const [one] = chainLinks([
      link({
        party_id: 'party-1',
        party: party({ name: 'Colección particular familia Hormeño', party_type: 'PERSON' }),
        party_note: 'Propiedad de la tía de Almudena Hormeño',
      }),
    ])
    expect(one?.name).toBe('Colección particular familia Hormeño')
    expect(one?.detail).toBe('Propiedad de la tía de Almudena Hormeño')
  })

  /** RF-901: a withdrawn record still names the link; it goes dim, it is not removed. */
  it('una ficha retirada se marca, pero el nombre no desaparece', () => {
    const [one] = chainLinks([
      link({ party_id: 'party-1', party: party({ active: false }), party_note: '' }),
    ])
    expect(one?.retired).toBe(true)
    expect(one?.name).toBe('Museo de Bellas Artes de Badajoz')
  })

  /** RF-304: never a gap on screen. */
  it('un eslabón sin fecha lo dice, en vez de dejar el sitio en blanco', () => {
    const [one] = chainLinks([link()])
    expect(one?.dates).toBe('Sin fecha')
    expect(one?.dated).toBe(false)
  })

  it('la fecha que muestra es la que compuso la base, no una segunda versión', () => {
    const [one] = chainLinks([
      link({ start_year: 1985, end_year: 1990, date_text: 'c. 1985-1990' }),
    ])
    expect(one?.dates).toBe('c. 1985-1990')
  })

  it('el último eslabón se sabe cuál es, que es el que contesta «¿y ahora?»', () => {
    const links = chainLinks([link({ position: 1 }), link({ position: 2 })])
    expect(links.map((one) => one.last)).toEqual([false, true])
    expect(links.map((one) => one.ordinal)).toEqual([1, 2])
  })
})

/**
 * RF-205 y RF-218 dentro de una fila: dos etiquetas que dijeran «Sin revisar» a
 * secas no dicen cuál de las dos preguntas está sin contestar.
 */
describe('«sin revisar» no es «no», dentro del eslabón (RF-205)', () => {
  it('cada «sin revisar» lleva su pregunta, y no son la misma etiqueta', () => {
    expect(capacityText('UNREVIEWED')).toBe('En qué calidad, sin revisar')
    expect(acquisitionText('UNREVIEWED')).toBe('Cómo llegó, sin revisar')
    expect(capacityText('UNREVIEWED')).not.toBe(acquisitionText('UNREVIEWED'))
  })

  it('investigado sin resultado no se lee como pendiente', () => {
    expect(capacityText('UNKNOWN')).toBe('Se desconoce en qué calidad')
    expect(acquisitionText('UNKNOWN')).toBe('Se desconoce cómo llegó')
    expect(capacityText('UNKNOWN')).not.toBe(capacityText('UNREVIEWED'))
    expect(acquisitionText('UNKNOWN')).not.toBe(acquisitionText('UNREVIEWED'))
  })

  it('los valores contestados se leen del mapa compartido', () => {
    expect(capacityText('DEPOSIT')).toBe('En depósito')
    expect(acquisitionText('GIFT')).toBe('Donación')
  })

  it('el eslabón marca cuál de las dos preguntas sigue sin mirar', () => {
    const [one] = chainLinks([link({ capacity: 'OWNER', acquisition: 'UNREVIEWED' })])
    expect(one?.capacityUnreviewed).toBe(false)
    expect(one?.acquisitionUnreviewed).toBe(true)
  })
})

// ── The gaps, which are the reason for all this ──────────────

describe('el hueco en la cadena (RF-509)', () => {
  it('los años que un eslabón cubre salen de la estructura, no del texto', () => {
    expect(linkSpan(link({ start_year: 1985, end_year: 1990 }))).toEqual({ from: 1985, to: 1990 })
    expect(linkSpan(link({ start_year: 1985 }))).toEqual({ from: 1985, to: null })
    // «finales de los setenta» gets printed and cannot be measured.
    expect(linkSpan(link({ date_note: 'finales de los setenta' }))).toBeNull()
  })

  it('un tramo que nadie cubre se declara hueco, y se dice qué NO significa', () => {
    const rows = [
      link({ position: 1, start_year: 1950, end_year: 1970 }),
      link({ position: 2, start_year: 1985, end_year: 1990 }),
    ]
    const gaps = chainGaps(rows, { currentYear: 1991 })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.fromYear).toBe(1971)
    expect(gaps[0]?.toYear).toBe(1984)
    expect(gaps[0]?.reason).toBe('unrecorded')
    expect(gaps[0]?.text).toContain('14 años')
    expect(gaps[0]?.text).toContain('No dice que se quedara donde estaba')
    expect(gaps[0]?.text).toContain('nadie lo ha documentado')
  })

  it('un relevo consecutivo no es un hueco: 1970 → 1971 es la misma cadena', () => {
    const rows = [
      link({ position: 1, start_year: 1950, end_year: 1970 }),
      link({ position: 2, start_year: 1971 }),
    ]
    expect(chainGaps(rows, { currentYear: 1975 })).toEqual([])
  })

  it('un relevo el mismo año tampoco: se compra y se vende en 1985', () => {
    const rows = [
      link({ position: 1, start_year: 1980, end_year: 1985 }),
      link({ position: 2, start_year: 1985 }),
    ]
    expect(chainGaps(rows, { currentYear: 1986 })).toEqual([])
  })

  it('un hueco de un solo año se dice en singular y sin «de X a X»', () => {
    const rows = [
      link({ position: 1, start_year: 1980, end_year: 1985 }),
      link({ position: 2, start_year: 1987 }),
    ]
    const [gap] = chainGaps(rows, { currentYear: 1990 })
    expect(gap?.text).toContain('un año')
    expect(gap?.text).toContain('el año 1986')
  })

  /**
   * Un eslabón sin año final no dice que la obra se quedara allí hasta el
   * siguiente: dice que no consta hasta cuándo. Es un hueco de otra clase y se
   * cuenta de otra manera.
   */
  it('un eslabón sin año final abre un hueco distinto del que nadie cubre', () => {
    const rows = [
      link({ position: 1, start_year: 1968 }),
      link({ position: 2, start_year: 1985 }),
    ]
    const [gap] = chainGaps(rows, { currentYear: 1990 })
    expect(gap?.reason).toBe('open-end')
    expect(gap?.fromYear).toBe(1969)
    expect(gap?.toYear).toBe(1984)
    expect(gap?.text).toContain('no dice hasta cuándo')
    expect(gap?.text).toContain('el catálogo no lo afirma')
  })

  /**
   * Un solape no se denuncia: un propietario que conserva la titularidad
   * mientras un museo tiene la obra en depósito son dos eslabones verdaderos a
   * la vez, y para eso existe la calidad de tenencia.
   */
  it('un solape no es un error y no se señala', () => {
    const rows = [
      link({ position: 1, capacity: 'OWNER', start_year: 1950, end_year: 1995 }),
      link({ position: 2, capacity: 'DEPOSIT', start_year: 1985, end_year: 1990 }),
    ]
    expect(chainGaps(rows, { currentYear: 1996 })).toEqual([])
  })

  /**
   * El caso que obliga a medir la cadena y no las parejas de vecinos: con un
   * propietario hasta 1995 y un depósito que se cierra en 1990 debajo, comparar
   * cada eslabón con el anterior inventaría un hueco desde 1991 teniendo la
   * línea del propietario justo al lado diciendo lo contrario.
   */
  it('lo que cubre un eslabón anterior cuenta, aunque otro se cierre antes', () => {
    const rows = [
      link({ position: 1, capacity: 'OWNER', start_year: 1950, end_year: 1995 }),
      link({ position: 2, capacity: 'DEPOSIT', start_year: 1985, end_year: 1990 }),
      link({ position: 3, start_year: 1998 }),
    ]
    const gaps = chainGaps(rows, { currentYear: 2026 })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.fromYear).toBe(1996)
    expect(gaps[0]?.toYear).toBe(1997)
  })

  it('el alcance de la cadena es el año más lejano que documenta, no el del último eslabón', () => {
    const owner = link({ position: 1, start_year: 1950, end_year: 1995 })
    const deposit = link({ position: 2, start_year: 1985, end_year: 1990 })
    expect(chainReach([owner, deposit])).toEqual({
      covered: 1995,
      coveringId: owner.id,
      open: false,
      holderId: owner.id,
    })
    // A link with no final year leaves the chain open: nobody has said it left there.
    const open = link({ position: 3, start_year: 1995 })
    const reach = chainReach([owner, deposit, open])
    expect(reach.open).toBe(true)
    expect(reach.holderId).toBe(open.id)
    expect(chainReach([link()])).toEqual({
      covered: null,
      coveringId: null,
      open: false,
      holderId: null,
    })
  })

  it('los eslabones sin fecha no inventan huecos: se saltan al medir', () => {
    const rows = [
      link({ position: 1, start_year: 1950, end_year: 1970 }),
      link({ position: 2, date_note: 'sin fecha conocida' }),
      link({ position: 3, start_year: 1971 }),
    ]
    expect(chainGaps(rows, { currentYear: 1975 })).toEqual([])
  })

  it('la procedencia empieza en el artista: de la ejecución al primer eslabón hay cadena', () => {
    const rows = [link({ position: 1, start_year: 1985 })]
    const gaps = chainGaps(rows, { originYear: 1968, currentYear: 1990 })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.afterId).toBeNull()
    expect(gaps[0]?.fromYear).toBe(1969)
    expect(gaps[0]?.toYear).toBe(1984)
    expect(gaps[0]?.text).toContain('empieza en el artista')
  })

  it('sin año de ejecución no se inventa el hueco inicial', () => {
    const rows = [link({ position: 1, start_year: 1985 })]
    expect(chainGaps(rows, { currentYear: 1990 })).toEqual([])
  })

  it('la obra que se ejecuta y se documenta enseguida no abre hueco inicial', () => {
    const rows = [link({ position: 1, start_year: 1969 })]
    expect(chainGaps(rows, { originYear: 1968, currentYear: 1970 })).toEqual([])
  })

  /** The gap asked about first: and where is it now? */
  it('una cadena que se cierra en el pasado deja un hueco hasta hoy', () => {
    const rows = [link({ position: 1, start_year: 1985, end_year: 1990 })]
    const gaps = chainGaps(rows, { currentYear: 2026 })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.beforeId).toBeNull()
    expect(gaps[0]?.fromYear).toBe(1991)
    expect(gaps[0]?.toYear).toBe(2026)
    expect(trailingGap(gaps)).toBe(gaps[0])
  })

  it('una cadena abierta no deja hueco final: el último eslabón sigue teniéndola', () => {
    const rows = [link({ position: 1, start_year: 1985 })]
    expect(chainGaps(rows, { currentYear: 2026 })).toEqual([])
    expect(trailingGap([])).toBeNull()
  })

  /**
   * Basta UN eslabón sin año final para que la cadena no se cierre: esa tenencia
   * puede seguir corriendo, y afirmar un hueco hasta hoy por encima de ella sería
   * cerrar una cadena que nadie ha cerrado.
   */
  it('con un eslabón abierto en medio, no se afirma hueco hasta hoy', () => {
    const rows = [
      link({ position: 1, start_year: 1968 }),
      link({ position: 2, start_year: 1985, end_year: 1990 }),
    ]
    const gaps = chainGaps(rows, { currentYear: 2026 })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.reason).toBe('open-end')
    expect(trailingGap(gaps)).toBeNull()
  })

  it('cada hueco sabe entre qué dos eslabones va, para pintarlo en su sitio', () => {
    const first = link({ position: 1, start_year: 1950, end_year: 1970 })
    const second = link({ position: 2, start_year: 1985, end_year: 2025 })
    const gaps = chainGaps([first, second], { currentYear: 2026 })
    expect(gapsBefore(gaps, second.id)).toHaveLength(1)
    expect(gapsBefore(gaps, first.id)).toEqual([])
  })

  it('todo hueco se explica con una frase entera (RF-304)', () => {
    const rows = [
      link({ position: 1, start_year: 1950, end_year: 1970 }),
      link({ position: 2, start_year: 1985, end_year: 1990 }),
    ]
    for (const gap of chainGaps(rows, { originYear: 1948, currentYear: 2026 })) {
      expect(gap.text.trim()).not.toBe('')
      expect(gap.text.length).toBeGreaterThan(40)
    }
  })
})

describe('la continuidad de la cadena entera', () => {
  it('sin eslabones no dice nada: el bloque vacío ya se explica solo', () => {
    const state = chainContinuity([])
    expect(state.tone).toBe('empty')
    expect(state.text).toBeNull()
  })

  it('con huecos, lo dice arriba y aclara que no afirma nada sobre esos años', () => {
    const rows = [
      link({ position: 1, start_year: 1950, end_year: 1970 }),
      link({ position: 2, start_year: 1985 }),
    ]
    const state = chainContinuity(rows, { currentYear: 2026 })
    expect(state.tone).toBe('gaps')
    expect(state.text).toContain('un hueco')
    expect(state.text).toContain('no afirma nada')
  })

  it('varios huecos se cuentan en plural', () => {
    const rows = [
      link({ position: 1, start_year: 1950, end_year: 1960 }),
      link({ position: 2, start_year: 1970, end_year: 1980 }),
      link({ position: 3, start_year: 1990 }),
    ]
    const state = chainContinuity(rows, { currentYear: 2026 })
    expect(state.gaps).toHaveLength(2)
    expect(state.text).toContain('2 huecos')
  })

  /**
   * La distinción que salva la pantalla de mentir: no hay huecos MEDIBLES no es
   * lo mismo que no hay huecos.
   */
  it('una cadena sin fechas no es una cadena continua: dice que no se puede medir', () => {
    const rows = [link({ position: 1 }), link({ position: 2 })]
    const state = chainContinuity(rows, { currentYear: 2026 })
    expect(state.tone).toBe('undated')
    expect(state.undated).toBe(2)
    expect(state.text).toContain('no se puede decir si la cadena es continua')
    expect(state.text).not.toContain('sin huecos entre ellos')
  })

  it('con parte de los eslabones fechados, se dice cuántos faltan por fechar', () => {
    const rows = [
      link({ position: 1, start_year: 1985, end_year: 1990 }),
      link({ position: 2, start_year: 1990 }),
      link({ position: 3 }),
    ]
    const state = chainContinuity(rows, { currentYear: 2026 })
    expect(state.tone).toBe('undated')
    expect(state.text).toContain('1 de los 3 eslabones')
  })

  it('un solo eslabón no es un recorrido, y no se presenta como uno', () => {
    const state = chainContinuity([link({ position: 1, start_year: 1985 })], { currentYear: 2026 })
    expect(state.tone).toBe('single')
    expect(state.text).toContain('solo un punto')
  })

  it('una cadena encadenada lo dice, sin prometer que esté completa (RF-218)', () => {
    const rows = [
      link({ position: 1, start_year: 1968, end_year: 1985 }),
      link({ position: 2, start_year: 1985 }),
    ]
    const state = chainContinuity(rows, { originYear: 1968, currentYear: 2026 })
    expect(state.tone).toBe('continuous')
    expect(state.text).toContain('sin huecos entre ellos')
    expect(state.text).toContain('estado de la investigación')
  })
})

// ── Who has it now ───────────────────────────────────────────

describe('el último eslabón (RF-509)', () => {
  it('es el de la posición más alta, aunque las filas lleguen desordenadas', () => {
    const first = link({ position: 1 })
    const last = link({ position: 7 })
    expect(currentHolder([last, first])?.id).toBe(last.id)
    expect(currentHolder([])).toBeNull()
  })

  it('sin eslabones no hay frase que dar', () => {
    expect(currentHolderText([], 'UNREVIEWED')).toBeNull()
  })

  it('con la investigación cerrada y sin año final, la obra consta HOY ahí', () => {
    const rows = [
      link({ position: 1, start_year: 1990, party_id: 'p', party: party(), party_note: '' }),
    ]
    const text = currentHolderText(rows, 'COMPLETE', 2026)
    expect(text).toContain('hoy')
    expect(text).toContain('Museo de Bellas Artes de Badajoz')
  })

  it('sin cerrar la investigación no se dice «hoy»: se dice hasta dónde consta', () => {
    const rows = [link({ position: 1, start_year: 1990, party_note: 'Colección particular' })]
    const text = currentHolderText(rows, 'UNREVIEWED', 2026)
    expect(text).toContain('último eslabón documentado')
    expect(text).toContain('puede no ser donde está la obra ahora')
    expect(text).not.toContain('consta hoy')
  })

  it('una cadena cerrada en el pasado avisa de que el último eslabón NO es el poseedor', () => {
    const rows = [link({ position: 1, start_year: 1985, end_year: 1990 })]
    const text = currentHolderText(rows, 'COMPLETE', 2026)
    expect(text).toContain('termina en 1990')
    expect(text).toContain('no es el poseedor actual')
  })

  it('con un depósito cerrado sobre un propietario vivo, quien la tiene es el propietario', () => {
    const rows = [
      link({
        position: 1,
        capacity: 'OWNER',
        start_year: 1950,
        party_id: 'p',
        party: party({ name: 'Familia Hormeño', party_type: 'PERSON' }),
        party_note: '',
      }),
      link({
        position: 2,
        capacity: 'DEPOSIT',
        start_year: 1985,
        end_year: 1990,
        party_id: 'q',
        party: party(),
        party_note: '',
      }),
    ]
    const text = currentHolderText(rows, 'COMPLETE', 2026)
    expect(text).toContain('Familia Hormeño')
    expect(text).not.toContain('termina en 1990')
  })
})

// ── The publishable account (RF-510) ─────────────────────────

describe('la línea de procedencia compuesta (RF-510)', () => {
  it('encadena los eslabones con punto y coma, con su sitio y sus años', () => {
    const rows = [
      link({
        position: 1,
        party_id: 'p1',
        party: party({ name: 'Colección particular familia Hormeño', party_type: 'PERSON' }),
        party_note: '',
        capacity: 'OWNER',
        start_year: 1968,
        end_year: 1985,
      }),
      link({
        position: 2,
        party_id: 'p2',
        party: party(),
        party_note: '',
        capacity: 'DEPOSIT',
        start_year: 1985,
      }),
    ]
    expect(composeProvenanceLine(rows)).toBe(
      'Colección particular familia Hormeño, Badajoz, España, 1968-1985; ' +
        'Museo de Bellas Artes de Badajoz, Badajoz, España, en depósito, 1985.',
    )
  })

  /**
   * La línea es un borrador de algo publicable, y «Sin revisar» es una nota
   * sobre el trabajo del catálogo, no sobre la obra: no se publica.
   */
  it('no publica «sin revisar» ni «en propiedad»', () => {
    const rows = [
      link({ position: 1, party_note: 'Colección privada', capacity: 'UNREVIEWED', start_year: 1970 }),
      link({ position: 2, party_note: 'Otra colección', capacity: 'OWNER', start_year: 1980 }),
    ]
    const line = composeProvenanceLine(rows)
    expect(line).not.toContain('Sin revisar')
    expect(line).not.toContain('sin revisar')
    expect(line).not.toContain('propiedad')
    expect(line).toBe('Colección privada, 1970; Otra colección, 1980.')
  })

  it('lo investigado sin resultado SÍ se publica: es un dato', () => {
    const rows = [link({ position: 1, party_note: 'Colección privada', capacity: 'UNKNOWN' })]
    expect(composeProvenanceLine(rows)).toContain('se desconoce en qué calidad')
  })

  it('la fecha que publica es la que compuso la base, nota incluida', () => {
    const rows = [link({ position: 1, party_note: 'Colección privada', date_note: 'finales de los setenta' })]
    expect(composeProvenanceLine(rows)).toBe('Colección privada, finales de los setenta.')
  })

  it('sin eslabones no compone nada', () => {
    expect(composeProvenanceLine([])).toBe('')
  })
})

describe('de dónde sale la procedencia que se imprime (RF-510)', () => {
  const rows = [link({ position: 1, party_note: 'Colección privada', start_year: 1970 })]

  it('el relato escrito manda, y se imprime tal cual', () => {
    const narrative = provenanceNarrative(
      '  Adquirida por la familia en 1970, según el catálogo de 1985.  ',
      rows,
    )
    expect(narrative.source).toBe('written')
    expect(narrative.text).toBe('Adquirida por la familia en 1970, según el catálogo de 1985.')
    expect(narrative.caveat).toBeNull()
  })

  it('sin relato, se compone con los eslabones y se dice que es un borrador', () => {
    const narrative = provenanceNarrative('', rows)
    expect(narrative.source).toBe('composed')
    expect(narrative.text).toBe('Colección privada, 1970.')
    expect(narrative.caveat).toContain('no lo ha escrito nadie')
    expect(narrative.caveat).toContain('Omite lo que está sin revisar')
  })

  it('sin relato y sin eslabones no hay texto que enseñar', () => {
    const narrative = provenanceNarrative('   ', [])
    expect(narrative.source).toBe('none')
    expect(narrative.text).toBe('')
    expect(narrative.caveat).toBeNull()
  })
})

// ── The chain as a single reading ────────────────────────────

describe('la cadena se lee como una historia, no como una tabla (RF-509)', () => {
  /** A 1968 artwork with a gap from 1972 to 1984 in the middle. */
  function chainWithGap() {
    const rows = [
      link({ position: 1, party_note: 'Antonio Rotili', start_year: 1968, end_year: 1971 }),
      link({ position: 2, party_note: 'Galería Multitud', start_year: 1985, end_year: 1990 }),
    ]
    const gaps = chainGaps(rows, { currentYear: 1990 })
    return { rows, gaps, timeline: chainTimeline(chainLinks(rows), gaps) }
  }

  it('el hueco se pinta ENTRE las dos manos que separa, no en una nota aparte', () => {
    const { timeline } = chainWithGap()
    expect(timeline.map((entry) => entry.kind)).toEqual(['link', 'gap', 'link'])
    const middle = timeline[1]
    expect(middle?.kind === 'gap' && middle.gap.fromYear).toBe(1972)
    expect(middle?.kind === 'gap' && middle.gap.toYear).toBe(1984)
  })

  it('los eslabones salen en el orden que fijó la catalogadora', () => {
    const { timeline } = chainWithGap()
    const names = timeline.flatMap((entry) => (entry.kind === 'link' ? [entry.link.name] : []))
    expect(names).toEqual(['Antonio Rotili', 'Galería Multitud'])
  })

  it('una cadena sin huecos es solo sus eslabones', () => {
    const rows = [
      link({ position: 1, start_year: 1970, end_year: 1985 }),
      link({ position: 2, start_year: 1985, end_year: 1990 }),
    ]
    const timeline = chainTimeline(chainLinks(rows), chainGaps(rows, { currentYear: 1990 }))
    expect(timeline.every((entry) => entry.kind === 'link')).toBe(true)
    expect(timeline).toHaveLength(2)
  })

  it('el hueco que llega hasta hoy CIERRA la lectura: es lo último que se pregunta', () => {
    const rows = [link({ position: 1, start_year: 1970, end_year: 1985 })]
    const gaps = chainGaps(rows, { currentYear: 2026 })
    const timeline = chainTimeline(chainLinks(rows), gaps)
    expect(timeline.map((entry) => entry.kind)).toEqual(['link', 'gap'])
    const last = timeline[1]
    expect(last?.kind === 'gap' && last.gap.beforeId).toBeNull()
    expect(last?.kind === 'gap' && last.gap.toYear).toBe(2026)
  })

  it('el hueco que empieza en el artista ABRE la lectura (RF-509)', () => {
    const rows = [link({ position: 1, start_year: 1985 })]
    const gaps = chainGaps(rows, { originYear: 1968, currentYear: 1990 })
    const timeline = chainTimeline(chainLinks(rows), gaps)
    expect(timeline.map((entry) => entry.kind)).toEqual(['gap', 'link'])
    const first = timeline[0]
    expect(first?.kind === 'gap' && first.gap.afterId).toBeNull()
    expect(first?.kind === 'gap' && first.gap.fromYear).toBe(1969)
  })

  it('ningún hueco se pierde: uno que no encaja en su sitio cierra la lectura', () => {
    // Defensivo, y es la razón por la que existe la salvaguarda: un hueco que la
    // pantalla decidiera no pintar sería la pantalla afirmando una continuidad
    // que nadie ha documentado.
    const rows = [link({ position: 1, start_year: 1970 })]
    const orphan: ChainGap = {
      afterId: 'event-fantasma',
      beforeId: 'event-que-no-esta',
      fromYear: 1930,
      toYear: 1940,
      reason: 'unrecorded',
      text: 'De 1930 a 1940 no consta nada.',
    }
    const timeline = chainTimeline(chainLinks(rows), [orphan])
    expect(timeline).toHaveLength(2)
    expect(timeline[1]?.kind).toBe('gap')
  })

  it('cada entrada trae una clave estable y distinta de las demás', () => {
    const { timeline } = chainWithGap()
    const keys = timeline.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    // The link's key is its identifier: reordering the chain moves the
    // row and does not create it again.
    expect(keys[0]).toContain('event-')
  })

  it('sin eslabones no hay nada que leer', () => {
    expect(chainTimeline([], [])).toEqual([])
  })

  it('el hueco lleva encima sus años, que es lo que se lee de pasada', () => {
    const rows = [
      link({ position: 1, start_year: 1968, end_year: 1971 }),
      link({ position: 2, start_year: 1985 }),
    ]
    const [gap] = chainGaps(rows, { currentYear: 1990 })
    expect(gap && gapLabel(gap)).toBe('Hueco de 1972 a 1984')
  })

  it('un hueco de un solo año no se dice como un tramo', () => {
    const rows = [
      link({ position: 1, start_year: 1968, end_year: 1970 }),
      link({ position: 2, start_year: 1972 }),
    ]
    const [gap] = chainGaps(rows, { currentYear: 1990 })
    expect(gap && gapLabel(gap)).toBe('Hueco en 1971')
  })

  it('el tramo que sigue a un eslabón sin cerrar se llama por lo que es', () => {
    const rows = [
      link({ position: 1, start_year: 1968 }),
      link({ position: 2, start_year: 1985 }),
    ]
    const [gap] = chainGaps(rows, { currentYear: 1990 })
    expect(gap?.reason).toBe('open-end')
    expect(gap && gapLabel(gap)).toBe('Cadena abierta de 1969 a 1984')
  })

  /**
   * El año de hoy no se imprime: cambia solo, y puesto ahí hace que la ficha
   * parezca afirmar algo sobre este año cuando lo que afirma es «desde 1986 no
   * consta».
   */
  it('el hueco que llega hasta hoy dice «hoy» y no el año en curso', () => {
    const rows = [link({ position: 1, start_year: 1980, end_year: 1985 })]
    const gap = trailingGap(chainGaps(rows, { currentYear: 2026 }))
    expect(gap && gapLabel(gap)).toBe('Hueco de 1986 a hoy')
  })
})

// ── The two queries that feed the block ──────────────────────

describe('lo que el bloque puede decir mientras llega (RF-304, RF-218)', () => {
  const spec = sectionSpec('provenance')
  const base = {
    rowsLoading: false,
    rowsError: null,
    status: 'UNREVIEWED' as const,
    statusLoading: false,
    statusError: null,
  }

  it('sin la cadena no se muestra nada, y se dice que es un fallo de carga', () => {
    const state = chainLoadState(spec, { ...base, rowsError: 'network error' })
    expect(state.error).toBe('network error')
    expect(state.loading).toBe(false)
    expect(state.statusUnknownNotice).toBeNull()
  })

  it('mientras falte cualquiera de las dos consultas, el bloque no afirma un recuento', () => {
    expect(chainLoadState(spec, { ...base, rowsLoading: true }).loading).toBe(true)
    expect(chainLoadState(spec, { ...base, statusLoading: true }).loading).toBe(true)
  })

  it('con las dos leídas no hay nada que avisar', () => {
    const state = chainLoadState(spec, base)
    expect(state).toEqual({ loading: false, error: null, statusUnknownNotice: null })
  })

  it('con la cadena leída y el estado no, se avisa en vez de dar el bloque por cerrado', () => {
    const state = chainLoadState(spec, { ...base, status: null, statusError: 'no such row' })
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.statusUnknownNotice).toContain('no dice si la cadena está completa')
    expect(state.statusUnknownNotice).toContain('no such row')
  })

  it('el aviso ocupa el sitio del texto vacío cuando no hay eslabones', () => {
    // This is the case that matters: it is exactly when the emptiness can be read as a «no».
    const state = chainBlockState(blockState(spec, 'UNREVIEWED', 0), 'No se sabe si alguien miró.')
    expect(state.emptyText).toBe('No se sabe si alguien miró.')
    expect(state.partialText).toBeNull()
  })

  it('con eslabones, el aviso va ENCIMA de ellos y no los tapa', () => {
    const state = chainBlockState(blockState(spec, 'UNREVIEWED', 3), 'No se sabe si alguien miró.')
    expect(state.partialText).toBe('No se sabe si alguien miró.')
    expect(state.emptyText).toBeNull()
  })

  it('sin aviso, el estado del bloque se queda como estaba', () => {
    const original = blockState(spec, 'NONE_FOUND', 0)
    expect(chainBlockState(original, null)).toBe(original)
  })
})

describe('procedencia redactada sin eslabones todavía (RF-510)', () => {
  const spec = sectionSpec('provenance')

  /**
   * La procedencia de medio fondo llegó como un párrafo mucho antes de que nadie
   * la partiera en eslabones fechados. Sin esto, ese párrafo —que es lo que se
   * publica— quedaría escondido detrás de «nadie ha buscado todavía».
   */
  it('el relato se enseña, y la explicación de la cadena vacía pasa por encima', () => {
    const empty = blockState(spec, 'UNREVIEWED', 0)
    const state = narrativeBlockState(empty, true)
    expect(state.emptyText).toBeNull()
    expect(state.partialText).toBe(empty.emptyText)
  })

  it('la cadena sigue constando vacía: un párrafo no es una cadena de eslabones', () => {
    const state = narrativeBlockState(blockState(spec, 'UNREVIEWED', 0), true)
    expect(state.countText).toBe('Ninguno registrado')
    expect(state.count).toBe(0)
  })

  it('sin relato escrito, el bloque vacío se explica como siempre', () => {
    const empty = blockState(spec, 'UNREVIEWED', 0)
    expect(narrativeBlockState(empty, false)).toBe(empty)
  })

  it('con eslabones no hay nada que recolocar', () => {
    const withRows = blockState(spec, 'UNREVIEWED', 2)
    expect(narrativeBlockState(withRows, true)).toBe(withRows)
  })
})
