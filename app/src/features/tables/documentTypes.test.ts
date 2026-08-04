import { describe, expect, it } from 'vitest'
import { sortByName } from '../../lib/masterTables'
import type { DocumentTypeEntry } from '../../lib/types'
import {
  describeDocumentTypeLoadFailure,
  describeDocumentTypeRefusal,
  documentTypeKey,
  planDocumentTypeAddition,
  RETIRE_CONSEQUENCE,
  summarizeDocumentTypes,
} from './documentTypes'

function entry(name: string, active = true): DocumentTypeEntry {
  return { id: `d-${name}`, name, active }
}

/**
 * The ten values the migration seeded (RF-515, v11 table 9), plus one retired: a
 * type nobody used yet is exactly what this screen exists to retire.
 */
const SEEDED = [
  entry('Libro'),
  entry('Publicación'),
  entry('Fotografía'),
  entry('Carta'),
  entry('Recorte de prensa'),
  entry('Manuscrito'),
  entry('Cartel'),
  entry('Díptico'),
  entry('Folleto'),
  entry('Nota de prensa'),
]

describe('documentTypeKey (RF-515: the same key the unique index uses)', () => {
  it('ignores capitals and accents, which is why «cartel» is a duplicate', () => {
    expect(documentTypeKey('Cartel')).toBe(documentTypeKey('cartel'))
    expect(documentTypeKey('Díptico')).toBe(documentTypeKey('DIPTICO'))
    expect(documentTypeKey('  Fotografía  ')).toBe('fotografia')
  })

  it('keeps the ñ standing, because place_key does', () => {
    // The difference that stops this from being `normalizeForSearch`: that one
    // decomposes and drops combining marks, so it would call these two the same
    // name and refuse to add the second while the database would take it.
    expect(documentTypeKey('Cañón')).not.toBe(documentTypeKey('Canon'))
    expect(documentTypeKey('Cañón')).toBe('cañon')
  })
})

describe('planDocumentTypeAddition (RF-515: what typing a name means)', () => {
  it('a new name is an insert, trimmed', () => {
    expect(planDocumentTypeAddition(SEEDED, '  Invitación ')).toEqual({
      action: 'insert',
      name: 'Invitación',
    })
  })

  it('blank text is not an addition', () => {
    expect(planDocumentTypeAddition(SEEDED, '   ')).toEqual({ action: 'blank' })
    expect(planDocumentTypeAddition(SEEDED, '')).toEqual({ action: 'blank' })
  })

  it('a seeded name written differently reuses the seeded one', () => {
    // The screen must not offer to create «recorte de prensa»: the unique index is
    // over place_key(name), so the database would refuse it, and the honest answer
    // is «ése ya está».
    expect(planDocumentTypeAddition(SEEDED, 'recorte de prensa')).toEqual({
      action: 'reuse',
      entry: entry('Recorte de prensa'),
    })
    expect(planDocumentTypeAddition(SEEDED, 'DIPTICO')).toEqual({
      action: 'reuse',
      entry: entry('Díptico'),
    })
  })

  it('RF-901: adding a retired name brings it back instead of failing', () => {
    const withRetired = [...SEEDED, entry('Invitación', false)]
    expect(planDocumentTypeAddition(withRetired, 'invitacion')).toEqual({
      action: 'restore',
      entry: entry('Invitación', false),
    })
  })

  it('a name that only differs by an ñ is a new type, not a duplicate', () => {
    // Mirrors the database: place_key leaves the ñ alone, so both can coexist.
    const withN = [entry('Cañón')]
    expect(planDocumentTypeAddition(withN, 'Canon')).toEqual({
      action: 'insert',
      name: 'Canon',
    })
  })
})

