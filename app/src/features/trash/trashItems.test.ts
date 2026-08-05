import { describe, expect, it } from 'vitest'
import {
  blockedCountText,
  kindCountText,
  restoreBlock,
  retiredByText,
  retiredTraceText,
  retiredWhenText,
  toTrashItems,
  trashTotalText,
  type TrashAuthor,
  type TrashItem,
  type TrashKindView,
} from './trashItems'
import { kindSpec, type TrashRow } from './trashKinds'

const NOBODY = new Map<string, TrashAuthor>()

describe('quién retiró algo se firma como en el historial (RF-902)', () => {
  /**
   * La escalera de respaldo la fijó el historial de cambios y esta pantalla la
   * reutiliza en vez de reescribirla: si la papelera y el historial firmaran a la
   * misma persona de dos maneras, una de las dos estaría mal. Estos tres casos son lo
   * que protege esa reutilización: si el historial cambiara la escalera, caerían aquí.
   */
  it('el nombre cuando lo hay', () => {
    expect(retiredByText({ name: 'Victoria Rotili', email: 'v@example.org' })).toBe(
      'Victoria Rotili',
    )
  })

  it('el correo cuando no hay nombre', () => {
    expect(retiredByText({ name: '', email: 'v@example.org' })).toBe('v@example.org')
    expect(retiredByText({ name: null, email: 'v@example.org' })).toBe('v@example.org')
  })

  it('«El sistema» cuando no hay ninguno de los dos, que es lo que escribe una migración', () => {
    expect(retiredByText(null)).toBe('El sistema')
    expect(retiredByText({ name: null, email: null })).toBe('El sistema')
  })
})

describe('cuándo se retiró, y el caso en que no consta', () => {
  const now = new Date('2026-08-04T18:00:00Z')

  it('hoy y ayer se nombran, porque es lo que se está mirando', () => {
    expect(retiredWhenText('2026-08-04T09:30:00Z', now)).toMatch(/^hoy a las /)
    expect(retiredWhenText('2026-08-03T09:30:00Z', now)).toMatch(/^ayer a las /)
  })

  it('más atrás, la fecha completa', () => {
    const text = retiredWhenText('2026-07-27T19:26:54Z', now)
    expect(text).toContain('julio')
    expect(text).toContain('2026')
    expect(text).toMatch(/^el /)
  })

  it('sin fecha se dice que no consta, en vez de inventar una o dejar el hueco', () => {
    // Medido: la base sella `deactivated_at` en cada baja, pero una fila trasladada
    // por una migración no la retiró nadie y llega nula.
    expect(retiredWhenText(null, now)).toBe('en una fecha que no consta')
    expect(retiredWhenText('   ', now)).toBe('en una fecha que no consta')
  })

  it('una fecha ilegible se dice, y no se pinta «Invalid Date»', () => {
    expect(retiredWhenText('esto no es una fecha', now)).toBe(
      'en una fecha que no se ha podido leer',
    )
  })
})

describe('la traza lleva el participio con el género de la cosa', () => {
  const now = new Date('2026-08-04T18:00:00Z')
  const line = (kind: TrashItem['kind']): TrashItem => ({
    kind,
    key: 'x',
    label: 'X',
    context: '',
    retiredAt: '2026-08-04T09:00:00Z',
    retiredBy: 'Victoria',
    blocked: null,
  })

  it('femenino: «Retirada por…»', () => {
    expect(retiredTraceText(line('images'), now)).toMatch(/^Retirada por Victoria hoy a las /)
    expect(retiredTraceText(line('artworks'), now)).toMatch(/^Retirada por /)
  })

  it('masculino: «Retirado por…»', () => {
    // El género es un dato de la clase y no una deducción de la terminación: de
    // deducirlo salen «la fotografía retirado» y «el eslabón retirada».
    expect(retiredTraceText(line('provenance_events'), now)).toMatch(/^Retirado por /)
    expect(retiredTraceText(line('external_links'), now)).toMatch(/^Retirado por /)
  })
})

