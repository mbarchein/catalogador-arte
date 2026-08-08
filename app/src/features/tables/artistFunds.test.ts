import { describe, expect, it } from 'vitest'
import {
  fundActiveNotice,
  fundHiddenNotice,
  fundListedHint,
  fundOfferedHint,
  fundPrefixText,
  fundRenamedNotice,
  hiddenFundsNotice,
  offeredFunds,
  retireFundBlockedReason,
  sortFunds,
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

describe('el subtexto cuenta el estado en el que se está', () => {
  // Lo que hacía ilegible la pantalla era un subtexto fijo que describía los dos
  // estados a la vez: había que averiguar cuál aplicaba mirando el control. Cada
  // interruptor dice ahora lo que pasa AHORA, y solo eso.

  it('encendido dice lo que ocurre, sin hablar de lo que no ocurre', () => {
    expect(fundOfferedHint(true)).toBe('Aparece entre los fondos al dar de alta una obra.')
    expect(fundListedHint(true)).toContain('Sus obras aparecen en el listado')
    expect(fundOfferedHint(true)).not.toContain('No ')
    expect(fundListedHint(true)).not.toContain('No se')
  })

  it('apagado carga además con la mitad que evita el susto: qué NO se ha hecho', () => {
    expect(fundOfferedHint(false)).toContain('Sus obras no se han tocado')
    expect(fundListedHint(false)).toContain('No se ha borrado ni retirado nada')
    expect(fundListedHint(false)).toContain('se sigue abriendo por su enlace')
  })

  it('y los dos apagados siguen diciendo cosas distintas', () => {
    // Es la confusión que esta pantalla puede provocar: retirar no esconde obra,
    // y apartar no retira el fondo. Si las dos frases se parecieran, daría igual
    // que los interruptores fueran dos.
    expect(fundOfferedHint(false)).not.toBe(fundListedHint(false))
    expect(fundOfferedHint(false)).toContain('siguen en el listado')
    expect(fundListedHint(false)).toContain('no aparecen en el listado')
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
