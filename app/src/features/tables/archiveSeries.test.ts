import { describe, expect, it } from 'vitest'
import type { ArchiveSeries } from '../../lib/types'
import {
  buildSeriesTree,
  canAddSeries,
  describeArchiveSeriesFailure,
  describeSeriesContents,
  flattenSeries,
  planSeriesAddition,
  planSeriesMove,
  planSeriesRename,
  retireRefusalText,
  seriesAddLabel,
  seriesAdditionProblem,
  seriesAdditionSummary,
  seriesDepth,
  seriesInside,
  seriesKey,
  seriesLevelLabel,
  seriesListNotice,
  seriesMoveProblem,
  seriesPathText,
  seriesRenameProblem,
  summarizeSeriesTree,
  takenText,
  WHERE_TO_LOOK,
} from './archiveSeries'

/**
 * RF-515: the archival classification is a TREE —fund, series, subseries— and not
 * a hierarchy stuffed inside a text, with the shape ADR-006 set for the
 * places: name as it is written, normalised comparison key, mutable
 * parent, siblings with no repeated names and no cycles.
 * RF-901: nothing is deleted, it is withdrawn.
 * RF-1106: it is maintained from the «Tablas» section, not from any record.
 *
 * The codes and the messages asserted here are the ones the local base really
 * returns, provoked one by one through psql with BEGIN/ROLLBACK and again over HTTP
 * against the same PostgREST the application uses, authenticated as
 * catalogador@local.test and as lector@local.test.
 */

function node(over: Partial<ArchiveSeries> & { id: string }): ArchiveSeries {
  return { parent_id: null, name: 'Correspondencia', active: true, ...over }
}

/**
 * A three-level tree, with one withdrawn branch:
 *
 *   Correspondencia (fund)
 *     Cartas recibidas
 *       Galerías
 *     Cartas enviadas (withdrawn)
 *   Álbumes (fund)
 */
const FONDO = node({ id: 'f1', name: 'Correspondencia' })
const RECIBIDAS = node({ id: 's1', parent_id: 'f1', name: 'Cartas recibidas' })
const GALERIAS = node({ id: 'ss1', parent_id: 's1', name: 'Galerías' })
const ENVIADAS = node({ id: 's2', parent_id: 'f1', name: 'Cartas enviadas', active: false })
const ALBUMES = node({ id: 'f2', name: 'Álbumes' })
const ROWS = [GALERIAS, ALBUMES, ENVIADAS, FONDO, RECIBIDAS]
const TREE = buildSeriesTree(ROWS)

// ── The tree, which is lib/places' under another name ─────────