describe('sortByName over the seeded vocabulary (RF-1106: the reading order)', () => {
  it('puts «Díptico» and «Fotografía» where the d and the f are', () => {
    // es-ES collation and not the database default, which may send an accented
    // name past the z. «Publicación» and «Recorte» also sort by their first letter.
    expect(sortByName(SEEDED).map((e) => e.name)).toEqual([
      'Carta',
      'Cartel',
      'Díptico',
      'Folleto',
      'Fotografía',
      'Libro',
      'Manuscrito',
      'Nota de prensa',
      'Publicación',
      'Recorte de prensa',
    ])
  })

  it('keeps a retired type in its alphabetical place', () => {
    const withRetired = sortByName([...SEEDED, entry('Invitación', false)])
    expect(withRetired.map((e) => e.name)[5]).toBe('Invitación')
  })
})

describe('describeDocumentTypeRefusal (RF-515, RF-1106: the base says no in Spanish)', () => {
  it('turns the unique violation into what actually happened', () => {
    // The real payload, provoked against the local base through PostgREST.
    const refusal = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "document_types_name_unique"',
      hint: null,
    }
    const message = describeDocumentTypeRefusal('rename', refusal)
    expect(message).toContain('Ya hay otro tipo de documento con ese nombre')
    expect(message).toContain('mayúsculas')
    // Nothing of the index, the constraint or the English reaches the screen.
    expect(message).not.toMatch(/duplicate|constraint|document_types/)
  })

  it('says something different when adding than when renaming', () => {
    const refusal = { code: '23505', message: 'duplicate key value violates unique constraint' }
    // Renaming can be an attempt to merge two types, and that needs a way out.
    expect(describeDocumentTypeRefusal('rename', refusal)).toContain('unir los dos')
    expect(describeDocumentTypeRefusal('add', refusal)).not.toContain('unir los dos')
  })

  it('explains the blank-name check instead of naming it', () => {
    const refusal = {
      code: '23514',
      message:
        'new row for relation "document_types" violates check constraint "document_types_name_not_blank"',
    }
    expect(describeDocumentTypeRefusal('rename', refusal)).toBe(
      'El nombre no puede quedar vacío, ni empezar ni acabar con un espacio.',
    )
  })

  it('keeps the trigger message AND its hint when a type is still in use', () => {
    // Both fields as the base sends them: the message says no, the hint says what
    // to do first, and dropping the hint would leave the cataloger stuck.
    const refusal = {
      code: 'P0001',
      message: 'No se puede retirar un tipo de documento que todavía usan documentos del archivo',
      hint: 'Cambia antes el tipo de esos documentos.',
    }
    expect(describeDocumentTypeRefusal('retire', refusal)).toBe(
      'No se puede retirar un tipo de documento que todavía usan documentos del archivo. ' +
        'Cambia antes el tipo de esos documentos.',
    )
  })

  it('does not double the full stop of a trigger message that already has one', () => {
    const refusal = { code: 'P0001', message: 'No se puede retirar.', hint: 'Haz lo otro.' }
    expect(describeDocumentTypeRefusal('retire', refusal)).toBe(
      'No se puede retirar. Haz lo otro.',
    )
  })

  it('a trigger message without a hint still ends in a full stop', () => {
    const refusal = { code: 'P0001', message: 'No se puede retirar', hint: null }
    expect(describeDocumentTypeRefusal('retire', refusal)).toBe('No se puede retirar.')
  })

  it('RF-111: a write refused by the policies tells her to sign in again', () => {
    const refusal = {
      code: '42501',
      message: 'new row violates row-level security policy for table "document_types"',
    }
    const message = describeDocumentTypeRefusal('add', refusal)
    expect(message).toContain('Vuelve a entrar')
    expect(message).not.toMatch(/row-level|policy/)
  })

  it('the quiet refusal — zero rows and no error — is not reported as success', () => {
    // Checked against the base: a Reader renaming a type gets 204 with no error and
    // nothing changed. Without this, the screen would say «guardado».
    const message = describeDocumentTypeRefusal('rename', null)
    expect(message).toContain('No se ha guardado nada')
    expect(message).toContain('vuelve a entrar')
  })

  it('a request that never arrived talks about the connection, not about fetch', () => {
    for (const message of ['TypeError: Failed to fetch', 'NetworkError when attempting…', '']) {
      const said = describeDocumentTypeRefusal('retire', { message })
      expect(said).toContain('Comprueba la conexión')
      expect(said).toContain('retirar el tipo de documento')
    }
  })

  it('an unknown failure keeps its own text behind a Spanish lead-in', () => {
    // Inventing a friendly sentence for a failure nobody foresaw would throw away
    // the only clue there is.
    expect(describeDocumentTypeRefusal('add', { code: '22001', message: 'value too long' })).toBe(
      'No se ha podido añadir el tipo de documento: value too long',
    )
  })

  it('names the action that failed, so the message is not ambiguous', () => {
    const failure = { code: 'XX000', message: 'algo raro' }
    expect(describeDocumentTypeRefusal('restore', failure)).toContain('recuperar')
    expect(describeDocumentTypeRefusal('retire', failure)).toContain('retirar')
    expect(describeDocumentTypeRefusal('rename', failure)).toContain('renombrar')
  })
})

