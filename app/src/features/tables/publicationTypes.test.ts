import { describe, expect, it } from 'vitest'
import type { MasterEntry } from '../../lib/masterTables'
import { sortByName } from '../../lib/masterTables'
import {
  describePublicationTypeFailure,
  duplicateNameMessage,
  planPublicationTypeAddition,
  planPublicationTypeRename,
} from './publicationTypes'

function entry(name: string, active = true): MasterEntry {
  return { id: `p-${name}`, name, active }
}

// The vocabulary the migration seeds (RF-514), plus a retired one: «Folleto» can
// be retired because no reference uses it, which is the case this screen exists
// for — and the case that makes adding a name ambiguous.
const TYPES = [
  entry('Libro'),
  entry('Artículo'),
  entry('Catálogo de exposición'),
  entry('Prensa'),
  entry('Tesis'),
  entry('Otro'),
  entry('Folleto', false),
]

describe('planPublicationTypeAddition (RF-514: vocabulario abierto que se amplía sin desplegar nada)', () => {
  it('a new name is an insert, trimmed', () => {
    // Trimmed because `publication_types_name_not_blank` checks that the name
    // equals its own trim: without this, « Catálogo de subasta » comes back as
    // constraint 23514.
    expect(planPublicationTypeAddition(TYPES, '  Catálogo de subasta ')).toEqual({
      action: 'insert',
      name: 'Catálogo de subasta',
    })
  })

  it('blank text is not an addition', () => {
    expect(planPublicationTypeAddition(TYPES, '   ')).toEqual({ action: 'blank' })
    expect(planPublicationTypeAddition(TYPES, '')).toEqual({ action: 'blank' })
  })

  it('an equivalent active name is reused, with the same key the unique index uses', () => {
    // `publication_types_name_unique` is an index on place_key(name), so this is
    // not a courtesy: inserting «catalogo de exposicion» WOULD be refused by the
    // database. Predicting it is what turns a duplicate-key error into «ya está».
    const plan = planPublicationTypeAddition(TYPES, 'catalogo de exposicion')
    expect(plan).toEqual({ action: 'reuse', entry: entry('Catálogo de exposición') })
  })

  it('the name of a retired type brings it back instead of failing as a duplicate', () => {
    // RF-901: nothing is deleted. The index covers retired rows, so an insert
    // here fails; and answering «añadido» while «Folleto» stayed hidden is the
    // one outcome the cataloger cannot make sense of.
    expect(planPublicationTypeAddition(TYPES, 'FOLLETO')).toEqual({
      action: 'restore',
      entry: entry('Folleto', false),
    })
  })

  it('keeps the ñ apart, because place_key does', () => {
    // The mirror matters in this direction too: place_key translates accents and
    // leaves the ñ alone, so «Resena» and «Reseña» are two different types for
    // the database. Flattening them here would refuse to add a name the database
    // accepts, and refuse it silently, as a reuse.
    const types = [entry('Reseña')]
    expect(planPublicationTypeAddition(types, 'Resena')).toEqual({
      action: 'insert',
      name: 'Resena',
    })
    expect(planPublicationTypeAddition(types, 'reseña')).toEqual({
      action: 'reuse',
      entry: entry('Reseña'),
    })
  })
})

describe('planPublicationTypeRename (RF-1106, ADR-007: renombrar es una fila y lo ve el catálogo entero)', () => {
  it('renames to the trimmed name', () => {
    expect(planPublicationTypeRename(TYPES, 'p-Prensa', ' Prensa diaria ')).toEqual({
      action: 'rename',
      name: 'Prensa diaria',
    })
  })

  it('an empty field is not a rename', () => {
    expect(planPublicationTypeRename(TYPES, 'p-Prensa', '  ')).toEqual({ action: 'blank' })
  })

  it('saving without changing anything writes nothing', () => {
    // Opening the pencil and saving is a common gesture. Sending it would move
    // `updated_at` and record an audit entry about a change that did not happen.
    expect(planPublicationTypeRename(TYPES, 'p-Prensa', 'Prensa')).toEqual({
      action: 'unchanged',
    })
    expect(planPublicationTypeRename(TYPES, 'p-Prensa', '  Prensa  ')).toEqual({
      action: 'unchanged',
    })
  })

  it('fixing the accents of a name is a rename and not a collision with itself', () => {
    // The key does not change — place_key strips the accents — so comparing
    // against every row including itself would block the exact correction this
    // screen was made for.
    const badly = [entry('catalogo de exposicion')]
    expect(planPublicationTypeRename(badly, 'p-catalogo de exposicion', 'Catálogo de exposición')).toEqual(
      { action: 'rename', name: 'Catálogo de exposición' },
    )
  })

  it('refuses the name of another type, and says which one', () => {
    const plan = planPublicationTypeRename(TYPES, 'p-Prensa', 'LIBRO')
    expect(plan).toEqual({ action: 'taken', entry: entry('Libro') })
  })

  it('the type holding the name may be a retired one', () => {
    // The answer has to be different: recovering «Folleto» is one tap, and
    // leaving two types with the same name is not possible at all.
    const plan = planPublicationTypeRename(TYPES, 'p-Prensa', 'folleto')
    expect(plan).toEqual({ action: 'taken', entry: entry('Folleto', false) })
  })
})

