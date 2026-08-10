import { describe, expect, it } from 'vitest'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  catalogueChoiceBlockedReason,
  catalogueReferenceLine,
  catalogueReferenceNotice,
  noCatalogueOptionsText,
  offersCatalogueChoice,
  planCatalogueReference,
} from './catalogueReference'

/**
 * El catálogo de una exposición como referencia de la bibliografía (RF-503, RF-506).
 *
 * `exhibitions.catalogue_reference_id` existía desde la primera migración de exposiciones
 * y **ninguna pantalla podía fijarlo**, así que la columna estaba siempre a nulo y el plan
 * de pruebas tenía RF-503 como parcial. Estos tests fijan las dos cosas que decide esta
 * operación y que no se ven mirando un formulario:
 *
 *   · que la negativa de la base —el vínculo exige que conste catálogo— se diga ANTES, y
 *     que «sin revisar» y «No» se digan distinto, porque llevan a hacer cosas distintas;
 *   · que quitar el vínculo se admita SIEMPRE, incluso sobre una ficha incoherente, o la
 *     pantalla se quedaría sin forma de arreglarla.
 */

function reference(over: Partial<ReferenceRow> = {}): ReferenceRow {
  return {
    id: 'ref-1',
    bibtex_key: null,
    authors: 'Rotili, Alberto',
    editors: '',
    title: 'Catálogo de la muestra de Zafra',
    container_title: '',
    publication_type_id: null,
    year: 1985,
    publisher: 'Diputación',
    place: 'Badajoz',
    note: '',
    active: true,
    publication_type: null,
    ...over,
  } as ReferenceRow
}

describe('catalogueChoiceBlockedReason, el espejo de la restricción (RF-503)', () => {
  it('con catálogo constando, no bloquea', () => {
    expect(catalogueChoiceBlockedReason('YES')).toBeNull()
  })

  it('«sin revisar» manda a investigarlo, no a corregir nada', () => {
    const text = catalogueChoiceBlockedReason('UNREVIEWED')
    expect(text).not.toBeNull()
    expect(text).toContain('«sin revisar» no es «no»')
  })

  it('«No» manda a corregir el «No», porque enlazar sería contradecir la ficha', () => {
    // The two refusals lead to doing different things, and there lies the sentence's value.
    const text = catalogueChoiceBlockedReason('NO')
    expect(text).not.toBeNull()
    expect(text).toContain('contradecir')
    expect(text).not.toBe(catalogueChoiceBlockedReason('UNREVIEWED'))
  })
})

describe('offersCatalogueChoice', () => {
  it('NO se ofrece elegir catálogo sobre una muestra que consta sin él', () => {
    // Con «No publicó catálogo.» en la línea de arriba, un enlace que dice «Decir cuál es
    // su catálogo» se contradice con ella: ofrece algo que la base va a rechazar y que,
    // de aceptarse, dejaría la ficha diciendo dos cosas opuestas. Dicho por la
    // catalogadora tal cual: «confunde».
    expect(offersCatalogueChoice('NO')).toBe(false)
  })

  it('sí se ofrece mientras nadie lo haya mirado', () => {
    // «Sin revisar» no es «no»: la respuesta puede acabar siendo que sí, y el panel
    // explica qué hay que responder antes. Quitar también el enlace aquí dejaría la
    // pantalla sin decir qué falta.
    expect(offersCatalogueChoice('UNREVIEWED')).toBe(true)
  })

  it('y por supuesto cuando sí publicó', () => {
    expect(offersCatalogueChoice('YES')).toBe(true)
  })

  it('se ofrece exactamente cuando la elección no está bloqueada por contradicción', () => {
    // El par que hay que mantener a la vez: lo que se ofrece y lo que el panel deja
    // hacer. Ofrecer algo bloqueado es lo que se acaba de quitar; bloquear algo que se
    // ofrece sin decir por qué sería el error simétrico.
    expect(offersCatalogueChoice('NO')).toBe(false)
    expect(catalogueChoiceBlockedReason('NO')).not.toBeNull()
  })
})

