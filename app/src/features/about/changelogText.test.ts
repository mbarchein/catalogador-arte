import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  groupChangelog,
  isHeadline,
  parseChangelog,
  parseSpans,
} from './changelogText'

/**
 * El registro de cambios leído dentro de la aplicación.
 *
 * Además de los casos de siempre, esta batería **lee el `CHANGELOG.md` de verdad** y
 * comprueba que sale entero. Es lo que protege de la avería silenciosa de esta pantalla:
 * un lector de Markdown mínimo no falla, se come cosas — una sección que desaparece, un
 * párrafo que se traga la viñeta siguiente— y eso no se nota mirando la pantalla, porque
 * lo que queda sigue leyéndose bien.
 */

const MARKDOWN = readFileSync(new URL('../../../../CHANGELOG.md', import.meta.url), 'utf8')

describe('parseSpans, el énfasis dentro de una línea', () => {
  it('el texto sin marcas sale de una pieza', () => {
    expect(parseSpans('Un texto normal')).toEqual([{ text: 'Un texto normal' }])
  })

  it('la negrita con la que empieza cada novedad', () => {
    expect(parseSpans('**El archivo tiene ficha** y se llega desde Tablas')).toEqual([
      { text: 'El archivo tiene ficha', strong: true },
      { text: ' y se llega desde Tablas' },
    ])
  })

  it('la negrita en medio, con texto a los dos lados', () => {
    expect(parseSpans('antes **medio** después')).toEqual([
      { text: 'antes ' },
      { text: 'medio', strong: true },
      { text: ' después' },
    ])
  })

  it('varias en la misma línea', () => {
    const spans = parseSpans('**uno** y **dos**')
    expect(spans.filter((s) => s.strong).map((s) => s.text)).toEqual(['uno', 'dos'])
  })

  it('y el código, que son los pocos nombres técnicos que quedan', () => {
    expect(parseSpans('la clave `catalogador.batch`')).toEqual([
      { text: 'la clave ' },
      { text: 'catalogador.batch', code: true },
    ])
  })

  it('un asterisco suelto no es negrita, y se lee tal cual', () => {
    // Y sobre todo: NO produce marcado. Esto devuelve datos y la pantalla los pinta con
    // elementos, así que no hay forma de que el fichero inyecte nada.
    expect(parseSpans('un * suelto')).toEqual([{ text: 'un * suelto' }])
    expect(parseSpans('2 ** 3')).toEqual([{ text: '2 ** 3' }])
  })

  it('una línea vacía no da ningún trozo', () => {
    expect(parseSpans('')).toEqual([])
  })
})