describe('duplicateNameMessage (RF-514: el nombre repetido se cuenta con su consecuencia)', () => {
  it('says the comparison ignores capitals and accents', () => {
    expect(duplicateNameMessage(true)).toContain('el mismo')
    expect(duplicateNameMessage(true)).toContain('catalogo de subasta')
  })

  it('tells what to do when the twin is active: move the references first', () => {
    expect(duplicateNameMessage(true)).toContain('cambia antes el tipo de las referencias')
  })

  it('tells what to do when the twin is retired: recover it', () => {
    expect(duplicateNameMessage(false)).toContain('retirado')
    expect(duplicateNameMessage(false)).toContain('recupéralo')
  })

  it('falls back to the general advice when the twin is unknown', () => {
    // The race: the name was taken between loading the list and writing.
    expect(duplicateNameMessage(null)).toBe(duplicateNameMessage(true))
  })
})

describe('describePublicationTypeFailure (RF-1106: la pantalla lo cuenta, no suelta el mensaje de PostgreSQL)', () => {
  it('passes the trigger sentence through with its hint, because it was written for her', () => {
    // Verbatim from the local database: `update publication_types set active =
    // false` on a type with an active reference answers this, message and hint
    // apart. Rewriting it here would be a second copy of the rule's own wording.
    const failure = {
      code: 'P0001',
      message: 'No se puede retirar un tipo de publicación que todavía usan referencias del catálogo',
      hint: 'Cambia antes el tipo de esas referencias.',
    }
    expect(describePublicationTypeFailure('retire', failure)).toBe(
      'No se puede retirar un tipo de publicación que todavía usan referencias del catálogo. ' +
        'Cambia antes el tipo de esas referencias.',
    )
  })

  it('does not leave two full stops when the trigger message already ends in one', () => {
    expect(
      describePublicationTypeFailure('retire', {
        code: 'P0001',
        message: 'No se puede retirar.',
        hint: 'Cambia antes el tipo.',
      }),
    ).toBe('No se puede retirar. Cambia antes el tipo.')
  })

  it('a trigger without a hint is still a whole sentence', () => {
    expect(
      describePublicationTypeFailure('retire', { code: 'P0001', message: 'No se puede retirar', hint: null }),
    ).toBe('No se puede retirar.')
  })

  it('translates the duplicate key, which arrives in English and naming an index', () => {
    // What PostgREST really answers, checked against the local API:
    // {"code":"23505","message":"duplicate key value violates unique constraint
    //  \"publication_types_name_unique\""}
    const message = describePublicationTypeFailure('rename', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "publication_types_name_unique"',
    })
    expect(message).toBe(duplicateNameMessage(null))
    expect(message).not.toContain('publication_types_name_unique')
  })

  it('translates the blank-name check', () => {
    const message = describePublicationTypeFailure('add', {
      code: '23514',
      message:
        'new row for relation "publication_types" violates check constraint "publication_types_name_not_blank"',
    })
    expect(message).toBe('El nombre no puede quedar en blanco.')
  })

  it('explains a row-level security refusal as an expired session', () => {
    // A Reader never gets here (the screen sends her to the list), so in practice
    // this is a Cataloger whose session ran out with the screen open.
    const message = describePublicationTypeFailure('retire', {
      code: '42501',
      message: 'new row violates row-level security policy for table "publication_types"',
    })
    expect(message).toContain('No se ha podido retirar el tipo de publicación')
    expect(message).toContain('vuelve a entrar')
    expect(message).not.toContain('row-level security')
  })

  it('an answer with no code is a lost connection, and says the change was not saved', () => {
    // supabase-js reports a failed fetch with an empty code. In a storeroom
    // without coverage this is the likeliest failure of the screen, and the
    // cataloger has to know the rename did not happen.
    for (const code of ['', null, undefined]) {
      const message = describePublicationTypeFailure('rename', {
        code,
        message: 'TypeError: Failed to fetch',
      })
      expect(message).toBe(
        'No se ha podido cambiar el nombre: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.',
      )
    }
  })

  it('frames an unexpected code instead of hiding it', () => {
    // Verbatim is right here — an unpredicted failure is worth reporting — but
    // framed, so it reads as an answer and not as a broken screen.
    const message = describePublicationTypeFailure('load', {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    })
    expect(message).toBe(
      'No se han podido cargar los tipos de publicación. La base de datos ha contestado: canceling statement due to statement timeout',
    )
  })

  it('names what was being attempted in each case', () => {
    const attempts = (['load', 'add', 'rename', 'retire', 'restore'] as const).map((action) =>
      describePublicationTypeFailure(action, { code: '', message: 'x' }),
    )
    expect(attempts).toEqual([
      'No se han podido cargar los tipos de publicación: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.',
      'No se ha podido añadir el tipo de publicación: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.',
      'No se ha podido cambiar el nombre: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.',
      'No se ha podido retirar el tipo de publicación: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.',
      'No se ha podido recuperar el tipo de publicación: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.',
    ])
  })
})

describe('sortByName over the publication types (RF-1106: el orden en que se lee la lista)', () => {
  it('sorts with es-ES collation, so «Artículo» is not sent past the z', () => {
    // Sorted on this side and not in the query: the database collation can order
    // an accented name after the z.
    expect(sortByName(TYPES).map((t) => t.name)).toEqual([
      'Artículo',
      'Catálogo de exposición',
      'Folleto',
      'Libro',
      'Otro',
      'Prensa',
      'Tesis',
    ])
  })

  it('keeps the retired type in its alphabetical place', () => {
    // Greyed out, not moved: a name looked for alphabetically and found at the
    // bottom is hidden twice, and this is the only screen it can be recovered
    // from.
    expect(sortByName(TYPES)[2]?.name).toBe('Folleto')
  })
})