describe('el árbol de la clasificación (RF-515)', () => {
  it('los fondos son las raíces, con la clave nula que usa la base', () => {
    expect(TREE.childrenOf.get(null)?.map((series) => series.id)).toEqual(['f2', 'f1'])
  })

  /** «Álbumes» goes with the a's and not after the z, whatever the base's collation. */
  it('los hermanos salen ordenados en español', () => {
    expect(TREE.childrenOf.get(null)?.map((series) => series.name)).toEqual([
      'Álbumes',
      'Correspondencia',
    ])
  })

  it('cada nodo se encuentra por su identificador', () => {
    expect(TREE.byId.get('ss1')?.name).toBe('Galerías')
  })

  /** Never a gap: a node whose parent is not in the list is seen as a root. */
  it('una serie huérfana se muestra como fondo en vez de desaparecer', () => {
    const tree = buildSeriesTree([node({ id: 'x', parent_id: 'no-existe', name: 'Suelta' })])
    expect(tree.childrenOf.get(null)?.map((series) => series.id)).toEqual(['x'])
  })

  it('se recorre de arriba abajo, rama por rama, no como una lista ordenada', () => {
    expect(flattenSeries(TREE).map((row) => [row.series.name, row.depth])).toEqual([
      ['Álbumes', 0],
      ['Correspondencia', 0],
      ['Cartas enviadas', 1],
      ['Cartas recibidas', 1],
      ['Galerías', 2],
    ])
  })

  it('la rama entera de un nodo es lo que lo identifica ante una persona', () => {
    const row = flattenSeries(TREE).find((it) => it.series.id === 'ss1')
    expect(row?.path).toBe('Correspondencia, Cartas recibidas, Galerías')
  })

  it('lo que no se conserva se lleva por delante lo que tenga dentro', () => {
    const kept = flattenSeries(TREE, (series) => series.id !== 's1').map((row) => row.series.id)
    expect(kept).not.toContain('ss1')
  })

  it('«dentro de» incluye a cualquier profundidad, que es lo que impide el ciclo', () => {
    expect([...seriesInside(TREE, ['f1'])].sort()).toEqual(['f1', 's1', 's2', 'ss1'])
  })

  it('la rama se lee separada por comas, de fuera adentro', () => {
    expect(seriesPathText(TREE, 'ss1')).toBe('Correspondencia, Cartas recibidas, Galerías')
  })

  it('un nodo desconocido no tiene rama, y no revienta', () => {
    expect(seriesPathText(TREE, 'no-existe')).toBe('')
  })

  it('el nivel de un nodo se cuenta desde su fondo', () => {
    expect(seriesDepth(TREE, 'f1')).toBe(0)
    expect(seriesDepth(TREE, 'ss1')).toBe(2)
  })

  /** −1 for «none», so that a child's level is always parent + 1. */
  it('sin padre el nivel es −1, así que el primer nivel no es un caso especial', () => {
    expect(seriesDepth(TREE, null)).toBe(-1)
    expect(seriesDepth(TREE, 'no-existe')).toBe(-1)
  })

  it('cada nivel se llama por su nombre, que es el de RF-515', () => {
    expect(seriesLevelLabel(0)).toBe('Fondo')
    expect(seriesLevelLabel(1)).toBe('Serie')
    expect(seriesLevelLabel(2)).toBe('Subserie')
    expect(seriesLevelLabel(3)).toBe('Subserie de nivel 4')
  })
})

// ── The comparison key, twin of the two indexes ───────────────

describe('la clave de comparación de un nombre', () => {
  it('no distingue mayúsculas ni tildes, como los dos índices únicos', () => {
    expect(seriesKey('Correspondéncia')).toBe(seriesKey('correspondencia'))
  })

  it('no cuenta los espacios de los extremos', () => {
    expect(seriesKey('  Prensa ')).toBe('prensa')
  })

  /**
   * The project's trap: `place_key` leaves the ñ standing, and a key that
   * flattened it would answer «it is already there» to a name the base would have accepted.
   */
  it('la ñ es una letra y no una tilde, así que «Niñeces» y «Nineces» son dos', () => {
    expect(seriesKey('Niñeces')).not.toBe(seriesKey('Nineces'))
  })
})

// ── Añadir ───────────────────────────────────────────────────

describe('añadir una serie (RF-515, RF-901)', () => {
  it('sin nombre no hay nada que hacer', () => {
    expect(planSeriesAddition(TREE, null, '   ')).toEqual({ action: 'blank' })
    expect(seriesAdditionProblem({ action: 'blank' })).toBe('Escribe el nombre de la serie')
  })

  it('un nombre nuevo se inserta donde se eligió, y recortado', () => {
    expect(planSeriesAddition(TREE, 'f1', '  Prensa ')).toEqual({
      action: 'insert',
      name: 'Prensa',
      parentId: 'f1',
    })
    expect(seriesAdditionProblem({ action: 'insert', name: 'Prensa', parentId: 'f1' })).toBeNull()
  })

  it('un equivalente que ya se ofrece se reutiliza, sin crear un segundo', () => {
    expect(planSeriesAddition(TREE, 'f1', 'cartas RECIBIDAS')).toEqual({
      action: 'reuse',
      series: RECIBIDAS,
    })
  })

  /** Nothing is deleted (RF-901): writing the name of a withdrawn one means wanting it back. */
  it('el nombre de una retirada la recupera en vez de fallar por duplicado', () => {
    expect(planSeriesAddition(TREE, 'f1', 'Cartas enviadas')).toEqual({
      action: 'restore',
      series: ENVIADAS,
    })
  })

  /** Both indexes are partial: uniqueness is among siblings, not global. */
  it('el mismo nombre en otro padre es otra serie, y se crea', () => {
    expect(planSeriesAddition(TREE, 'f2', 'Cartas recibidas')).toMatchObject({ action: 'insert' })
  })

  it('el mismo nombre como fondo también se crea: los fondos solo compiten entre ellos', () => {
    expect(planSeriesAddition(TREE, null, 'Cartas recibidas')).toMatchObject({ action: 'insert' })
  })

  it('un fondo repetido sí se ve, porque el índice de las raíces existe', () => {
    expect(planSeriesAddition(TREE, null, 'álbumes')).toEqual({ action: 'reuse', series: ALBUMES })
  })

  it('«Nineces» no se traga por «Niñeces»: la base aceptaría las dos', () => {
    const tree = buildSeriesTree([node({ id: 'n', name: 'Niñeces' })])
    expect(planSeriesAddition(tree, null, 'Nineces')).toMatchObject({ action: 'insert' })
  })

  /** Here the name is NOT a path: the comma is a character and the parent is chosen. */
  it('las comas del nombre se guardan, no abren niveles', () => {
    expect(planSeriesAddition(TREE, 'f1', 'Cartas, telegramas y postales')).toEqual({
      action: 'insert',
      name: 'Cartas, telegramas y postales',
      parentId: 'f1',
    })
  })
})