describe('parseChangelog, la estructura del fichero', () => {
  it('las dos clases de encabezado', () => {
    expect(parseChangelog('## 5 de agosto de 2026\n\n### Interfaz')).toEqual([
      { kind: 'date', text: '5 de agosto de 2026' },
      { kind: 'section', text: 'Interfaz' },
    ])
  })

  it('las líneas seguidas de un párrafo se unen', () => {
    // El fichero está ajustado a cien columnas para leerlo en un editor; respetar esos
    // cortes en un móvil daría un texto roto en escalera.
    const blocks = parseChangelog('Una frase que sigue\nen la línea de abajo.')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      spans: [{ text: 'Una frase que sigue en la línea de abajo.' }],
    })
  })

  it('una línea en blanco separa párrafos', () => {
    const blocks = parseChangelog('Primero.\n\nSegundo.')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
  })

  it('las viñetas se agrupan en una lista', () => {
    const blocks = parseChangelog('- uno\n- dos\n- tres')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('list')
    if (blocks[0]?.kind !== 'list') return
    expect(blocks[0].items).toHaveLength(3)
    expect(blocks[0].items[1]).toEqual([{ text: 'dos' }])
  })

  it('una viñeta de varias líneas se une, y no se parte en viñeta y párrafo', () => {
    // El fichero está ajustado a cien columnas, así que casi toda viñeta ocupa dos o tres
    // líneas. Sin esto, la primera era la viñeta y el resto salía como un párrafo suelto
    // detrás de la lista: el texto no se perdía, pero se leía descolgado.
    const blocks = parseChangelog('- una viñeta que sigue\n  en la línea de abajo\n- otra')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('list')
    if (blocks[0]?.kind !== 'list') return
    expect(blocks[0].items).toHaveLength(2)
    expect(blocks[0].items[0]).toEqual([{ text: 'una viñeta que sigue en la línea de abajo' }])
  })

  it('pero una línea SIN sangrar cierra la lista', () => {
    const blocks = parseChangelog('- una viñeta\nUn párrafo.')
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'paragraph'])
  })

  it('y sin lista abierta, una línea sangrada es un párrafo', () => {
    expect(parseChangelog('  texto sangrado')[0]?.kind).toBe('paragraph')
  })

  it('y una lista corta el párrafo de antes, no se lo traga', () => {
    // El fallo típico de un lector mínimo: la viñeta se pega al párrafo anterior y la
    // lista desaparece sin que nadie lo note.
    const blocks = parseChangelog('Un párrafo.\n- una viñeta')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list'])
  })

  it('un párrafo después de una lista tampoco se pierde', () => {
    const blocks = parseChangelog('- una viñeta\nUn párrafo.')
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'paragraph'])
  })

  it('un encabezado corta lo que hubiera abierto', () => {
    const blocks = parseChangelog('Un párrafo.\n### Sección')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'section'])
  })

  it('la regla horizontal no se pinta', () => {
    // El fichero separa entradas con `---`. En pantalla cada fecha ya viene en su caja
    // plegable, así que la regla no aporta nada y se leía como un «---» suelto.
    expect(parseChangelog('Uno.\n\n---\n\nDos.').map((b) => b.kind)).toEqual([
      'paragraph',
      'paragraph',
    ])
    expect(parseChangelog('---')).toEqual([])
  })

  it('un fichero vacío no da nada, y no revienta', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('\n\n   \n')).toEqual([])
  })
})

describe('groupChangelog, una entrada por fecha', () => {
  it('cada fecha se lleva lo suyo', () => {
    const entries = groupChangelog(
      parseChangelog('## Agosto\n\nUno.\n\n## Julio\n\nDos.\n\nTres.'),
    )
    expect(entries.map((e) => e.date)).toEqual(['Agosto', 'Julio'])
    expect(entries[0]?.blocks).toHaveLength(1)
    expect(entries[1]?.blocks).toHaveLength(2)
  })

  it('lo que venga antes de la primera fecha no se tira', () => {
    // Perder texto en silencio porque el fichero no empiece como se esperaba es peor que
    // enseñarlo con una etiqueta rara.
    const entries = groupChangelog(parseChangelog('Un prólogo.\n\n## Agosto\n\nUno.'))
    expect(entries.map((e) => e.date)).toEqual(['Sin fechar', 'Agosto'])
  })

  it('una fecha sin nada debajo no se ofrece', () => {
    // Sería un botón de desplegar que no abre nada.
    expect(groupChangelog(parseChangelog('## Agosto\n\n## Julio\n\nUno.'))).toHaveLength(1)
  })
})

describe('isHeadline, el titular de cada novedad', () => {
  it('un párrafo que es solo negrita es un titular', () => {
    // En el fichero cada novedad empieza con una línea que es solo `**su título**` y sigue
    // con sus viñetas. Pintarlo como párrafo corriente lo dejaría al mismo peso que el
    // texto que encabeza.
    const [block] = parseChangelog('**El archivo tiene ficha propia**')
    expect(isHeadline(block!)).toBe(true)
  })

  it('y con texto alrededor, no', () => {
    expect(isHeadline(parseChangelog('**Negrita** y más texto')[0]!)).toBe(false)
    expect(isHeadline(parseChangelog('texto y **negrita**')[0]!)).toBe(false)
    expect(isHeadline(parseChangelog('un párrafo normal')[0]!)).toBe(false)
  })

  it('ni un encabezado ni una lista lo son', () => {
    expect(isHeadline(parseChangelog('## Agosto')[0]!)).toBe(false)
    expect(isHeadline(parseChangelog('### Interfaz')[0]!)).toBe(false)
    expect(isHeadline(parseChangelog('- **negrita sola**')[0]!)).toBe(false)
  })
})

