import { describe, expect, it } from 'vitest'
import {
  artworkChoices,
  chosenArtwork,
  directionOptions,
  planRelation,
  relationEnds,
  type RelateDraft,
} from './relateForm'
import { relatedRows } from './relatedArtworks'
import type { ArtworkRef, RelationshipRow } from '../documentaryRows'
import type { ArtworkRelationshipType } from '../../../lib/types'

/**
 * RF-217: registering a relationship is choosing an artwork, a type and —what really
 * decides— A DIRECTION.
 *
 * «AR-0012 es estudio previo de AR-0013» and «AR-0013 es estudio previo de
 * AR-0012» are two equally valid rows for the base and they say opposite things
 * about the artist's work. There is nothing downstream that detects the
 * mistake, so the question is asked with both sentences written out and the
 * translation of the answer into the two columns is verified here.
 *
 * The refusals this module anticipates are the same ones the base imposes with
 * its own messages in Spanish. They are brought forward so they are read BEFORE pressing,
 * not instead of the check: the copy here works over the relationships
 * this record loaded, and another person can write one in the meantime.
 */

const STUDY: ArtworkRelationshipType = {
  id: 'type-study',
  name: 'Estudio previo de',
  inverse_name: 'Obra final de',
  is_symmetric: false,
  active: true,
}

const PAIR: ArtworkRelationshipType = {
  id: 'type-pair',
  name: 'Pareja de',
  inverse_name: '',
  is_symmetric: true,
  active: true,
}

function draft(over: Partial<RelateDraft> = {}): RelateDraft {
  return {
    catalogId: 'AR-0012',
    otherCatalogId: 'AR-0013',
    type: STUDY,
    direction: 'THIS_TO_OTHER',
    note: '',
    ...over,
  }
}

function stored(over: Partial<RelationshipRow> = {}): RelationshipRow {
  return {
    id: 'rel-1',
    from_catalog_id: 'AR-0012',
    to_catalog_id: 'AR-0013',
    relationship_type_id: STUDY.id,
    note: '',
    active: true,
    relationship_type: STUDY,
    from_artwork: null,
    to_artwork: null,
    ...over,
  }
}

function artwork(over: Partial<ArtworkRef> = {}): ArtworkRef {
  return {
    catalog_id: 'AR-0013',
    title: 'Retrato de mujer',
    artist: 'ROTILI',
    execution_date: '1978',
    active: true,
    ...over,
  }
}

// ── The direction ────────────────────────────────────────────

describe('RF-217: qué sentido tiene la relación', () => {
  it('un tipo asimétrico ofrece las DOS lecturas, con los dos códigos escritos', () => {
    const options = directionOptions(STUDY, 'AR-0012', 'AR-0013')
    expect(options.map((option) => option.text)).toEqual([
      'AR-0012 es estudio previo de AR-0013',
      'AR-0013 es estudio previo de AR-0012',
    ])
  })

  it('cada lectura dice qué acabará mostrando cada ficha, que es lo que se elige', () => {
    const [direct, inverse] = directionOptions(STUDY, 'AR-0012', 'AR-0013')
    expect(direct?.hint).toContain('La ficha de AR-0013 mostrará «Obra final de AR-0012»')
    expect(inverse?.hint).toContain('Esta ficha mostrará «Obra final de AR-0013»')
  })

  it('un tipo simétrico ofrece UNA sola, y explica por qué no hay nada que elegir', () => {
    const options = directionOptions(PAIR, 'AR-0012', 'AR-0013')
    expect(options).toHaveLength(1)
    expect(options[0]?.text).toBe('AR-0012 es pareja de AR-0013')
    expect(options[0]?.hint).toContain('una sola vez')
  })

  it('sin obra elegida todavía, la frase se lee igual y no enseña un hueco', () => {
    expect(directionOptions(STUDY, 'AR-0012', '')[0]?.text).toBe(
      'AR-0012 es estudio previo de la otra obra',
    )
  })

  it('la lectura elegida decide las dos columnas de la fila', () => {
    expect(relationEnds('AR-0012', 'AR-0013', 'THIS_TO_OTHER', STUDY)).toEqual({
      from: 'AR-0012',
      to: 'AR-0013',
    })
    expect(relationEnds('AR-0012', 'AR-0013', 'OTHER_TO_THIS', STUDY)).toEqual({
      from: 'AR-0013',
      to: 'AR-0012',
    })
  })

  it('en un tipo simétrico el sentido no cambia nada: la base canonicaliza la fila', () => {
    expect(relationEnds('AR-0012', 'AR-0003', 'OTHER_TO_THIS', PAIR)).toEqual({
      from: 'AR-0012',
      to: 'AR-0003',
    })
  })
})