describe('la línea que dice dónde va la serie nueva', () => {
  it('sin padre elegido, dice que será un fondo', () => {
    expect(seriesAdditionSummary(TREE, null)).toBe(
      'Se creará como un fondo, en el primer nivel de la clasificación.',
    )
  })

  it('dentro de un fondo, será una serie', () => {
    expect(seriesAdditionSummary(TREE, 'f1')).toBe(
      'Se creará como serie dentro de «Correspondencia».',
    )
  })

  it('dentro de una serie, será una subserie, y se dice la rama entera', () => {
    expect(seriesAdditionSummary(TREE, 's1')).toBe(
      'Se creará como subserie dentro de «Correspondencia, Cartas recibidas».',
    )
  })

  it('si el padre elegido ya no está, se dice en vez de crear un fondo por sorpresa', () => {
    expect(seriesAdditionSummary(TREE, 'se-fue')).toBe(
      'La serie que habías elegido ya no está en la lista: vuelve a elegir dónde va.',
    )
  })
})

describe('el botón de añadir', () => {
  it('dice qué se va a crear, que depende de un toque de antes', () => {
    expect(seriesAddLabel(TREE, null)).toBe('Añadir fondo')
    expect(seriesAddLabel(TREE, 'f1')).toBe('Añadir serie')
    expect(seriesAddLabel(TREE, 's1')).toBe('Añadir subserie')
  })

  it('sin saber dónde va, no adivina el nivel', () => {
    expect(seriesAddLabel(TREE, 'se-fue')).toBe('Añadir')
  })

  it('sin nombre no se puede pulsar', () => {
    expect(canAddSeries(TREE, null, '   ')).toBe(false)
    expect(canAddSeries(TREE, null, 'Prensa')).toBe(true)
  })

  /** A series another session moved or withdrew while the form was half-done. */
  it('tampoco si la serie elegida ya no está: la base contestaría con una clave ajena', () => {
    expect(canAddSeries(TREE, 'se-fue', 'Prensa')).toBe(false)
    expect(canAddSeries(TREE, 'f1', 'Prensa')).toBe(true)
  })
})

// ── Renombrar ────────────────────────────────────────────────

describe('renombrar una serie (RF-515, ADR-006)', () => {
  it('un nombre vacío no se manda', () => {
    expect(planSeriesRename(TREE, 's1', '  ')).toEqual({ action: 'blank' })
    expect(seriesRenameProblem({ action: 'blank' })).toBe('El nombre no puede quedar vacío')
  })

  /** Opening the pencil and saving without touching anything is neither a write nor an audit row. */
  it('el mismo nombre no escribe nada', () => {
    expect(planSeriesRename(TREE, 's1', 'Cartas recibidas')).toEqual({ action: 'unchanged' })
    expect(planSeriesRename(TREE, 's1', ' Cartas recibidas ')).toEqual({ action: 'unchanged' })
    expect(seriesRenameProblem({ action: 'unchanged' })).toBeNull()
  })

  /**
   * What this screen exists to cure: v11's text migration left
   * the hierarchy in lower case and with no accents.
   */
  it('corregir solo mayúsculas o tildes del propio nombre sigue siendo posible', () => {
    const tree = buildSeriesTree([node({ id: 'a', name: 'correspondencia' })])
    expect(planSeriesRename(tree, 'a', 'Correspondencia')).toEqual({
      action: 'rename',
      name: 'Correspondencia',
    })
  })

  it('el nombre de un hermano está cogido, y se dice antes de pedir nada', () => {
    expect(planSeriesRename(TREE, 's1', 'cartas enviadas')).toEqual({
      action: 'taken',
      series: ENVIADAS,
    })
  })

  it('el nombre de una serie de otro padre no está cogido', () => {
    expect(planSeriesRename(TREE, 's1', 'Álbumes')).toMatchObject({ action: 'rename' })
  })

  /** Stale copy: the base answers, which is the one that knows, with «no se ha guardado nada». */
  it('un nodo que ya no está en la lista se manda igual y decide la base', () => {
    expect(planSeriesRename(TREE, 'se-fue', 'Prensa')).toEqual({
      action: 'rename',
      name: 'Prensa',
    })
  })
})

