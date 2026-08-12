/**
 * Pegar una página web y quedarse con su forma: el HTML del portapapeles convertido a
 * las marcas de `markup.ts`.
 *
 * Es el único sitio de la aplicación que lee HTML, y **lo lee para tirarlo**: entra un
 * `text/html` del portapapeles y sale texto con marcas, que es lo que se guarda. Nada
 * de lo que entra aquí llega al DOM ni a la base — ni una etiqueta, ni un atributo, ni
 * un `style`—, y por eso pegar una biografía de una web no es una puerta de entrada.
 *
 * ── LO QUE SE CONSERVA, Y POR QUÉ TAN POCO ──────────────────
 *
 * Títulos, listas, negritas y cursivas. Lo demás se cae, y no es pereza:
 *
 *   · **tipografías, tamaños y colores** son de la web de donde se copia y en un
 *     dossier serían el estilo de otro pegado dentro del propio;
 *   · **los enlaces** dejan su texto: en papel una dirección larga no la teclea nadie;
 *   · **las imágenes** no se pueden traer — están en otro servidor y el dossier es un
 *     fichero que se manda por correo;
 *   · **las tablas** se convierten en líneas con sus celdas separadas por `·`, que es
 *     lo que suele ser una tabla de exposiciones cuando se lee.
 *
 * En el ordenador el portapapeles trae el HTML y esto funciona. **En el móvil casi
 * siempre llega solo texto plano**, y entonces se pega tal cual: es una limitación del
 * teléfono y no algo que se pueda arreglar aquí.
 *
 * Necesita DOM —`DOMParser` hace el trabajo sucio de decodificar entidades y cerrar
 * etiquetas—, así que se verifica en jsdom y vive aparte de `markup.ts`, que es puro.
 *
 * ── DOS PORTAPAPELES, Y EL DEL MÓVIL ES OTRO ────────────────
 *
 * El evento de pegar trae lo que el navegador quiera darle, y **en el móvil casi
 * siempre da solo texto plano**: medido, pegando una biografía desde el teléfono.
 * Lo que sí puede leer el HTML es la API asíncrona del portapapeles
 * —`navigator.clipboard.read()`—, que existe justamente para esto y que **exige un toque
 * explícito** y a veces un permiso, así que no puede ir colgada del evento de pegar: va
 * en un botón, «Pegar con formato». Cuando ni por ahí hay HTML, el portapapeles del
 * sistema no lo tiene y no hay nada que la aplicación pueda recuperar: entonces se dice.
 */

