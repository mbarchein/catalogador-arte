// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markupFromHtml, pastedMarkup } from './markupPaste'
import { parseMarkup, runsText } from './markup'

/**
 * RF-1616: pegar una biografía de una página web y quedarse con su forma.
 *
 * El HTML de una web real no es el del ejemplo de un manual: son `div` dentro de `div`,
 * `span` con estilo, saltos de línea en medio de las frases y entidades. Lo que se
 * comprueba aquí es que de todo eso salen **títulos, listas y negritas** y nada más —ni
 * una etiqueta, ni un atributo—, porque lo que se guarda es texto y ese es el motivo de
 * haber elegido marcas y no HTML.
 *
 * En jsdom porque `DOMParser` hace el trabajo sucio: decodificar entidades y cerrar las
 * etiquetas que la web haya dejado abiertas.
 */

/** La forma del resultado, leída con el intérprete de verdad. */
const shape = (html: string): string[] =>
  parseMarkup(markupFromHtml(html)).map((block) =>
    block.kind === 'LIST'
      ? `${block.ordered ? 'OL' : 'UL'}: ${block.items.map((item) => runsText(item)).join(' | ')}`
      : `${block.kind === 'HEADING' ? `H${block.level}` : 'P'}: ${runsText(block.runs)}`,
  )

describe('lo que se conserva de una página pegada', () => {
  it('los títulos, con dos niveles y no seis', () => {
    expect(shape('<h1>Biografía</h1><h2>Y exposiciones</h2><h3>1985</h3><h4>Sala</h4>')).toEqual([
      'H2: Biografía',
      'H2: Y exposiciones',
      'H3: 1985',
      'H3: Sala',
    ])
  })

  it('los párrafos, con los saltos de línea del código convertidos en espacios', () => {
    const html = '<p>Nació en Badajoz\n   y se formó\nen Madrid.</p><p>Volvió en 1971.</p>'
    expect(shape(html)).toEqual(['P: Nació en Badajoz y se formó en Madrid.', 'P: Volvió en 1971.'])
  })

  it('las listas, y la numerada se distingue de la de puntos', () => {
    expect(shape('<ul><li>Uno</li><li>Dos</li></ul><ol><li>Tres</li></ol>')).toEqual([
      'UL: Uno | Dos',
      'OL: Tres',
    ])
  })

  it('la negrita y la cursiva, también anidadas', () => {
    const blocks = parseMarkup(markupFromHtml('<p>Nació en <strong>Badajoz</strong> y <em>volvió</em></p>'))
    if (blocks[0]?.kind === 'PARAGRAPH') {
      expect(blocks[0].runs).toEqual([
        { text: 'Nació en ', bold: false, italic: false },
        { text: 'Badajoz', bold: true, italic: false },
        { text: ' y ', bold: false, italic: false },
        { text: 'volvió', bold: false, italic: true },
      ])
    }
  })

  it('una negrita dentro de otra no se marca dos veces', () => {
    // `****x****` se leería como negrita abierta y cerrada, y el texto saldría sin ella.
    expect(markupFromHtml('<p><b>Muy <b>dicho</b></b></p>')).toBe('**Muy dicho**')
  })

  it('un salto de línea de la web separa entradas, y no las junta en un párrafo', () => {
    // Media web escribe así las listas de exposiciones. Unir dos entradas en un párrafo
    // sería perder el dato.
    expect(shape('<p>1985 · Sala<br>1986 · Museo</p>')).toEqual([
      'P: 1985 · Sala',
      'P: 1986 · Museo',
    ])
  })
})

describe('lo que se cae, que es el motivo de no guardar HTML', () => {
  it('las etiquetas, los estilos y las clases: no sale ni una', () => {
    const html =
      '<div class="rt" style="font-family:Georgia"><span style="color:red">Nació</span> en Badajoz</div>'
    const result = markupFromHtml(html)
    expect(result).toBe('Nació en Badajoz')
    expect(result).not.toContain('<')
    expect(result).not.toContain('style')
  })

  it('los guiones de un script no llegan a ninguna parte', () => {
    // Es la razón de fondo: sin servidor, las políticas RLS son todo el perímetro, y un
    // HTML guardado se ejecutaría en la sesión de quien abriera la biografía.
    const result = markupFromHtml('<p>Antes</p><script>alert(1)</script><style>p{}</style><p>Después</p>')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('p{}')
    expect(shape('<p>Antes</p><script>alert(1)</script><p>Después</p>')).toEqual([
      'P: Antes',
      'P: Después',
    ])
  })

  it('un enlace deja su texto y se lleva la dirección', () => {
    expect(markupFromHtml('<p>Ver <a href="https://ejemplo.test/muy/largo">la muestra</a></p>')).toBe(
      'Ver la muestra',
    )
  })

  it('una imagen no deja nada', () => {
    expect(markupFromHtml('<p>Retrato <img src="https://ejemplo.test/foto.jpg" alt="Retrato"></p>')).toBe(
      'Retrato',
    )
  })

  it('una tabla se lee como líneas con las celdas separadas', () => {
    const html = '<table><tr><td>1985</td><td>Sala del Perímetro</td></tr><tr><td>1986</td><td>Museo</td></tr></table>'
    expect(shape(html)).toEqual(['P: 1985 · Sala del Perímetro', 'P: 1986 · Museo'])
  })

  it('las entidades llegan como el carácter que son', () => {
    expect(markupFromHtml('<p>Bada&#106;oz&nbsp;y M&aacute;laga</p>')).toBe('Badajoz y Málaga')
  })
})

describe('de dónde se pega', () => {
  it('con HTML manda el HTML', () => {
    expect(pastedMarkup({ html: '<h2>Biografía</h2>', text: 'Biografía' })).toBe('## Biografía')
  })

  it('sin HTML se pega el texto plano tal cual, que es lo que llega de un teléfono', () => {
    expect(pastedMarkup({ html: '', text: 'Nació en Badajoz.' })).toBe('Nació en Badajoz.')
  })

  it('con un HTML que no dice nada, tampoco se pierde el texto plano', () => {
    expect(pastedMarkup({ html: '<div><span> </span></div>', text: 'Nació en Badajoz.' })).toBe(
      'Nació en Badajoz.',
    )
  })

  it('sin nada que pegar devuelve null, y quien llama deja pasar el pegado del navegador', () => {
    expect(pastedMarkup({ html: '', text: '' })).toBeNull()
  })
})