// ── What gets passed to `relate_artworks` ────────────────────

describe('la llamada que registra la relación (RF-517)', () => {
  it('lleva los dos extremos, el tipo y la nota, con los nombres de la función', () => {
    const plan = planRelation(draft({ note: '  se separaron en 1998  ' }))
    expect(plan).toEqual({
      ok: true,
      args: {
        p_from_catalog_id: 'AR-0012',
        p_to_catalog_id: 'AR-0013',
        p_relationship_type_id: 'type-study',
        p_note: 'se separaron en 1998',
      },
    })
  })

  it('invertida, los extremos van al revés y nada más cambia', () => {
    const plan = planRelation(draft({ direction: 'OTHER_TO_THIS' }))
    expect(plan.ok && plan.args.p_from_catalog_id).toBe('AR-0013')
    expect(plan.ok && plan.args.p_to_catalog_id).toBe('AR-0012')
  })

  it('una relación retirada NO se bloquea: volver a añadirla es lo que la restaura', () => {
    // The record's query only brings the active ones, so a relationship in the
    // wastebasket is not in `existing`. Blocking it here would turn a gesture that
    // works —`relate_artworks` restores it— into a dead end.
    const plan = planRelation(draft(), [])
    expect(plan.ok).toBe(true)
  })
})

// ── The refusals, said before pressing ───────────────────────

describe('lo que no se puede registrar, y por qué', () => {
  it('sin obra elegida se pide la obra, no se manda una fila a medias', () => {
    const plan = planRelation(draft({ otherCatalogId: '' }))
    expect(plan).toEqual({ ok: false, problem: 'Elige la obra con la que se relaciona.' })
  })

  it('sin tipo elegido se pide el tipo', () => {
    const plan = planRelation(draft({ type: null }))
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.problem).toContain('Elige el tipo')
  })

  it('una obra no se relaciona consigo misma, y se dice con una frase', () => {
    const plan = planRelation(draft({ otherCatalogId: 'AR-0012' }))
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.problem).toContain('no puede relacionarse consigo misma')
  })

  it('la relación que ya consta no se registra dos veces', () => {
    const plan = planRelation(draft(), [stored()])
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.problem).toContain('Ya consta que AR-0012 es estudio previo de AR-0013')
  })

  /**
   * It is THE case of this block. If it is already recorded that A is a preparatory study of B, B
   * being a preparatory study of A is not one more datum: it is a documentary contradiction, and
   * one of those that are not visible when written because each one is created from
   * its own artwork's record. The base rejects it; here it is read before pressing.
   */
  it('la contraria de una asimétrica se rechaza, y se recuerda que la otra ficha ya lo dice', () => {
    const plan = planRelation(draft({ direction: 'OTHER_TO_THIS' }), [stored()])
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.problem).toContain(
      'Ya consta que AR-0012 es estudio previo de AR-0013, y lo contrario no puede ser cierto a la vez',
    )
    expect(!plan.ok && plan.problem).toContain('«Obra final de AR-0012»')
  })

  it('una simétrica ya registrada se reconoce en cualquiera de los dos órdenes', () => {
    const canonical = stored({
      relationship_type_id: PAIR.id,
      relationship_type: PAIR,
      from_catalog_id: 'AR-0003',
      to_catalog_id: 'AR-0012',
    })
    // The stored row names AR-0003 first because the base canonicalises; the
    // cataloguer is writing it from AR-0012 and in the other order.
    const plan = planRelation(
      draft({ catalogId: 'AR-0012', otherCatalogId: 'AR-0003', type: PAIR }),
      [canonical],
    )
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.problem).toContain('Ya consta')
  })

  it('dos tipos distintos entre las mismas dos obras SÍ conviven', () => {
    // The front and the back of a panel can also be part of the same
    // polyptych: the base's uniqueness covers the triple, not the pair.
    const plan = planRelation(draft({ type: PAIR, otherCatalogId: 'AR-0013' }), [stored()])
    expect(plan.ok).toBe(true)
  })

  it('una relación con OTRA obra no bloquea nada', () => {
    const plan = planRelation(draft({ otherCatalogId: 'AR-0099' }), [stored()])
    expect(plan.ok).toBe(true)
  })
})