describe('describeDocumentTypeLoadFailure (RF-1106: una carga fallida tampoco habla inglés)', () => {
  it('does not hand the browser its own words about fetch', () => {
    // What the hook was showing before, verbatim, pasted after a Spanish lead-in:
    // «No se han podido cargar los tipos de documento: TypeError: Failed to fetch».
    const message = describeDocumentTypeLoadFailure({ message: 'TypeError: Failed to fetch' })
    expect(message).not.toMatch(/fetch/i)
    expect(message).toContain('Comprueba la conexión')
  })

  it('says what is on screen is not the vocabulary, not that nothing was saved', () => {
    // Nothing was being written, so «no se ha guardado nada» would answer a
    // question nobody asked.
    const message = describeDocumentTypeLoadFailure({ message: 'Load failed' })
    expect(message).toContain('No se ha podido leer la lista de tipos de documento')
    expect(message).not.toContain('guardado')
  })

  it('frames an unexpected answer instead of hiding it', () => {
    expect(
      describeDocumentTypeLoadFailure({
        code: '57014',
        message: 'canceling statement due to statement timeout',
      }),
    ).toBe(
      'No se ha podido leer la lista de tipos de documento. La base de datos ha contestado: ' +
        'canceling statement due to statement timeout',
    )
  })
})

describe('RETIRE_CONSEQUENCE (RF-901: what retiring does to the documents)', () => {
  it('says that the documents already classified keep their type', () => {
    expect(RETIRE_CONSEQUENCE).toContain('no cambia los documentos que ya lo tienen')
  })

  it('does not promise a count the trigger never sends', () => {
    // The real message is «…que todavía usan documentos del archivo», with no
    // number in it: announcing «dice cuántos» would be a promise the base breaks.
    expect(RETIRE_CONSEQUENCE).not.toMatch(/cuántos|cuantos/)
  })

  it('warns about the one the trigger does not catch: the wastebasket', () => {
    // The trigger only counts active documents, so a type used exclusively by
    // documents in the wastebasket can be retired — and nobody would guess it.
    expect(RETIRE_CONSEQUENCE).toContain('papelera')
  })
})

describe('summarizeDocumentTypes (RF-515: this vocabulary is not born empty)', () => {
  it('counts the ten seeded ones', () => {
    expect(summarizeDocumentTypes(SEEDED)).toBe('10 tipos en uso')
  })

  it('says how many stopped being offered', () => {
    expect(summarizeDocumentTypes([...SEEDED, entry('Invitación', false)])).toBe(
      '10 tipos en uso y 1 retirado',
    )
    expect(
      summarizeDocumentTypes([...SEEDED, entry('Invitación', false), entry('Telegrama', false)]),
    ).toBe('10 tipos en uso y 2 retirados')
  })

  it('gets the singular right', () => {
    expect(summarizeDocumentTypes([entry('Carta')])).toBe('1 tipo en uso')
  })

  it('does not hide that every type is retired', () => {
    expect(summarizeDocumentTypes([entry('Carta', false)])).toBe('0 tipos en uso y 1 retirado')
  })

  it('answers null with nothing to count, so the empty state can speak', () => {
    expect(summarizeDocumentTypes([])).toBeNull()
  })
})