// ── Mover ────────────────────────────────────────────────────

describe('mover una serie (RF-515, sin ciclos)', () => {
  it('dentro de sí misma, no', () => {
    expect(planSeriesMove(TREE, 's1', 's1')).toEqual({ action: 'itself' })
    expect(seriesMoveProblem({ action: 'itself' })).toBe(
      'Una serie no puede estar dentro de sí misma.',
    )
  })

  it('al sitio donde ya está, no se escribe', () => {
    expect(planSeriesMove(TREE, 's1', 'f1')).toEqual({ action: 'unchanged' })
    expect(planSeriesMove(TREE, 'f1', null)).toEqual({ action: 'unchanged' })
    expect(seriesMoveProblem({ action: 'unchanged' })).toBeNull()
  })

  it('dentro de una de sus propias subseries, tampoco: la rama dejaría de verse', () => {
    expect(planSeriesMove(TREE, 'f1', 's1')).toEqual({ action: 'descendant' })
    expect(planSeriesMove(TREE, 'f1', 'ss1')).toEqual({ action: 'descendant' })
    expect(seriesMoveProblem({ action: 'descendant' })).toContain(
      'está dentro de la serie que estás moviendo',
    )
  })

  it('a un destino donde ya hay una con ese nombre, se avisa antes de pedirlo', () => {
    const tree = buildSeriesTree([
      FONDO,
      RECIBIDAS,
      ALBUMES,
      node({ id: 'otra', parent_id: 'f2', name: 'cartas recibidas' }),
    ])
    expect(planSeriesMove(tree, 's1', 'f2')).toMatchObject({ action: 'taken' })
  })

  it('a un destino libre, se mueve', () => {
    expect(planSeriesMove(TREE, 'ss1', 'f2')).toEqual({ action: 'move', parentId: 'f2' })
  })

  it('a ninguno, pasa a ser un fondo', () => {
    expect(planSeriesMove(TREE, 's1', null)).toEqual({ action: 'move', parentId: null })
  })

  it('un nodo que ya no está en la lista se manda igual y decide la base', () => {
    expect(planSeriesMove(TREE, 'se-fue', 'f1')).toEqual({ action: 'move', parentId: 'f1' })
  })
})

// ── The name another one already has ──────────────────────────

describe('la frase del nombre repetido', () => {
  it('dice quién lo tiene y que las mayúsculas y las tildes no cuentan', () => {
    const text = takenText(RECIBIDAS, 'add')
    expect(text).toContain('«Cartas recibidas»')
    expect(text).toContain('Las mayúsculas y las tildes no cuentan')
  })

  /** Recovering a withdrawn one brings back what it had inside; creating a second one does not. */
  it('si la que lo tiene está retirada, manda a recuperarla', () => {
    expect(takenText(ENVIADAS, 'add')).toContain('recupérala en vez de crear una segunda')
  })

  it('al renombrar, dice cómo unir las dos', () => {
    expect(takenText(RECIBIDAS, 'rename')).toContain('mueve antes lo que hay dentro')
  })

  it('al mover, ofrece la otra salida: elegir otro destino', () => {
    expect(takenText(RECIBIDAS, 'move')).toContain('elige otro destino')
  })
})

// ── What the base answers ────────────────────────────────────

