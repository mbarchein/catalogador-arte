import { describe, expect, it } from 'vitest'
import { sortByName } from '../../lib/masterTables'
import type { ArtworkRelationshipType } from '../../lib/types'
import {
  planRelationshipTypeAddition,
  planRelationshipTypeEdit,
  relationshipTypeColumns,
  relationshipTypeDraft,
  relationshipTypeDraftProblem,
  relationshipTypeDraftReadings,
  relationshipTypeFailure,
  relationshipTypeLoadFailure,
  relationshipTypeMissingRow,
  relationshipTypeReadings,
  relationshipTypeSummary,
  type RelationshipTypeDraft,
} from './relationshipTypes'

/**
 * Maintaining the relationship kinds (RF-217, RF-901, RF-1106, ADR-007).
 *
 * The refusals asserted here are the ones the local database returns for real:
 * every code and every original message was provoked with psql and read back
 * through PostgREST before being written down.
 */

const STUDY: ArtworkRelationshipType = {
  id: 'study',
  name: 'Estudio previo de',
  inverse_name: 'Obra final de',
  is_symmetric: false,
  active: true,
}

const PAIR: ArtworkRelationshipType = {
  id: 'pair',
  name: 'Pareja de',
  inverse_name: '',
  is_symmetric: true,
  active: true,
}

function draft(over: Partial<RelationshipTypeDraft> = {}): RelationshipTypeDraft {
  return { name: 'Estudio previo de', inverseName: 'Obra final de', symmetric: false, ...over }
}

describe('RF-217 · las columnas que se escriben', () => {
  it('recorta las dos lecturas, porque la tabla exige que cada una sea su propio recorte', () => {
    expect(relationshipTypeColumns(draft({ name: ' Copia de ', inverseName: ' Original de ' }))).toEqual(
      { name: 'Copia de', inverse_name: 'Original de', is_symmetric: false },
    )
  })

  it('una relación simétrica se guarda sin lectura inversa aunque el campo tuviera texto', () => {
    // La restricción `inverse_coherent` lo exige, y el motivo no es contable: dos
    // etiquetas para un solo hecho dejarían que cada ficha eligiera una.
    expect(relationshipTypeColumns(draft({ symmetric: true, inverseName: 'Obra final de' }))).toEqual(
      { name: 'Estudio previo de', inverse_name: '', is_symmetric: true },
    )
  })

  it('el borrador de una fila existente parte de sus tres columnas', () => {
    expect(relationshipTypeDraft(STUDY)).toEqual({
      name: 'Estudio previo de',
      inverseName: 'Obra final de',
      symmetric: false,
    })
  })
})

describe('RF-217 · un tipo con dirección necesita sus dos lecturas', () => {
  it('acepta un borrador completo', () => {
    expect(relationshipTypeDraftProblem(draft())).toBeNull()
  })

  it('acepta un borrador simétrico sin lectura inversa', () => {
    expect(relationshipTypeDraftProblem(draft({ symmetric: true, inverseName: '' }))).toBeNull()
  })

  it('pide el nombre cuando está en blanco, con un ejemplo', () => {
    const problem = relationshipTypeDraftProblem(draft({ name: '   ' }))
    expect(problem).toContain('desde una obra')
    expect(problem).toContain('Estudio previo de')
  })

  it('pide la lectura inversa contando la consecuencia: la otra ficha se queda muda', () => {
    const problem = relationshipTypeDraftProblem(draft({ inverseName: '' }))
    expect(problem).toContain('la ficha de la segunda obra no tendría nada que decir')
  })

  it('rechaza dos lecturas iguales aunque solo coincidan sin mayúsculas ni tildes', () => {
    // La base solo prohíbe que sean IDÉNTICAS, así que «Copia de»/«copia de»
    // pasaría su comprobación y dejaría un tipo simétrico mal declarado.
    const problem = relationshipTypeDraftProblem(
      draft({ name: 'Copia de', inverseName: 'copia dé' }),
    )
    expect(problem).toContain('dicen lo mismo')
    expect(problem).toContain('Se lee igual desde las dos')
  })
})

