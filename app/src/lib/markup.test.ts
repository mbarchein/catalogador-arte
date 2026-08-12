import { describe, expect, it } from 'vitest'
import {
  hasMarkup,
  markupPlainText,
  parseMarkup,
  parseRuns,
  runsText,
  withMarkup,
  type MarkupBlock,
} from './markup'

/**
 * RF-1614, RF-1616: el marcado ligero de los textos largos.
 *
 * Lo que este fichero protege, en el orden en el que duele:
 *
 *   1. **que lo escrito hasta hoy siga significando lo mismo**. Los textos que ya
 *      están en el catálogo no llevan ninguna marca, y si mañana un asterisco suelto
 *      se comiera media frase, quien lo notaría es quien recibe el PDF;
 *   2. que las marcas se interpreten una sola vez y en un solo sitio, que es este;
 *   3. que los botones de la barra dejen el cursor donde estaba.
 */

const shape = (blocks: readonly MarkupBlock[]): string[] =>
  blocks.map((block) =>
    block.kind === 'LIST'
      ? `${block.ordered ? 'OL' : 'UL'}: ${block.items.map((item) => runsText(item)).join(' | ')}`
      : `${block.kind === 'HEADING' ? `H${block.level}` : 'P'}: ${runsText(block.runs)}`,
  )

describe('lo escrito sin marcas sigue siendo lo que era', () => {
  it('los párrafos se separan por línea en blanco, y las líneas sueltas se juntan', () => {
    // Es lo que hacía `paragraphsOf`: un salto en medio de una frase viene de cómo se
    // pegó el texto, no de una decisión.
    const text = 'Nació en Badajoz\ny se formó en Madrid.\n\nVolvió en 1971.'
    expect(shape(parseMarkup(text))).toEqual([
      'P: Nació en Badajoz y se formó en Madrid.',
      'P: Volvió en 1971.',
    ])
  })

  it('un asterisco sin pareja se imprime, en vez de comerse la frase', () => {
    expect(runsText(parseRuns('Óleo 92*73 cm'))).toBe('Óleo 92*73 cm')
    expect(parseRuns('Óleo 92*73 cm')).toHaveLength(1)
  })

  it('sin marcas, un texto no tiene marcas', () => {
    expect(hasMarkup('Nació en Badajoz.\n\nVolvió en 1971.')).toBe(false)
  })

  it('el texto vacío no da ningún bloque', () => {
    expect(parseMarkup('')).toEqual([])
    expect(parseMarkup('   \n\n  ')).toEqual([])
  })
})

describe('los títulos', () => {
  it('dos almohadillas es el grande y tres el pequeño', () => {
    expect(shape(parseMarkup('## Biografía\n### 1985-1990'))).toEqual(['H2: Biografía', 'H3: 1985-1990'])
  })

  it('de tres para abajo todo es el pequeño: más niveles nadie los sigue', () => {
    expect(shape(parseMarkup('#### Muy dentro\n##### Más'))).toEqual(['H3: Muy dentro', 'H3: Más'])
  })

  it('una almohadilla sola no es un título: es un párrafo que empieza por almohadilla', () => {
    expect(shape(parseMarkup('# Título de web'))).toEqual(['P: # Título de web'])
  })

  it('un título vacío no ocupa un renglón', () => {
    expect(parseMarkup('##   ')).toEqual([])
  })

  it('un título corta el párrafo que venía antes', () => {
    expect(shape(parseMarkup('Nació en Badajoz.\n## Exposiciones'))).toEqual([
      'P: Nació en Badajoz.',
      'H2: Exposiciones',
    ])
  })
})

describe('las listas', () => {
  it('con guion, con asterisco y con punto medio', () => {
    expect(shape(parseMarkup('- Uno\n* Dos\n• Tres'))).toEqual(['UL: Uno | Dos | Tres'])
  })

  it('numerada, y el número de la línea no se conserva: lo pone la maqueta', () => {
    expect(shape(parseMarkup('1. Uno\n2. Dos'))).toEqual(['OL: Uno | Dos'])
  })

  it('cambiar de tipo empieza otra lista, para no perder la numeración', () => {
    expect(shape(parseMarkup('- Uno\n1. Dos'))).toEqual(['UL: Uno', 'OL: Dos'])
  })

  it('una línea normal detrás de una lista la cierra', () => {
    expect(shape(parseMarkup('- Uno\nY además.'))).toEqual(['UL: Uno', 'P: Y además.'])
  })

  it('un año con punto no es una lista numerada… pero con punto y espacio sí', () => {
    // Es el precio de un marcado ligero, y se anota: «1985. Sala del Perímetro» se lee
    // como entrada de lista numerada. En una lista de exposiciones eso es justo lo que
    // se quiere, así que el precio sale a favor.
    expect(shape(parseMarkup('1985. Sala del Perímetro'))).toEqual(['OL: Sala del Perímetro'])
    expect(shape(parseMarkup('1985 · Sala del Perímetro'))).toEqual(['P: 1985 · Sala del Perímetro'])
  })
})