describe('catalogueReferenceLine, las cuatro respuestas (RF-304)', () => {
  it('no consta si hubo catálogo', () => {
    expect(catalogueReferenceLine({ cataloguePublished: 'UNREVIEWED', reference: null })).toBe(
      'No consta si publicó catálogo.',
    )
  })

  it('no hubo', () => {
    expect(catalogueReferenceLine({ cataloguePublished: 'NO', reference: null })).toBe(
      'No publicó catálogo.',
    )
  })

  it('hubo, y consta cuál es', () => {
    expect(catalogueReferenceLine({ cataloguePublished: 'YES', reference: reference() })).toBe(
      'Publicó catálogo: Catálogo de la muestra de Zafra.',
    )
  })

  it('hubo, y todavía no consta cuál: es lo que hay que hacer, no un error', () => {
    const text = catalogueReferenceLine({ cataloguePublished: 'YES', reference: null })
    expect(text).toContain('todavía no consta cuál')
  })

  it('y la referencia que no se puede leer se dice, en vez de parecer que no hay ninguna', () => {
    const text = catalogueReferenceLine({
      cataloguePublished: 'YES',
      reference: null,
      unreadable: true,
    })
    expect(text).toContain('no se puede leer')
    expect(text).toContain('retirada')
  })

  it('una referencia sin título no deja la frase colgando', () => {
    expect(
      catalogueReferenceLine({ cataloguePublished: 'YES', reference: reference({ title: '  ' }) }),
    ).toBe('Publicó catálogo: Referencia sin título.')
  })
})

describe('planCatalogueReference, qué hacer con la elección (RF-1501)', () => {
  it('elegir la que ya estaba no escribe nada', () => {
    expect(
      planCatalogueReference({ cataloguePublished: 'YES', current: 'ref-1', chosen: 'ref-1' }),
    ).toEqual({ action: 'unchanged' })
  })

  it('quitar el vínculo de una exposición que no lo tenía tampoco', () => {
    expect(
      planCatalogueReference({ cataloguePublished: 'YES', current: null, chosen: null }),
    ).toEqual({ action: 'unchanged' })
  })

  it('elegir una referencia la manda', () => {
    expect(
      planCatalogueReference({ cataloguePublished: 'YES', current: null, chosen: 'ref-9' }),
    ).toEqual({ action: 'set', referenceId: 'ref-9' })
  })

  it('cambiar de referencia también', () => {
    expect(
      planCatalogueReference({ cataloguePublished: 'YES', current: 'ref-1', chosen: 'ref-9' }),
    ).toEqual({ action: 'set', referenceId: 'ref-9' })
  })

  it('sin que conste catálogo, elegir queda bloqueado y se dice por qué', () => {
    const plan = planCatalogueReference({
      cataloguePublished: 'UNREVIEWED',
      current: null,
      chosen: 'ref-9',
    })
    expect(plan.action).toBe('blocked')
    if (plan.action !== 'blocked') return
    expect(plan.message).toContain('«sin revisar» no es «no»')
  })

  it('pero QUITARLO se admite igual sobre una ficha incoherente', () => {
    // A row with a link and `catalogue_published` on «No» can only have arrived through
    // SQL, and refusing the withdrawal would leave the screen with no way to fix it.
    expect(
      planCatalogueReference({ cataloguePublished: 'NO', current: 'ref-1', chosen: null }),
    ).toEqual({ action: 'clear' })
    expect(
      planCatalogueReference({ cataloguePublished: 'UNREVIEWED', current: 'ref-1', chosen: null }),
    ).toEqual({ action: 'clear' })
  })
})

describe('catalogueReferenceNotice, lo que se dice al terminar', () => {
  it('al enlazar, nombra la referencia', () => {
    expect(
      catalogueReferenceNotice({ action: 'set', referenceId: 'ref-1' }, 'Catálogo de Zafra'),
    ).toBe('«Catálogo de Zafra» queda como el catálogo de esta exposición.')
  })

  it('y un título vacío no deja unas comillas vacías', () => {
    expect(catalogueReferenceNotice({ action: 'set', referenceId: 'ref-1' }, '  ')).toBe(
      'La referencia queda como el catálogo de esta exposición.',
    )
  })

  it('al quitarlo, dice lo que NO pasa: la referencia sigue en la bibliografía', () => {
    expect(catalogueReferenceNotice({ action: 'clear' }, 'Catálogo de Zafra')).toContain(
      'sigue en la bibliografía',
    )
  })
})

describe('noCatalogueOptionsText, nunca una lista vacía (RF-304)', () => {
  it('la bibliografía vacía dice de dónde sale una referencia', () => {
    const text = noCatalogueOptionsText(0, 'zafra')
    expect(text).toContain('Todavía no hay ninguna referencia')
    expect(text).toContain('citándolo desde una obra')
  })

  it('sin nada teclado, invita a escribir', () => {
    expect(noCatalogueOptionsText(12, '')).toContain('Escribe para buscar')
  })

  it('y sin coincidencias dice cómo dar de alta el catálogo que se tiene en la mano', () => {
    // Without this the catalogue's title gets typed, nothing turns up and the conclusion is
    // that the finder is broken.
    const text = noCatalogueOptionsText(12, 'zafra')
    expect(text).toContain('Ninguna referencia coincide')
    expect(text).toContain('cítalo antes desde una obra')
  })
})