describe('lo que contesta la base, traducido (RF-1106)', () => {
  /**
   * Checked with lector@local.test's token: a PATCH the policies
   * deny comes back 204, or 200 with an empty list, and NO error. Without counting the rows
   * touched the screen would say «guardado» without having saved.
   */
  it('cero filas tocadas y sin error no es un éxito', () => {
    const text = describeArchiveSeriesFailure('rename', null)
    expect(text).toContain('No se ha guardado nada')
    expect(text).toContain('Vuelve a entrar')
  })

  it('un fondo repetido se distingue por el nombre del índice de las raíces', () => {
    const text = describeArchiveSeriesFailure('add', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "archive_series_root_unique"',
    })
    expect(text).toContain('Ya hay un fondo con ese nombre en el primer nivel')
    expect(text).toContain('retirado')
    expect(text).not.toContain('duplicate key')
  })

  it('una hermana repetida se distingue por el otro índice', () => {
    const text = describeArchiveSeriesFailure('add', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "archive_series_siblings_unique"',
    })
    expect(text).toContain('Ya hay otra serie con ese nombre dentro de la misma')
    expect(text).not.toContain('constraint')
  })

  it('un nombre en blanco o con un espacio pegado se cuenta en español', () => {
    expect(
      describeArchiveSeriesFailure('add', {
        code: '23514',
        message:
          'new row for relation "archive_series" violates check constraint "archive_series_name_not_blank"',
      }),
    ).toBe('El nombre no puede quedar vacío, ni empezar ni acabar con un espacio.')
  })

  /**
   * The trigger writes in Spanish and for the user, and the hint is the half that
   * says what to do. Both are shown, which arrive in separate fields.
   */
  it('el aviso de los documentos dentro se muestra con su pista', () => {
    expect(
      describeArchiveSeriesFailure('retire', {
        code: 'P0001',
        message: 'No se puede retirar una serie que todavía tiene documentos dentro',
        hint: 'Mueve antes los documentos a otra serie.',
      }),
    ).toBe(
      'No se puede retirar una serie que todavía tiene documentos dentro. Mueve antes los documentos a otra serie.',
    )
  })

  it('el aviso de las subseries dentro también', () => {
    expect(
      describeArchiveSeriesFailure('retire', {
        code: 'P0001',
        message: 'No se puede retirar una serie que todavía contiene otras series',
        hint: 'Retira o mueve antes lo que hay dentro.',
      }),
    ).toBe(
      'No se puede retirar una serie que todavía contiene otras series. Retira o mueve antes lo que hay dentro.',
    )
  })

  it('el ciclo del disparador no trae pista, y no se le inventa un punto doble', () => {
    expect(
      describeArchiveSeriesFailure('move', {
        code: 'P0001',
        message: 'Ese movimiento metería la serie dentro de una de sus subseries',
        hint: null,
      }),
    ).toBe('Ese movimiento metería la serie dentro de una de sus subseries.')
  })

  it('y tampoco el de «dentro de sí misma»', () => {
    expect(
      describeArchiveSeriesFailure('move', {
        code: 'P0001',
        message: 'Una serie no puede estar dentro de sí misma',
      }),
    ).toBe('Una serie no puede estar dentro de sí misma.')
  })

  it('una escritura que las políticas niegan manda a volver a entrar', () => {
    const text = describeArchiveSeriesFailure('add', {
      code: '42501',
      message: 'new row violates row-level security policy for table "archive_series"',
    })
    expect(text).toContain('no tiene permiso para mantener la clasificación archivística')
    expect(text).not.toContain('row-level security')
  })

  /**
   * The only foreign key that can fail from this screen is `parent_id`, and
   * only in one direction, because nothing is deleted here: the chosen parent is no longer there.
   */
  it('un padre que ya no existe manda a elegir otra vez, no habla de claves', () => {
    const text = describeArchiveSeriesFailure('add', {
      code: '23503',
      message:
        'insert or update on table "archive_series" violates foreign key constraint "archive_series_parent_id_fkey"',
    })
    expect(text).toContain('ya no está en el catálogo')
    expect(text).toContain('elige otra vez dónde va')
    expect(text).not.toContain('foreign key')
  })

  it('sin código y sin conexión, se dice que el cambio no se ha mandado', () => {
    expect(
      describeArchiveSeriesFailure('retire', { message: 'TypeError: Failed to fetch' }),
    ).toBe(
      'No se ha podido retirar la serie: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.',
    )
  })

  it('un mensaje vacío es lo mismo: la petición no llegó', () => {
    expect(describeArchiveSeriesFailure('move', { message: '   ' })).toContain(
      'no ha podido hablar con el catálogo',
    )
  })

  /** Inventing a kind sentence for an unknown failure hides the only clue there is. */
  it('lo imprevisto se enmarca conservando lo que dijo la base', () => {
    expect(describeArchiveSeriesFailure('load', { code: 'XX000', message: 'algo raro' })).toBe(
      'No se ha podido cargar la clasificación archivística: algo raro',
    )
  })
})