// ── Choosing the other artwork ───────────────────────────────

describe('el buscador de la otra obra', () => {
  const catalog: ArtworkRef[] = [
    artwork({ catalog_id: 'AR-0012', title: 'Apunte de cabeza' }),
    artwork({ catalog_id: 'AR-0013', title: 'Retrato de mujer' }),
    artwork({ catalog_id: 'AR-0042', title: 'Bodegón con jarra' }),
    artwork({ catalog_id: 'AR-0099', title: 'Sin catalogar', active: false }),
  ]

  it('nunca ofrece la obra que se está viendo: no se relaciona consigo misma', () => {
    const codes = artworkChoices(catalog, '', 'AR-0012').map((choice) => choice.catalogId)
    expect(codes).not.toContain('AR-0012')
  })

  it('nunca ofrece una obra dada de baja', () => {
    const codes = artworkChoices(catalog, '', 'AR-0012').map((choice) => choice.catalogId)
    expect(codes).not.toContain('AR-0099')
  })

  it('busca por código y por título, sin tildes ni mayúsculas', () => {
    expect(artworkChoices(catalog, '0042', 'AR-0012')[0]?.catalogId).toBe('AR-0042')
    expect(artworkChoices(catalog, 'bodegon', 'AR-0012')[0]?.catalogId).toBe('AR-0042')
    expect(artworkChoices(catalog, 'RETRATO', 'AR-0012')[0]?.catalogId).toBe('AR-0013')
  })

  it('sin nada escrito ofrece igualmente las primeras: una lista vacía se lee como «no hay obras»', () => {
    expect(artworkChoices(catalog, '', 'AR-0012').length).toBeGreaterThan(0)
  })

  it('cada opción se lee entera: código, título y autor con fecha (RF-304)', () => {
    const [choice] = artworkChoices(catalog, 'retrato', 'AR-0012')
    expect(choice?.title).toBe('Retrato de mujer')
    expect(choice?.byline).toBe('Alberto Rotili · 1978')
  })

  it('una obra ya relacionada se marca pero NO se esconde: cabe otro tipo de relación', () => {
    const related = relatedRows(
      [
        {
          ...stored(),
          from_artwork: artwork({ catalog_id: 'AR-0012' }),
          to_artwork: artwork({ catalog_id: 'AR-0013' }),
        },
      ],
      'AR-0012',
    )
    const [choice] = artworkChoices(catalog, 'AR-0013', 'AR-0012', related)
    expect(choice?.catalogId).toBe('AR-0013')
    expect(choice?.existing).toEqual(['Estudio previo de'])
  })

  it('la obra elegida se resuelve para la línea que sustituye al buscador', () => {
    expect(chosenArtwork(catalog, 'AR-0042')?.title).toBe('Bodegón con jarra')
    expect(chosenArtwork(catalog, 'AR-1234')).toBeNull()
  })
})