describe('RF-217 · cómo se lee la relación desde cada extremo', () => {
  it('un tipo con dirección se lee de dos maneras, y la segunda menciona la inversa', () => {
    const readings = relationshipTypeReadings(STUDY)
    expect(readings).toEqual([
      { side: 'DIRECT', text: 'Una obra es estudio previo de la otra.' },
      { side: 'INVERSE', text: 'Y esa otra es obra final de la primera.' },
    ])
  })

  it('un tipo simétrico se lee de una sola manera, y dice que se registra una vez', () => {
    expect(relationshipTypeReadings(PAIR)).toEqual([
      { side: 'BOTH', text: 'Cada obra es pareja de la otra. Se registra una sola vez.' },
    ])
  })

  it('respeta las siglas al meter la etiqueta en la frase', () => {
    const readings = relationshipTypeReadings({
      name: 'MNCARS lo cataloga como',
      inverse_name: '',
      is_symmetric: true,
    })
    expect(readings[0]?.text).toContain('MNCARS lo cataloga como')
  })

  it('la vista previa de un borrador a medias marca el hueco en vez de dejarlo vacío', () => {
    const readings = relationshipTypeDraftReadings(draft({ inverseName: '' }))
    expect(readings[0]?.text).toBe('Una obra es estudio previo de la otra.')
    expect(readings[1]?.text).toBe('Y esa otra es … la primera.')
  })

  it('el resumen de un tipo dice su lectura inversa, o que no tiene', () => {
    expect(relationshipTypeSummary(STUDY)).toContain('desde la otra obra se lee «Obra final de»')
    expect(relationshipTypeSummary(PAIR)).toContain('se lee igual desde las dos obras')
  })
})

describe('RF-217, RF-901 · añadir un tipo de relación', () => {
  it('un nombre nuevo se inserta con sus tres columnas', () => {
    expect(planRelationshipTypeAddition([STUDY, PAIR], draft({ name: 'Versión de', symmetric: true }))).toEqual(
      { action: 'insert', columns: { name: 'Versión de', inverse_name: '', is_symmetric: true } },
    )
  })

  it('un borrador incompleto no llega a la base', () => {
    const plan = planRelationshipTypeAddition([], draft({ name: '' }))
    expect(plan.action).toBe('problem')
  })

  it('un nombre que ya está en la lista se cuenta, no se traga en silencio', () => {
    // Vaciar el formulario sin escribir nada se leería como «añadido».
    const plan = planRelationshipTypeAddition([STUDY], draft())
    expect(plan.action).toBe('problem')
    if (plan.action !== 'problem') throw new Error('se esperaba un problema')
    expect(plan.problem).toContain('Ya está en la lista')
    expect(plan.problem).toContain('Estudio previo de')
  })

  it('mismo nombre y otra lectura inversa manda a renombrar el que ya está', () => {
    const plan = planRelationshipTypeAddition([STUDY], draft({ inverseName: 'Boceto final de' }))
    expect(plan.action).toBe('problem')
    if (plan.action !== 'problem') throw new Error('se esperaba un problema')
    expect(plan.problem).toContain('Ya hay un tipo de relación con ese nombre')
    expect(plan.problem).toContain('«Obra final de»')
    expect(plan.problem).toContain('lápiz')
  })

  it('mismo nombre con otra simetría también manda a la fila que ya está', () => {
    const plan = planRelationshipTypeAddition([PAIR], draft({ name: 'Pareja de', symmetric: false }))
    expect(plan.action).toBe('problem')
  })

  it('un nombre equivalente sin mayúsculas ni tildes es el mismo tipo', () => {
    const plan = planRelationshipTypeAddition([STUDY], draft({ name: 'estudio prévio de' }))
    expect(plan.action).toBe('problem')
  })

  it('la ñ no se aplana, porque el índice único de la tabla tampoco la aplana', () => {
    // La comparación es `placeKey`, calcada de `public.place_key`: predecir una
    // colisión que la base no tiene rechazaría un tipo que sí se puede crear.
    const nino: ArtworkRelationshipType = { ...STUDY, id: 'nino', name: 'Niño de' }
    expect(planRelationshipTypeAddition([nino], draft({ name: 'Nino de' })).action).toBe('insert')
    expect(planRelationshipTypeAddition([nino], draft({ name: 'niño DE' })).action).toBe('problem')
  })

  it('un nombre que está en la papelera vuelve, y con la dirección recién escrita', () => {
    const retired = { ...STUDY, active: false }
    const plan = planRelationshipTypeAddition([retired], draft({ inverseName: 'Boceto final de' }))
    expect(plan).toEqual({
      action: 'restore',
      entry: retired,
      // El nombre guardado se conserva: lo que pedía escribiendo un equivalente
      // era ESA entrada, no cambiarle las mayúsculas.
      columns: { name: 'Estudio previo de', inverse_name: 'Boceto final de', is_symmetric: false },
    })
  })

  it('al recuperar uno de la papelera se conserva su nombre tal y como estaba escrito', () => {
    const retired = { ...PAIR, active: false }
    const plan = planRelationshipTypeAddition(
      [retired],
      draft({ name: 'pareja DE', symmetric: true }),
    )
    if (plan.action !== 'restore') throw new Error('se esperaba una recuperación')
    expect(plan.columns.name).toBe('Pareja de')
  })
})