// ── How many are inside, and where to look at them ───────────

describe('cuánto tiene dentro una serie que no se deja retirar (RF-515)', () => {
  const nothing = { subseries: [], subseriesCount: 0, documents: [], documentCount: 0 }

  /** After the refusal, «nothing» means somebody emptied it in the meantime. */
  it('si no hay nada dentro, no se dice nada', () => {
    expect(describeSeriesContents(nothing)).toBeNull()
  })

  it('un documento se nombra por su signatura, que es lo que lo localiza', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        documents: [{ archive_code: 'AR-ARCH-0004', title: 'Carta de Rotili a Villafamés' }],
        documentCount: 1,
      }),
    ).toBe(
      'Tiene 1 documento: «AR-ARCH-0004 · Carta de Rotili a Villafamés». ' + WHERE_TO_LOOK,
    )
  })

  it('un documento sin signatura se nombra por su descripción, no por un hueco', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        documents: [{ archive_code: null, title: 'Recorte sin identificar' }],
        documentCount: 1,
      }),
    ).toContain('Tiene 1 documento: «Recorte sin identificar».')
  })

  it('tres documentos se nombran los tres', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        documents: [
          { archive_code: null, title: 'A' },
          { archive_code: null, title: 'B' },
          { archive_code: null, title: 'C' },
        ],
        documentCount: 3,
      }),
    ).toContain('Tiene 3 documentos: «A», «B» y «C».')
  })

  /** Two hundred documents are another afternoon: that is why the number is the base's and not the list's. */
  it('con muchos, se nombran los primeros y se cuenta el resto', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        documents: [
          { archive_code: null, title: 'A' },
          { archive_code: null, title: 'B' },
          { archive_code: null, title: 'C' },
        ],
        documentCount: 11,
      }),
    ).toContain('Tiene 11 documentos: «A», «B», «C» y 8 más.')
  })

  it('uno más se dice «uno más», que es un documento', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        documents: [{ archive_code: null, title: 'A' }],
        documentCount: 2,
      }),
    ).toContain('«A» y uno más.')
  })

  it('una serie más se dice «una más», que es una serie', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        subseries: [{ name: 'Galerías' }],
        subseriesCount: 2,
      }),
    ).toBe('Tiene 2 series dentro: «Galerías» y una más.')
  })

  it('las subseries se nombran, que son las que hay que vaciar primero', () => {
    expect(
      describeSeriesContents({
        ...nothing,
        subseries: [{ name: 'Cartas recibidas' }, { name: 'Cartas enviadas' }],
        subseriesCount: 2,
      }),
    ).toBe('Tiene 2 series dentro: «Cartas recibidas» y «Cartas enviadas».')
  })

  it('con series y documentos, se cuentan las dos cosas en dos frases', () => {
    expect(
      describeSeriesContents({
        subseries: [{ name: 'Galerías' }],
        subseriesCount: 1,
        documents: [{ archive_code: 'AR-0001', title: 'Carta' }],
        documentCount: 1,
      }),
    ).toBe(
      'Tiene 1 serie dentro: «Galerías». Y 1 documento: «AR-0001 · Carta». ' + WHERE_TO_LOOK,
    )
  })

  /** The count comes from the base and the list may not arrive (a race, a permission). */
  it('si hay recuento pero no nombres, se dice el número a secas', () => {
    expect(describeSeriesContents({ ...nothing, subseriesCount: 4 })).toBe(
      'Tiene 4 series dentro.',
    )
  })

  it('dónde mirarlos solo se dice cuando hay documentos que mirar', () => {
    expect(describeSeriesContents({ ...nothing, subseriesCount: 2 })).not.toContain(WHERE_TO_LOOK)
  })

  it('los espacios sobrantes de un nombre no salen a la pantalla', () => {
    expect(
      describeSeriesContents({ ...nothing, subseries: [{ name: '  Galerías ' }], subseriesCount: 1 }),
    ).toBe('Tiene 1 serie dentro: «Galerías».')
  })
})