describe('el CHANGELOG.md de verdad', () => {
  const blocks = parseChangelog(MARKDOWN)
  const entries = groupChangelog(blocks)

  it('se lee entero: ni una palabra del fichero se queda fuera', () => {
    // La avería que este test existe para atrapar: un lector mínimo no falla, se COME
    // cosas —una sección que desaparece, un párrafo que se traga la viñeta siguiente— y
    // lo que queda se sigue leyendo bien, así que no se nota mirando la pantalla.
    //
    // Palabra por palabra y en orden, que es la única comprobación que no se puede
    // aprobar por casualidad: contar bloques dejaría pasar un párrafo entero perdido.
    const delFichero = MARKDOWN.split('\n')
      // Las reglas horizontales no se pintan, así que tampoco se cuentan.
      .filter((line) => !/^-{3,}$/.test(line.trim()))
      .map((line) => line.replace(/^#{2,3}\s+/, '').replace(/^\s*-\s+/, ''))
      .join(' ')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .split(/\s+/)
      .filter((word) => word !== '')

    // Los trozos de un párrafo son CONTIGUOS —`**aplicación**,` da «aplicación» y «,»—
    // así que dentro de un bloque se unen sin espacio, y solo los bloques se separan.
    const leidas = blocks
      .flatMap((block) => {
        if (block.kind === 'date' || block.kind === 'section') return [block.text]
        const join = (spans: { text: string }[]) => spans.map((span) => span.text).join('')
        return block.kind === 'list' ? block.items.map(join) : [join(block.spans)]
      })
      .join(' ')
      .split(/\s+/)
      .filter((word) => word !== '')

    expect(leidas).toEqual(delFichero)
  })

  it('tiene las fechas que tiene, y la primera es la más reciente', () => {
    const fechas = (MARKDOWN.match(/^## /gm) ?? []).length
    // «En marcha» es un encabezado de fecha más a efectos de estructura, y se lee igual.
    expect(entries).toHaveLength(fechas)
    expect(entries[0]?.date).toMatch(/de \d{4}$/)
  })

  it('las secciones de la primera entrada son las que el fichero declara', () => {
    const primera = entries[0]!
    const secciones = primera.blocks.filter((b) => b.kind === 'section')
    expect(secciones.length).toBeGreaterThan(0)
    for (const seccion of secciones) {
      expect(seccion.kind === 'section' && seccion.text.trim()).toBeTruthy()
    }
  })

  it('cada novedad es un titular seguido de viñetas, sin párrafos sueltos', () => {
    // La forma que se le ha dado al fichero: título en negrita y debajo una lista. Un
    // párrafo suelto entre medias rompería esa lectura, y es el descuido más fácil al
    // escribir una entrada nueva.
    const sueltos = blocks.filter(
      (block) => block.kind === 'paragraph' && !isHeadline(block),
    )
    expect(sueltos).toEqual([])
  })

  it('y ningún titular se queda sin sus viñetas', () => {
    const titulares = blocks.filter(isHeadline).length
    const listas = blocks.filter((block) => block.kind === 'list').length
    expect(titulares).toBeGreaterThan(100)
    expect(listas).toBe(titulares)
  })

  it('y ningún trozo sale con las marcas de Markdown dentro', () => {
    // Si algo se colara sin interpretar, se leería «**El archivo**» con los asteriscos.
    for (const block of blocks) {
      const spans = block.kind === 'paragraph' ? block.spans : block.kind === 'list' ? block.items.flat() : []
      for (const span of spans) {
        expect(span.text, span.text.slice(0, 60)).not.toContain('**')
      }
    }
  })
})