describe('la negrita y la cursiva', () => {
  it('dos asteriscos es negrita y uno cursiva', () => {
    expect(parseRuns('Nació en **Badajoz** y volvió *en 1971*')).toEqual([
      { text: 'Nació en ', bold: false, italic: false },
      { text: 'Badajoz', bold: true, italic: false },
      { text: ' y volvió ', bold: false, italic: false },
      { text: 'en 1971', bold: false, italic: true },
    ])
  })

  it('las dos a la vez', () => {
    expect(parseRuns('**Muy *muy* dicho**')).toEqual([
      { text: 'Muy ', bold: true, italic: false },
      { text: 'muy', bold: true, italic: true },
      { text: ' dicho', bold: true, italic: false },
    ])
  })

  it('el guion bajo también es cursiva', () => {
    expect(parseRuns('_así_')).toEqual([{ text: 'así', bold: false, italic: true }])
  })

  it('dentro de un título y de una lista, igual', () => {
    const blocks = parseMarkup('## **Óleos**\n- de **1965**')
    expect(blocks[0]).toEqual({
      kind: 'HEADING',
      level: 2,
      runs: [{ text: 'Óleos', bold: true, italic: false }],
    })
    if (blocks[1]?.kind === 'LIST') {
      expect(blocks[1].items[0]?.[1]).toEqual({ text: '1965', bold: true, italic: false })
    }
  })

  it('un texto con negrita sí lleva marcas', () => {
    expect(hasMarkup('Nació en **Badajoz**.')).toBe(true)
    expect(hasMarkup('- Una lista')).toBe(true)
  })
})

describe('el texto sin marcas, para contar y buscar', () => {
  it('devuelve una línea por bloque y sin los símbolos', () => {
    expect(markupPlainText('## Biografía\nNació en **Badajoz**.\n\n- Uno\n- Dos')).toBe(
      'Biografía\nNació en Badajoz.\nUno\nDos',
    )
  })
})

describe('los botones de la barra dejan el cursor donde estaba', () => {
  it('envuelven lo seleccionado y la selección sigue siendo el mismo texto', () => {
    const result = withMarkup('Nació en Badajoz.', { start: 9, end: 16 }, 'bold')
    expect(result.text).toBe('Nació en **Badajoz**.')
    expect(result.text.slice(result.start, result.end)).toBe('Badajoz')
  })

  it('sin nada seleccionado dejan el hueco con el cursor dentro', () => {
    const result = withMarkup('Nació en ', { start: 9, end: 9 }, 'italic')
    expect(result.text).toBe('Nació en **')
    expect(result.start).toBe(10)
    expect(result.start).toBe(result.end)
  })

  it('el título y la lista son de línea, y van al principio de la que toca', () => {
    const text = 'Biografía\nNació en Badajoz.'
    expect(withMarkup(text, { start: 12, end: 12 }, 'heading').text).toBe(
      'Biografía\n## Nació en Badajoz.',
    )
    expect(withMarkup(text, { start: 0, end: 0 }, 'bullet').text).toBe(
      '- Biografía\nNació en Badajoz.',
    )
  })

  it('y vuelven a pulsarse para quitarla', () => {
    const result = withMarkup('## Biografía', { start: 5, end: 5 }, 'heading')
    expect(result.text).toBe('Biografía')
    // El cursor sigue sobre la misma letra, tres caracteres más atrás.
    expect(result.start).toBe(2)
  })

  it('una selección fuera del texto no revienta ni pierde nada', () => {
    expect(withMarkup('abc', { start: 99, end: 120 }, 'bold').text).toBe('abc****')
  })
})
