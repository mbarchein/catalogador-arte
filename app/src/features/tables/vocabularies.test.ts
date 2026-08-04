import { describe, expect, it } from 'vitest'
import type { MasterEntry } from '../../lib/masterTables'
import { planAddition } from '../../lib/masterTables'
import { placeKey } from '../../lib/places'
import {
  isNetworkFailure,
  planVocabularyAddition,
  planVocabularyRename,
  vocabularyKey,
  VOCABULARY_MISSING_ROW,
} from './vocabularies'

/**
 * The pure half that the flat vocabularies of the «Tablas» section share
 * (RF-514, RF-515, RF-901, RF-1106, ADR-007).
 *
 * The publication types and the archive document types keep their own names for
 * these two decisions and their own sentences for the refusals; what is tested
 * here is the decision itself, once.
 */

function entry(name: string, active = true): MasterEntry {
  return { id: `v-${name}`, name, active }
}

const VOCABULARY = [
  entry('Libro'),
  entry('Catálogo de exposición'),
  entry('Cañón'),
  entry('Folleto', false),
]

describe('vocabularyKey (RF-1106: la clave con la que compara la pantalla ES el índice)', () => {
  it('ignores capitals and accents, which is what makes «catalogo» a duplicate', () => {
    expect(vocabularyKey('CATÁLOGO de Exposición')).toBe(vocabularyKey('catalogo de exposicion'))
  })

  it('leaves the ñ standing, because public.place_key leaves it standing', () => {
    // The whole reason this module exists. If the key flattened the ñ, the screen
    // would answer «ya está» to a name the database would have accepted.
    expect(vocabularyKey('Cañón')).not.toBe(vocabularyKey('Canon'))
    expect(vocabularyKey('Cañón')).toBe('cañon')
  })

  it('is the same function the places already mirror, not a second copy of it', () => {
    for (const name of ['Cañón', 'Reseña', 'Ávila', 'ÇEDILLA', '  Libro  ']) {
      expect(vocabularyKey(name)).toBe(placeKey(name))
    }
  })
})

describe('planVocabularyAddition (RF-514, RF-515: qué significa escribir un nombre)', () => {
  it('a new name is an insert, trimmed', () => {
    // Trimmed here because the `name_not_blank` checks demand that the name equal
    // its own trim: « Invitación » would otherwise come back as a 23514 naming a
    // constraint in English.
    expect(planVocabularyAddition(VOCABULARY, '  Invitación ')).toEqual({
      action: 'insert',
      name: 'Invitación',
    })
  })

  it('blank text is not an addition', () => {
    expect(planVocabularyAddition(VOCABULARY, '   ')).toEqual({ action: 'blank' })
    expect(planVocabularyAddition(VOCABULARY, '')).toEqual({ action: 'blank' })
  })

  it('an equivalent active name is reused instead of being refused by the index', () => {
    expect(planVocabularyAddition(VOCABULARY, 'catalogo de exposicion')).toEqual({
      action: 'reuse',
      entry: entry('Catálogo de exposición'),
    })
  })

  it('RF-901: the name of a retired entry brings it back instead of failing', () => {
    expect(planVocabularyAddition(VOCABULARY, 'FOLLETO')).toEqual({
      action: 'restore',
      entry: entry('Folleto', false),
    })
  })

  it('«Canon» over «Cañón» is a NEW entry, which planAddition would have swallowed', () => {
    // The trap this module was extracted to hold in one place, checked in both
    // directions and against the shared function that gets it wrong: the index is
    // over place_key(name), and place_key keeps the ñ.
    expect(planVocabularyAddition(VOCABULARY, 'Canon')).toEqual({
      action: 'insert',
      name: 'Canon',
    })
    expect(planVocabularyAddition(VOCABULARY, 'cañon')).toEqual({
      action: 'reuse',
      entry: entry('Cañón'),
    })
    // And the reason it is not `planAddition`: that one normalizes for SEARCH,
    // which flattens the ñ, so it answers «ya está» and adds nothing.
    expect(planAddition(VOCABULARY, 'Canon')).toEqual({
      action: 'reuse',
      entry: entry('Cañón'),
    })
  })
})

describe('planVocabularyRename (RF-1106: qué significa guardar el lápiz)', () => {
  it('renames when the name is free', () => {
    expect(planVocabularyRename(VOCABULARY, 'v-Libro', ' Libro antiguo ')).toEqual({
      action: 'rename',
      name: 'Libro antiguo',
    })
  })

  it('a blank name is refused before asking anything', () => {
    expect(planVocabularyRename(VOCABULARY, 'v-Libro', '  ')).toEqual({ action: 'blank' })
  })

  it('saving without typing writes nothing, so no audit row is left behind', () => {
    expect(planVocabularyRename(VOCABULARY, 'v-Libro', 'Libro')).toEqual({ action: 'unchanged' })
    expect(planVocabularyRename(VOCABULARY, 'v-Libro', '  Libro  ')).toEqual({
      action: 'unchanged',
    })
  })

  it('excludes itself, so fixing capitals and accents stays possible', () => {
    // «catalogo de exposicion» → «Catálogo de exposición» does not change the key,
    // and it is exactly the correction these screens exist for.
    const list = [entry('catalogo de exposicion'), entry('Libro')]
    expect(planVocabularyRename(list, 'v-catalogo de exposicion', 'Catálogo de exposición')).toEqual(
      { action: 'rename', name: 'Catálogo de exposición' },
    )
  })

  it('says which entry holds the name, because a retired one is other advice', () => {
    expect(planVocabularyRename(VOCABULARY, 'v-Libro', 'CATALOGO DE EXPOSICION')).toEqual({
      action: 'taken',
      entry: entry('Catálogo de exposición'),
    })
    expect(planVocabularyRename(VOCABULARY, 'v-Libro', 'folleto')).toEqual({
      action: 'taken',
      entry: entry('Folleto', false),
    })
  })
})

describe('VOCABULARY_MISSING_ROW (RF-1106: cero filas y ningún error no es «guardado»)', () => {
  it('says nothing was saved and what to do, without naming a policy', () => {
    expect(VOCABULARY_MISSING_ROW).toContain('No se ha guardado nada')
    expect(VOCABULARY_MISSING_ROW).toContain('vuelve a entrar')
    expect(VOCABULARY_MISSING_ROW).not.toMatch(/row-level|policy|RLS/i)
  })
})

describe('isNetworkFailure (RF-1106: «no se pudo» y «no se envió» son respuestas distintas)', () => {
  it('recognizes what the browser really says when there is no coverage', () => {
    for (const message of [
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      '',
      '   ',
    ]) {
      expect(isNetworkFailure(message)).toBe(true)
    }
  })

  it('does not swallow an answer the database did give', () => {
    for (const message of [
      'duplicate key value violates unique constraint "document_types_name_unique"',
      'canceling statement due to statement timeout',
      'No se puede retirar un tipo de documento que todavía usan documentos del archivo',
    ]) {
      expect(isNetworkFailure(message)).toBe(false)
    }
  })
})