describe('la respuesta completa a un «Retirar» que la base rechaza', () => {
  const refusal = {
    code: 'P0001',
    message: 'No se puede retirar una serie que todavía tiene documentos dentro',
    hint: 'Mueve antes los documentos a otra serie.',
  }

  it('primero lo que dijo la base y después cuántos hay', () => {
    const text = retireRefusalText(refusal, {
      subseries: [],
      subseriesCount: 0,
      documents: [{ archive_code: 'AR-0001', title: 'Carta' }],
      documentCount: 3,
    })
    expect(text).toContain('No se puede retirar una serie que todavía tiene documentos dentro.')
    expect(text).toContain('Mueve antes los documentos a otra serie.')
    expect(text).toContain('Tiene 3 documentos: «AR-0001 · Carta» y 2 más.')
  })

  /** The base's sentence on its own is still a complete answer. */
  it('si no se ha podido preguntar cuántos, la negativa se muestra sola', () => {
    expect(retireRefusalText(refusal, null)).toBe(
      'No se puede retirar una serie que todavía tiene documentos dentro. Mueve antes los documentos a otra serie.',
    )
  })

  it('y si al preguntar ya no había nada dentro, tampoco se añade nada', () => {
    expect(
      retireRefusalText(refusal, {
        subseries: [],
        subseriesCount: 0,
        documents: [],
        documentCount: 0,
      }),
    ).toBe(
      'No se puede retirar una serie que todavía tiene documentos dentro. Mueve antes los documentos a otra serie.',
    )
  })
})

// ── What the screen says about the list ──────────────────────

describe('el recuento de la clasificación', () => {
  it('sin nada, no hay recuento: habla el estado vacío', () => {
    expect(summarizeSeriesTree(buildSeriesTree([]))).toBeNull()
  })

  it('un solo fondo se cuenta en singular', () => {
    expect(summarizeSeriesTree(buildSeriesTree([FONDO]))).toBe('1 fondo')
  })

  it('los fondos y lo que llevan dentro se cuentan por separado', () => {
    expect(summarizeSeriesTree(buildSeriesTree([FONDO, ALBUMES, RECIBIDAS]))).toBe(
      '2 fondos y 1 serie dentro',
    )
  })

  it('las retiradas se cuentan aparte, porque siguen ahí (RF-901)', () => {
    expect(summarizeSeriesTree(TREE)).toBe('2 fondos y 3 series dentro, 1 retirada')
  })

  it('y en plural cuando son varias', () => {
    const tree = buildSeriesTree([FONDO, ENVIADAS, node({ id: 'z', name: 'Zeta', active: false })])
    expect(tree.childrenOf.get(null)?.length).toBe(2)
    expect(summarizeSeriesTree(tree)).toBe('2 fondos y 1 serie dentro, 2 retiradas')
  })
})

describe('lo que dice una lista sin filas (RF-515)', () => {
  it('mientras carga, lo dice, y no afirma que no haya nada', () => {
    expect(seriesListNotice({ loading: true, error: null, count: 0 })).toBe(
      'Cargando la clasificación archivística…',
    )
  })

  /**
   * The oversight the section's other screens carry: they paint «todavía
   * no hay ninguno» also when the load FAILED, stating that the table is
   * empty when nobody knows. Here it keeps quiet, since the error already has its paragraph.
   */
  it('si la carga falló, no se afirma que la tabla esté vacía', () => {
    expect(seriesListNotice({ loading: false, error: 'no hay conexión', count: 0 })).toBeNull()
  })

  /** RF-515: the table is born empty on purpose, so this text is the whole screen. */
  it('vacía de verdad, explica qué es la clasificación y cómo se empieza', () => {
    const text = seriesListNotice({ loading: false, error: null, count: 0 })
    expect(text).toContain('fondos, series y subseries')
    expect(text).toContain('El primero se crea aquí arriba')
  })

  it('con filas, la lista habla por sí sola', () => {
    expect(seriesListNotice({ loading: false, error: null, count: 5 })).toBeNull()
  })
})
