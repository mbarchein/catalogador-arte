import { describe, expect, it } from 'vitest'
import {
  fundActiveNotice,
  fundHiddenNotice,
  fundListedHint,
  fundOfferedHint,
  fundPrefixText,
  HIDDEN_FUND_BADGE,
  fundRenamedNotice,
  fundFilterOptions,
  offeredFunds,
  retireFundBlockedReason,
  sortFunds,
  type ArtistFundEntry,
} from './artistFunds'

/**
 * ADR-007, second delivery: the fund as a master table.
 *
 * What is pinned down is the difference between the TWO switches, which is where this
 * screen can mislead unnoticed: «retirado» stops offering it and touches
 * nothing of what is catalogued; «apartado» takes its artworks out of the listing and withdraws nothing.
 * Confusing them means hiding work by accident, or believing it has been hidden when it has not.
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
    // It is what is read on the label of the artwork in front of you, and it explains
    // which fund this is better than its name.
    expect(fundPrefixText('AR')).toBe('Obras AR-0001, AR-0002…')
  })
})

describe('el subtexto cuenta el estado en el que se está', () => {
  // What made the screen illegible was a fixed subtext describing both
  // states at once: one had to work out which applied by looking at the control. Each
  // switch now says what happens NOW, and only that.

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
    // It is the confusion this screen can cause: withdrawing does not hide work,
    // and setting aside does not withdraw the fund. If the two sentences looked alike, it would not matter
    // that the switches were two.
    expect(fundOfferedHint(false)).not.toBe(fundListedHint(false))
    expect(fundOfferedHint(false)).toContain('siguen en el listado')
    expect(fundListedHint(false)).toContain('no aparecen en el listado')
  })
})

describe('no quedarse sin fondos', () => {
  it('el último activo no se puede retirar, y se dice antes de pulsar', () => {
    // The base rejects it, but whoever catalogues is on their feet: a round trip
    // just to be told no is worse than a button that explains itself.
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
    // Without this, opening an artwork of the withdrawn fund would leave the selector without its value
    // and saving would change its fund without anybody asking.
    const a = fund({ id: '1' })
    const b = fund({ id: '2', code: 'TEST', active: false })
    expect(offeredFunds([a, b], 'TEST').map((f) => f.id)).toEqual(['1', '2'])
  })
})

describe('el filtro señala el fondo apartado', () => {
  // Never a gap in silence, but said where something can be done about it:
  // in the fund's row inside the filter panel, which is exactly the place
  // where ticking it makes its artworks appear. It used to be a warning above the
  // listing, far from the control that fixes it.

  it('el apartado lleva distintivo, y dice qué implica', () => {
    const rows = fundFilterOptions([
      fund({ id: '1', prefix: 'AR', name: 'Alberto Rotili' }),
      fund({ id: '2', prefix: 'TS', name: 'Pruebas', hideArtworks: true }),
    ])
    expect(rows[1]).toMatchObject({ text: 'Pruebas', badge: HIDDEN_FUND_BADGE })
    expect(rows[1]!.hint).toContain('no salen si no lo marcas')
  })

  it('y el que no lo está no lleva nada: un distintivo en todas no distingue', () => {
    const rows = fundFilterOptions([fund({ name: 'Alberto Rotili' })])
    expect(rows[0]!.badge).toBeUndefined()
    expect(rows[0]!.hint).toBeUndefined()
  })

  it('las filas van en el mismo orden que la pantalla de fondos', () => {
    const rows = fundFilterOptions([
      fund({ id: '2', prefix: 'TS', name: 'Pruebas' }),
      fund({ id: '1', prefix: 'AR', name: 'Alberto Rotili' }),
    ])
    expect(rows.map((r) => r.text)).toEqual(['Alberto Rotili', 'Pruebas'])
  })

  it('el nombre que se enseña es el de la tabla, no el escrito por dentro', () => {
    // It is what makes renaming a fund show up here too.
    expect(fundFilterOptions([fund({ name: 'Nombre corregido' })])[0]!.text).toBe(
      'Nombre corregido',
    )
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