describe('recuperar bajo un padre retirado se detiene ANTES de escribir', () => {
  /**
   * Medido contra la base local: se retira una obra, se restaura un eslabón suyo, y
   * el `update` afecta a UNA fila y contesta bien. La fila vuelve a estar activa y
   * sigue sin verse, porque lo que no se ve es la obra. Un botón que «funciona» y no
   * cambia nada de lo que la usuaria mira es peor que uno que se niega explicando.
   */
  const images = kindSpec('images')

  it('con la obra retirada, no se puede, y se dice qué recuperar primero', () => {
    const row: TrashRow = { image_id: 'RC-0001_v2', catalog_id: 'RC-0001', artworks: { active: false } }
    const block = restoreBlock(images, row, new Set())
    expect(block).not.toBeNull()
    expect(block).toContain('la obra (RC-0001)')
    expect(block).toContain('sigue en la papelera')
    expect(block).toContain('Recupera eso primero')
  })

  it('con la obra viva, se puede', () => {
    const row: TrashRow = { image_id: 'RC-0001_v2', catalog_id: 'RC-0001', artworks: { active: true } }
    expect(restoreBlock(images, row, new Set())).toBeNull()
  })

  it('sin padre incrustado no se bloquea: no saber no es lo mismo que estar retirado', () => {
    expect(restoreBlock(images, { image_id: 'x', artworks: null }, new Set())).toBeNull()
  })

  it('se nombran TODOS los padres que faltan, no solo el primero', () => {
    // Recuperar la obra para descubrir después que también falta la referencia es
    // hacer el mismo viaje dos veces.
    const citations = kindSpec('artwork_bibliography')
    const row: TrashRow = {
      id: '1',
      catalog_id: 'AR-0003',
      artworks: { active: false },
      bibliography: { title: 'Catálogo de 1985', active: false },
    }
    const block = restoreBlock(citations, row, new Set())
    expect(block).toContain('la obra (AR-0003)')
    expect(block).toContain('la referencia (Catálogo de 1985)')
    expect(block).toContain('siguen en la papelera')
  })

  it('con un solo padre, el verbo va en singular', () => {
    const row: TrashRow = { image_id: 'x', catalog_id: 'AR-0001', artworks: { active: false } }
    expect(restoreBlock(images, row, new Set())).toContain('sigue en la papelera')
  })
})

describe('las tablas anidadas sobre sí mismas se resuelven sin incrustado', () => {
  /**
   * Medido: PostgREST **no** incrusta una tabla en sí misma. Pedir
   * `physical_places?select=parent:physical_places!physical_places_parent_id_fkey(...)`
   * contesta `PGRST200`, «could not find a relationship». Así que el padre se reconoce
   * con lo único que ya se tiene sin pedir nada: el conjunto de claves retiradas de su
   * propia tabla.
   */
  const places = kindSpec('physical_places')

  it('si el padre está en la papelera, no se puede recuperar el hijo solo', () => {
    const block = restoreBlock(places, { id: 'hijo', parent_id: 'padre' }, new Set(['padre']))
    expect(block).not.toBeNull()
    expect(block).toContain('la ubicación que la contiene')
  })

  it('si el padre no está en la papelera, se puede', () => {
    expect(restoreBlock(places, { id: 'hijo', parent_id: 'padre' }, new Set(['hijo']))).toBeNull()
  })

  it('una ubicación raíz no tiene padre y no se bloquea nunca', () => {
    expect(restoreBlock(places, { id: 'raiz', parent_id: null }, new Set())).toBeNull()
  })

  it('lo mismo con la clasificación del archivo', () => {
    const series = kindSpec('archive_series')
    expect(restoreBlock(series, { id: 'h', parent_id: 'p' }, new Set(['p']))).not.toBeNull()
    expect(restoreBlock(series, { id: 'h', parent_id: 'p' }, new Set())).toBeNull()
  })
})

