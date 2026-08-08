import { describe, expect, it } from 'vitest'
import {
  fundActiveNotice,
  fundHiddenNotice,
  fundPrefixText,
  fundRenamedNotice,
  fundStateText,
  hiddenFundsNotice,
  offeredFunds,
  retireFundBlockedReason,
  sortFunds,
  HIDE_ARTWORKS_HINT,
  RETIRE_FUND_HINT,
  type ArtistFundEntry,
} from './artistFunds'

/**
 * ADR-007, segunda entrega: el fondo como tabla maestra.
 *
 * Lo que se fija es la diferencia entre los DOS interruptores, que es donde esta
 * pantalla puede engañar sin que se note: «retirado» deja de ofrecerlo y no toca
 * nada de lo catalogado; «apartado» saca sus obras del listado y no retira nada.
 * Confundirlos es esconder obra sin querer, o creer que se ha escondido y no.
 */

const fund = (over: Partial<ArtistFundEntry> = {}): ArtistFundEntry => ({
  id: 'f1',
  code: 'ROTILI',
  prefix: 'AR',
  name: 'Alberto Rotili',
  active: true,
  hideArtworks: false,
  ...over,
})

describe('el orden y lo que identifica a un fondo', () => {
  it('se ordenan por prefijo, que es como están numeradas las obras', () => {
    const list = [
      fund({ id: '3', prefix: 'TS', name: 'Pruebas' }),
      fund({ id: '1', prefix: 'AR' }),
      fund({ id: '2', prefix: 'RC', name: 'María Ruiz Campins' }),
    ]
    expect(sortFunds(list).map((f) => f.prefix)).toEqual(['AR', 'RC', 'TS'])
  })

  it('el prefijo se explica con la forma de los identificadores', () => {
    // Es lo que se lee en la etiqueta de la obra que se tiene delante, y explica
    // qué fondo es esto mejor que su nombre.
    expect(fundPrefixText('AR')).toBe('Obras AR-0001, AR-0002…')
  })
})

describe('los dos interruptores dicen cosas distintas', () => {
  it('lo normal no lleva cartel', () => {
    // Un aviso sobre lo que está en su sitio es ruido, y hace que no se lean los
    // que sí dicen algo.
    expect(fundStateText(fund())).toBeNull()
  })

  it('retirado dice que sus obras NO se tocan', () => {
    const said = fundStateText(fund({ active: false })) ?? ''
    expect(said).toContain('no se ofrece')
    expect(said).toContain('sus obras siguen en el listado')
  })

  it('apartado dice que el fondo SÍ se sigue ofreciendo', () => {
    const said = fundStateText(fund({ hideArtworks: true })) ?? ''
    expect(said).toContain('no salen en el listado')
    expect(said).toContain('se sigue ofreciendo')
  })

  it('y los dos a la vez se dicen juntos', () => {
    expect(fundStateText(fund({ active: false, hideArtworks: true }))).toBe(
      'Retirado y con sus obras apartadas del listado.',
    )
  })

  it('las dos explicaciones dejan claro qué NO hace cada una', () => {
    // Es la mitad que evita el susto: ninguna de las dos borra ni esconde de verdad.
    expect(RETIRE_FUND_HINT).toContain('no se toca')
    expect(HIDE_ARTWORKS_HINT).toContain('No se borra ni se retira nada')
    expect(HIDE_ARTWORKS_HINT).toContain('se sigue abriendo por su enlace')
  })
})

describe('no quedarse sin fondos', () => {
  it('el último activo no se puede retirar, y se dice antes de pulsar', () => {
    // La base lo rechaza, pero quien cataloga está de pie: un viaje de ida y
    // vuelta para que le digan que no es peor que un botón que se explica.
    const only = fund({ id: '1' })
    const retired = fund({ id: '2', active: false })
    const said = retireFundBlockedReason(only, [only, retired]) ?? ''
    expect(said).toContain('último fondo activo')
    expect(said).toContain('activa antes otro')
  })

  it('con otro activo no hay nada que impedir', () => {
    const a = fund({ id: '1' })
    const b = fund({ id: '2', code: 'TEST' })
    expect(retireFundBlockedReason(a, [a, b])).toBeNull()
  })

  it('sobre uno ya retirado no dice nada: volver a activarlo es libre', () => {
    const retired = fund({ id: '1', active: false })
    expect(retireFundBlockedReason(retired, [retired])).toBeNull()
  })
})

describe('lo que se ofrece para elegir', () => {
  it('solo los activos', () => {
    const a = fund({ id: '1' })
    const b = fund({ id: '2', code: 'TEST', active: false })
    expect(offeredFunds([a, b]).map((f) => f.id)).toEqual(['1'])
  })

  it('más el que la ficha ya tenga, aunque esté retirado', () => {
    // Sin esto, abrir una obra del fondo retirado dejaría el selector sin su valor
    // y guardar la cambiaría de fondo sin que nadie lo pidiera.
    const a = fund({ id: '1' })
    const b = fund({ id: '2', code: 'TEST', active: false })
    expect(offeredFunds([a, b], 'TEST').map((f) => f.id)).toEqual(['1', '2'])
  })
})

describe('el listado dice lo que está apartando', () => {
  it('nombra el fondo y dice cómo verlas', () => {
    // Nunca un hueco en silencio: un listado que se calla que esconde cuarenta
    // obras es un listado en el que no se puede confiar para contar.
    expect(hiddenFundsNotice([fund({ name: 'Pruebas' })])).toBe(
      'No se muestran las obras de Pruebas. Filtra por ese fondo para verlas.',
    )
  })

  it('y los nombra todos cuando son varios', () => {
    const said = hiddenFundsNotice([fund({ name: 'Pruebas' }), fund({ name: 'Ensayos' })]) ?? ''
    expect(said).toContain('Pruebas, Ensayos')
    expect(said).toContain('Filtra por uno')
  })

  it('sin nada apartado no dice nada', () => {
    expect(hiddenFundsNotice([])).toBeNull()
  })
})

describe('lo que se dice tras cada cambio', () => {
  it('renombrar avisa de que lo ven todas sus obras', () => {
    expect(fundRenamedNotice('Alberto Rotili')).toContain('Lo ven todas sus obras')
  })

  it('retirar aclara que no se ha tocado nada catalogado', () => {
    expect(fundActiveNotice('Pruebas', false)).toContain('Sus obras no se han tocado')
    expect(fundActiveNotice('Pruebas', true)).toContain('vuelve a ofrecerse')
  })

  it('apartar aclara que se siguen abriendo', () => {
    expect(fundHiddenNotice('Pruebas', true)).toContain('Se siguen abriendo por su enlace')
    expect(fundHiddenNotice('Pruebas', false)).toContain('vuelven al listado')
  })
})