describe('RF-217 · renombrar un tipo cambia las dos lecturas a la vez', () => {
  it('cambiar la lectura inversa es un update de las tres columnas', () => {
    expect(planRelationshipTypeEdit(STUDY, draft({ inverseName: 'Boceto final de' }))).toEqual({
      action: 'update',
      columns: {
        name: 'Estudio previo de',
        inverse_name: 'Boceto final de',
        is_symmetric: false,
      },
    })
  })

  it('pasar a simétrico borra la lectura inversa en el mismo update', () => {
    // Las dos columnas son una sola decisión: viajar en dos peticiones dejaría
    // un instante con la fila incoherente, que la restricción no permite.
    expect(planRelationshipTypeEdit(STUDY, draft({ symmetric: true }))).toEqual({
      action: 'update',
      columns: { name: 'Estudio previo de', inverse_name: '', is_symmetric: true },
    })
  })

  it('guardar sin haber cambiado nada no escribe', () => {
    // Importa en un tipo YA USADO: la base congela su simetría (RF-217), y un
    // update que la reenvía igual no dispara nada, pero uno que la mueva sí.
    expect(planRelationshipTypeEdit(STUDY, relationshipTypeDraft(STUDY))).toEqual({
      action: 'unchanged',
    })
    expect(planRelationshipTypeEdit(PAIR, relationshipTypeDraft(PAIR))).toEqual({
      action: 'unchanged',
    })
  })

  it('un espacio de más no cuenta como cambio', () => {
    expect(
      planRelationshipTypeEdit(STUDY, relationshipTypeDraft({ ...STUDY, name: 'Estudio previo de ' })),
    ).toEqual({ action: 'unchanged' })
  })

  it('quitarle la lectura inversa a un tipo con dirección se rechaza antes de la base', () => {
    const plan = planRelationshipTypeEdit(STUDY, draft({ inverseName: '' }))
    expect(plan.action).toBe('problem')
  })
})