describe('las filas se convierten en líneas con su traza', () => {
  const authors = new Map<string, TrashAuthor>([
    ['u1', { name: 'Victoria Rotili', email: 'v@example.org' }],
  ])

  it('la línea trae qué es, de qué cuelga, cuándo y quién', () => {
    const items = toTrashItems(
      kindSpec('images'),
      [
        {
          image_id: 'RC-0001_v2',
          catalog_id: 'RC-0001',
          shot_type: 'GENERAL',
          deactivated_at: '2026-07-27T19:26:54.721305+00:00',
          deactivated_by: 'u1',
          artworks: { title: 'Flores', active: true },
        },
      ],
      authors,
    )
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.kind).toBe('images')
    expect(item.key).toBe('RC-0001_v2')
    expect(item.label).toBe('RC-0001_v2 · General')
    expect(item.context).toContain('De RC-0001')
    expect(item.retiredAt).toBe('2026-07-27T19:26:54.721305+00:00')
    expect(item.retiredBy).toBe('Victoria Rotili')
    expect(item.blocked).toBeNull()
  })

  it('un autor que ya no está en los perfiles no rompe la línea', () => {
    // La cuenta pudo borrarse desde el panel. Perder el nombre es aceptable; perder
    // la línea —y con ella la única forma de recuperar la fila— no lo es.
    const items = toTrashItems(
      kindSpec('images'),
      [{ image_id: 'x', deactivated_by: 'fantasma', deactivated_at: null }],
      NOBODY,
    )
    expect(items[0]!.retiredBy).toBe('El sistema')
    expect(items[0]!.retiredAt).toBeNull()
  })

  it('el conjunto de retiradas se calcula con las filas de la propia clase', () => {
    // Dos ubicaciones retiradas, una dentro de la otra: la de dentro no se puede
    // recuperar sola, y eso se sabe sin ninguna consulta más.
    const items = toTrashItems(
      kindSpec('physical_places'),
      [
        { id: 'estante', name: 'Estante 3', parent_id: 'almacen' },
        { id: 'almacen', name: 'Almacén', parent_id: null },
      ],
      NOBODY,
    )
    expect(items.find((item) => item.key === 'estante')!.blocked).not.toBeNull()
    expect(items.find((item) => item.key === 'almacen')!.blocked).toBeNull()
  })
})

describe('las cuentas se leen como frases y no como ceros', () => {
  const images = kindSpec('images')

  it('singular, plural y vacío', () => {
    expect(kindCountText(images, 1)).toBe('1 fotografía')
    expect(kindCountText(images, 3)).toBe('3 fotografías')
    // «0 fotografías» se lee como una respuesta sobre el catálogo, y no lo es.
    expect(kindCountText(images, 0)).toBe('Nada retirado')
    expect(kindCountText(images, -1)).toBe('Nada retirado')
  })

  const view = (items: readonly TrashItem[], truncated = false): TrashKindView => ({
    spec: images,
    items,
    truncated,
    error: null,
  })
  const item = (blocked: string | null = null): TrashItem => ({
    kind: 'images',
    key: Math.random().toString(),
    label: 'X',
    context: '',
    retiredAt: null,
    retiredBy: 'El sistema',
    blocked,
  })

  it('el total dice de paso que nada se ha borrado de verdad', () => {
    expect(trashTotalText([view([item(), item()])])).toContain('2 cosas retiradas')
    expect(trashTotalText([view([item(), item()])])).toContain('nada se ha borrado de verdad')
    expect(trashTotalText([view([item()])])).toContain('1 cosa retirada')
  })

  it('una papelera vacía se explica, no se deja en blanco', () => {
    expect(trashTotalText([view([])])).toBe('No hay nada en la papelera.')
    expect(trashTotalText([])).toBe('No hay nada en la papelera.')
  })

  it('si alguna clase venía cortada, el total dice «o más» en vez de mentir', () => {
    expect(trashTotalText([view([item(), item()], true)])).toContain('2 o más cosas retiradas')
  })

  it('las bloqueadas se cuentan arriba, para no leer treinta avisos iguales', () => {
    expect(blockedCountText([view([item(), item('porque sí')])])).toContain('Una de ellas')
    expect(blockedCountText([view([item('a'), item('b'), item()])])).toContain('2 de ellas')
  })

  it('sin nada bloqueado no se dice nada, que es mejor que decir «0 bloqueadas»', () => {
    expect(blockedCountText([view([item(), item()])])).toBeNull()
    expect(blockedCountText([])).toBeNull()
  })
})
