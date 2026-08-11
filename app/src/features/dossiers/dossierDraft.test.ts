import { describe, expect, it } from 'vitest'
import { planDossierCreate, planPrice, planText, priceInputValue } from './dossierDraft'

/**
 * RF-1601, RF-1604, RF-1614: lo que se teclea antes de guardar.
 *
 * El precio es el que tiene tests de verdad, y por un motivo concreto: en español
 * el punto separa los millares y la coma los decimales, que es justo lo contrario
 * de lo que cree `Number()`. Leerlo al revés convierte cuatro mil quinientos euros
 * en cuatro con cinco, y el número resultante es perfectamente válido, así que no
 * hay nada aguas abajo que pueda detectarlo.
 */

describe('crear un dossier (RF-1601)', () => {
  it('el título es lo único que se exige', () => {
    const plan = planDossierCreate({ title: '  Galería Serrano ', purpose: '', recipientPartyId: null })
    expect(plan).toEqual({
      action: 'insert',
      payload: { title: 'Galería Serrano', purpose: '', recipient_party_id: null },
    })
  })

  it('sin título se explica para qué sirve el título, no que «falta un campo»', () => {
    const plan = planDossierCreate({ title: '   ', purpose: 'x', recipientPartyId: null })
    expect(plan.action).toBe('blank')
    if (plan.action === 'blank') expect(plan.message).toContain('encontrar el dossier')
  })

  it('el destinatario viaja tal cual, y nulo es «sin destinatario»', () => {
    const plan = planDossierCreate({ title: 'X', purpose: ' galería ', recipientPartyId: 'p1' })
    expect(plan).toEqual({
      action: 'insert',
      payload: { title: 'X', purpose: 'galería', recipient_party_id: 'p1' },
    })
  })
})

describe('un texto libre (RF-1614)', () => {
  it('con rótulo solo, con párrafo solo, o con los dos', () => {
    expect(planText('Óleos', '')).toEqual({ action: 'add', heading: 'Óleos', body: '' })
    expect(planText('', 'Tres sin enmarcar.')).toEqual({
      action: 'add',
      heading: '',
      body: 'Tres sin enmarcar.',
    })
    expect(planText(' Óleos ', ' Tres. ')).toEqual({
      action: 'add',
      heading: 'Óleos',
      body: 'Tres.',
    })
  })

  it('sin ninguna de las dos cosas no se añade un hueco', () => {
    const plan = planText('  ', '\n ')
    expect(plan.action).toBe('blank')
    if (plan.action === 'blank') expect(plan.message).toContain('al menos')
  })
})

describe('el precio, tal como se teclea en español (RF-1604)', () => {
  it('el punto es el millar y la coma el decimal', () => {
    expect(planPrice('4.500')).toEqual({ price: 4500 })
    expect(planPrice('4500,50')).toEqual({ price: 4500.5 })
    expect(planPrice('1.234.567,89')).toEqual({ price: 1234567.89 })
  })

  it('el símbolo y los espacios sobran y no molestan', () => {
    expect(planPrice(' 4.500 € ')).toEqual({ price: 4500 })
    expect(planPrice('4500€')).toEqual({ price: 4500 })
  })

  it('vacío es «sin precio», que es un dato y no un cero', () => {
    expect(planPrice('')).toEqual({ price: null })
    expect(planPrice('   ')).toEqual({ price: null })
  })

  it('cero se rechaza con una frase, no con el nombre de una restricción', () => {
    const plan = planPrice('0')
    expect('message' in plan).toBe(true)
    if ('message' in plan) expect(plan.message).toContain('Cero no es un precio')
  })

  it('lo que no es una cantidad se rechaza en vez de convertirse en un número raro', () => {
    for (const typed of ['cuatro mil', '4.5.6', '-100', '4,555', '1e5', '4..500']) {
      expect('message' in planPrice(typed)).toBe(true)
    }
  })

  it('un precio absurdamente grande se avisa antes de que lo redondee la base', () => {
    const plan = planPrice('999.999.999')
    expect('message' in plan).toBe(true)
    if ('message' in plan) expect(plan.message).toContain('demasiado grande')
  })

  it('lo que se guarda vuelve al campo tal como se teclea', () => {
    // El viaje de vuelta importa: un campo que se abre con «4.500 €» dentro pide
    // que se corrija antes de poder editarlo.
    for (const value of [4500, 45000, 4500.5, 1234567.89]) {
      expect(planPrice(priceInputValue(value))).toEqual({ price: value })
    }
    expect(priceInputValue(null)).toBe('')
    expect(priceInputValue(4500)).not.toContain('€')
  })
})