/** Las etiquetas que dicen algo, y qué marca les corresponde. */
const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
const BLOCKS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'ASIDE',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'PRE',
  'TR',
  'DT',
  'DD',
])
const DROPPED = new Set(['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'SVG'])
const BOLD = new Set(['STRONG', 'B'])
const ITALIC = new Set(['EM', 'I'])

/**
 * El texto con marcas que sale de un HTML pegado, o cadena vacía si no hay nada.
 *
 * @param html El `text/html` del portapapeles, tal cual.
 */
export function markupFromHtml(html: string): string {
  if (html.trim() === '') return ''
  const document = new DOMParser().parseFromString(html, 'text/html')
  const lines: string[] = []
  // La línea en curso se acumula aparte: dentro de un párrafo puede haber cinco
  // etiquetas de estilo, y cada una no es un renglón.
  let current = ''

  const flush = () => {
    const line = current.replace(/[ \t]+/g, ' ').trim()
    if (line !== '') lines.push(line)
    current = ''
  }

  const walk = (node: Node, style: { bold: boolean; italic: boolean }): void => {
    if (node.nodeType === 3) {
      // Un salto de línea del HTML es espacio, no renglón: los renglones los marcan
      // las etiquetas.
      current += (node.nodeValue ?? '').replace(/\s+/g, ' ')
      return
    }
    if (node.nodeType !== 1) return
    const element = node as Element
    const tag = element.tagName.toUpperCase()

    if (DROPPED.has(tag)) return

    if (tag === 'BR') {
      // Un `<br>` corta el bloque y no solo la línea: es con lo que están escritas las
      // listas de exposiciones de media web —«1985 · Sala<br>1986 · Museo»—, y unir dos
      // entradas en un párrafo es perder el dato. Una frase partida por un `<br>` sale
      // como dos párrafos, que es el precio y es raro.
      flush()
      lines.push('')
      return
    }

    if (HEADINGS.has(tag)) {
      flush()
      // `h1` y `h2` son el título grande y de `h3` para abajo el pequeño: es la misma
      // reducción a dos niveles que hace `parseMarkup`, y aquí se aplica al pegar para
      // que lo guardado ya sea lo que se va a leer.
      const prefix = tag === 'H1' || tag === 'H2' ? '## ' : '### '
      walkChildren(element, style)
      const text = current.replace(/[ \t]+/g, ' ').trim()
      current = ''
      if (text !== '') lines.push('', `${prefix}${text}`)
      return
    }

    if (tag === 'LI') {
      flush()
      const ordered = element.parentElement?.tagName.toUpperCase() === 'OL'
      walkChildren(element, style)
      const text = current.replace(/[ \t]+/g, ' ').trim()
      current = ''
      if (text !== '') lines.push(`${ordered ? '1. ' : '- '}${text}`)
      return
    }

    if (tag === 'UL' || tag === 'OL') {
      flush()
      lines.push('')
      walkChildren(element, style)
      lines.push('')
      return
    }

    if (tag === 'TD' || tag === 'TH') {
      // Las celdas de una fila se separan con el punto medio que ya usa el catálogo
      // para las series de datos de una línea.
      if (current.trim() !== '') current += ' · '
      walkChildren(element, style)
      return
    }

    if (BLOCKS.has(tag)) {
      flush()
      lines.push('')
      walkChildren(element, style)
      flush()
      return
    }

    if (BOLD.has(tag) || ITALIC.has(tag)) {
      const mark = BOLD.has(tag) ? '**' : '*'
      const already = BOLD.has(tag) ? style.bold : style.italic
      // Anidada dentro de otra igual no se vuelve a marcar: `<b><b>x</b></b>` daría
      // `****x****`, que se lee como negrita abierta y cerrada dos veces.
      if (already) {
        walkChildren(element, style)
        return
      }
      const before = current
      current = ''
      walkChildren(element, BOLD.has(tag) ? { ...style, bold: true } : { ...style, italic: true })
      const inner = current.trim()
      const trailing = current.endsWith(' ') && inner !== '' ? ' ' : ''
      current = inner === '' ? before : `${before}${mark}${inner}${mark}${trailing}`
      return
    }

    walkChildren(element, style)
  }

  const walkChildren = (element: Element, style: { bold: boolean; italic: boolean }) => {
    for (const child of Array.from(element.childNodes)) walk(child, style)
  }

  walk(document.body, { bold: false, italic: false })
  flush()

  // Dos líneas en blanco seguidas separan igual que una: lo que sobra viene de los
  // `div` dentro de `div` con los que está hecha cualquier página.
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Lo que hay que pegar: las marcas si el portapapeles trae HTML, y el texto plano si
 * no (que es lo normal en un teléfono).
 *
 * Devuelve null cuando no hay nada que pegar, para que quien llama deje pasar el
 * pegado del navegador en vez de comérselo. Y dice **si venía con formato**, porque
 * pegar una biografía entera y que llegue en plano no es un fallo que deba adivinarse:
 * se dice en una línea, con lo que se puede hacer.
 */
export function pastedMarkup(data: {
  html: string
  text: string
}): { text: string; formatted: boolean } | null {
  const fromHtml = markupFromHtml(data.html)
  if (fromHtml !== '') return { text: fromHtml, formatted: true }
  const plain = data.text.trim()
  return plain === '' ? null : { text: data.text, formatted: false }
}

/**
 * El aviso de un pegado sin formato, o null cuando no hay nada que decir.
 *
 * Solo cuando lo pegado **parece un documento** —varias líneas o un párrafo largo—:
 * pegar una fecha o un nombre en plano es lo normal y avisar de eso sería ruido en cada
 * toque. Y solo dice lo que se puede hacer, que es lo único que justifica una frase.
 */
export function plainPasteNotice(text: string): string | null {
  const looksLikeDocument = text.includes('\n') || text.trim().length > 160
  if (!looksLikeDocument) return null
  return 'Pegado sin formato: el portapapeles no traía títulos ni listas. Prueba «Pegar con formato».'
}