describe('RF-217, RF-1106 · lo que la base contesta, contado en español', () => {
  it('retirar un tipo en uso: el mensaje del trigger llega con su pista', () => {
    // Provocado en la base: código P0001, mensaje y HINT separados, y PostgREST
    // trae los dos. Sin la pista, «no se puede retirar» es un callejón sin salida.
    const message = relationshipTypeFailure(
      {
        code: 'P0001',
        message:
          'No se puede retirar un tipo de relación que todavía usan obras relacionadas del catálogo',
        hint: 'Cambia antes el tipo de esas relaciones.',
      },
      'retire',
    )
    expect(message).toBe(
      'No se puede retirar un tipo de relación que todavía usan obras relacionadas del ' +
        'catálogo. Cambia antes el tipo de esas relaciones.',
    )
  })

  it('cambiar la simetría de un tipo ya usado: mensaje y pista, sin jerga', () => {
    const message = relationshipTypeFailure(
      {
        code: 'P0001',
        message: 'No se puede cambiar la simetría de un tipo de relación que ya se ha usado',
        hint: 'Crea un tipo nuevo con la simetría que necesitas y cambia esas relaciones al tipo nuevo.',
      },
      'rename',
    )
    expect(message).toContain('ya se ha usado')
    expect(message).toContain('Crea un tipo nuevo')
    expect(message).not.toMatch(/trigger|is_symmetric|PL\/pgSQL/)
  })

  it('un mensaje del trigger que ya acaba en punto no gana otro', () => {
    expect(
      relationshipTypeFailure({ code: 'P0001', message: 'No se puede.', hint: 'Haz lo otro.' }, 'retire'),
    ).toBe('No se puede. Haz lo otro.')
  })

  it('nombre repetido: se dice, y se dice que las tildes no cuentan', () => {
    const message = relationshipTypeFailure(
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "artwork_relationship_types_name_unique"',
        hint: null,
      },
      'rename',
    )
    expect(message).toContain('Ya hay otro tipo de relación con ese nombre')
    expect(message).toContain('tildes')
    expect(message).not.toContain('duplicate key')
  })

  it('dirección incoherente: se traduce la restricción en vez de nombrarla', () => {
    const message = relationshipTypeFailure(
      {
        code: '23514',
        message:
          'new row for relation "artwork_relationship_types" violates check constraint "artwork_relationship_types_inverse_coherent"',
        hint: null,
      },
      'add',
    )
    expect(message).toContain('las dos lecturas')
    expect(message).not.toContain('check constraint')
  })

  it('nombre en blanco y espacios en la lectura inversa tienen su propia frase', () => {
    expect(
      relationshipTypeFailure(
        {
          code: '23514',
          message:
            'new row for relation "artwork_relationship_types" violates check constraint "artwork_relationship_types_name_not_blank"',
          hint: null,
        },
        'add',
      ),
    ).toContain('El nombre no puede quedar vacío')

    expect(
      relationshipTypeFailure(
        {
          code: '23514',
          message:
            'new row for relation "artwork_relationship_types" violates check constraint "artwork_relationship_types_inverse_name_trimmed"',
          hint: null,
        },
        'add',
      ),
    ).toContain('espacios')
  })

  it('sin permiso (RLS) se dice que la sesión no edita, no la política', () => {
    const message = relationshipTypeFailure(
      {
        code: '42501',
        message: 'new row violates row-level security policy for table "artwork_relationship_types"',
        hint: null,
      },
      'add',
    )
    expect(message).toContain('catalogadora')
    expect(message).not.toContain('row-level security')
  })

  it('un código desconocido no se traga: se dice qué fallaba y se enseña el original', () => {
    const message = relationshipTypeFailure({ code: '08006', message: 'connection failure' }, 'retire')
    expect(message).toBe('No se ha podido retirar el tipo de relación: connection failure')
  })

  it('cada acción se nombra por lo que la usuaria intentaba hacer', () => {
    const failure = { code: '99999', message: 'x' }
    expect(relationshipTypeFailure(failure, 'add')).toContain('añadir el tipo de relación')
    expect(relationshipTypeFailure(failure, 'rename')).toContain('guardar el cambio')
    expect(relationshipTypeFailure(failure, 'restore')).toContain('recuperar el tipo de relación')
  })

  it('un update que no toca ninguna fila no se cuenta como éxito', () => {
    // Comprobado contra la base: con la sesión de una lectora, el PATCH vuelve
    // 200 con lista vacía y sin error ninguno.
    const message = relationshipTypeMissingRow('rename')
    expect(message).toContain('la lista ha cambiado o esta sesión ya no puede editarla')
  })

  it('un fallo de red se cuenta en español y dice que no se mandó', () => {
    // La rama que faltaba: sin código, la frase acababa siendo «No se ha podido
    // retirar el tipo de relación: TypeError: Failed to fetch».
    const message = relationshipTypeFailure(
      { code: '', message: 'TypeError: Failed to fetch' },
      'retire',
    )
    expect(message).not.toMatch(/fetch/i)
    expect(message).toContain('Comprueba la conexión')
  })
})

describe('RF-1106 · una carga fallida tampoco habla inglés', () => {
  it('traduce lo que el hook de lectura entrega en crudo', () => {
    // El hook de lectura vive en la ficha y devuelve `failure.message` tal cual;
    // esta pantalla lo pegaba detrás de un encabezado en español.
    const message = relationshipTypeLoadFailure('TypeError: Failed to fetch')
    expect(message).not.toMatch(/fetch/i)
    expect(message).toContain('No se ha podido leer la lista de tipos de relación')
  })

  it('no habla de nada guardado, porque no se estaba escribiendo', () => {
    expect(relationshipTypeLoadFailure('Load failed')).not.toContain('guardado')
  })

  it('enmarca lo imprevisto conservando lo que dijo la base', () => {
    expect(relationshipTypeLoadFailure('canceling statement due to statement timeout')).toBe(
      'No se ha podido leer la lista de tipos de relación. La base de datos ha contestado: ' +
        'canceling statement due to statement timeout',
    )
  })
})

describe('RF-1106 · el orden de la lista', () => {
  it('alfabético en es-ES, con las tildes en su sitio y sin apartar los retirados', () => {
    // El orden es el compartido por la sección (`sortByName`), y esta pantalla
    // depende de él: se fija aquí para que un cambio se note.
    const entries: ArtworkRelationshipType[] = [
      { ...PAIR, id: 'v', name: 'Versión de' },
      { ...PAIR, id: 'r', name: 'Ámbito de', active: false },
      { ...STUDY, id: 'c', name: 'Copia de' },
    ]
    expect(sortByName(entries).map((entry) => entry.name)).toEqual([
      'Ámbito de',
      'Copia de',
      'Versión de',
    ])
  })
})
