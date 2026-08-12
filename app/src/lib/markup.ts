/**
 * El marcado ligero de los textos largos del catálogo: la biografía, el currículum,
 * los párrafos de un dossier y la presentación de su portada (RF-1616, RF-1614).
 *
 * ── POR QUÉ MARCAS Y NO UN EDITOR ───────────────────────────
 *
 * Lo que hay que resolver es pegar una biografía de una página web y que se
 * conserven los títulos, las listas y las negritas. Se puede guardar HTML y pintarlo,
 * y es lo que se ha descartado: sin servidor, las políticas RLS son todo el
 * perímetro, y un `<img onerror>` guardado en una biografía se ejecutaría en la
 * sesión de quien la abriera. Con marcas, **lo que se guarda es texto** y no hay
 * ningún camino por el que se convierta en HTML: la pantalla pinta componentes y el
 * PDF dibuja letras.
 *
 * Y hace falta parsear de todas formas: el PDF se dibuja a mano con pdf-lib, así que
 * un `<h2>` guardado tendría que traducirse a un tamaño y un salto igualmente. La
 * traducción se hace **una vez, al pegar** —ahí sí se lee el HTML del portapapeles,
 * en `markupPaste.ts`— y lo que se guarda ya son marcas.
 *
 * ── EL SUBCONJUNTO, Y NADA MÁS ──────────────────────────────
 *
 *   `## Título`        un título
 *   `### Subtítulo`    un título más pequeño
 *   `- entrada`        una lista (también `*` y `•`)
 *   `1. entrada`       una lista numerada
 *   `**negrita**`      negrita
 *   `*cursiva*`        cursiva (también `_cursiva_`)
 *   línea en blanco    separa bloques
 *
 * No hay enlaces, imágenes, tablas ni citas: un dossier se imprime, y un enlace en
 * papel es una dirección larga que nadie teclea. Tampoco hay escapes —`\*` no
 * significa nada—, porque el texto que se pega no los trae y el que se escribe a mano
 * no los necesita.
 *
 * **Todo lo escrito hasta hoy sigue valiendo**: un texto sin ninguna marca es una
 * sucesión de párrafos, que es exactamente lo que era.
 *
 * Puro y sin DOM: se verifica en node, y es el único sitio donde se decide qué
 * significa cada marca.
 */

/** Un trozo de línea con su estilo. La negrita y la cursiva se pueden dar juntas. */
export interface MarkupRun {
  text: string
  bold: boolean
  italic: boolean
}

/** Un bloque: lo que en el papel empieza en un renglón nuevo. */
export type MarkupBlock =
  | { kind: 'HEADING'; level: 2 | 3; runs: MarkupRun[] }
  | { kind: 'PARAGRAPH'; runs: MarkupRun[] }
  | { kind: 'LIST'; ordered: boolean; items: MarkupRun[][] }

// El espacio detrás de las almohadillas es opcional: una línea que solo lleva `##`
// —al pegar de una web pasa— no es un párrafo que diga «##», es un título vacío, y un
// título vacío no ocupa renglón.
const HEADING = /^(#{2,6})\s*(.*)$/
const BULLET = /^[-*•]\s+(.*)$/
const NUMBERED = /^\d+[.)]\s+(.*)$/

/**
 * Los bloques de un texto con marcas.
 *
 * Las líneas de un mismo párrafo se juntan con un espacio, como se juntaban antes de
 * que hubiera marcas: un salto de línea suelto en medio de una frase viene de cómo se
 * pegó el texto y no de una decisión de quien escribe. Para separar, línea en blanco.
 */
export function parseMarkup(text: string): MarkupBlock[] {
  const blocks: MarkupBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'PARAGRAPH', runs: parseRuns(paragraph.join(' ')) })
    paragraph = []
  }
  const flushList = () => {
    if (list === null) return
    blocks.push({
      kind: 'LIST',
      ordered: list.ordered,
      items: list.items.map((item) => parseRuns(item)),
    })
    list = null
  }
  const flush = () => {
    flushParagraph()
    flushList()
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()

    if (line === '') {
      flush()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      const hashes = heading[1] ?? '##'
      const body = (heading[2] ?? '').trim()
      // Solo hay dos tamaños: más niveles en un dossier de doce hojas es una jerarquía
      // que nadie sigue, así que de `###` para abajo todo es el pequeño.
      if (body !== '') blocks.push({ kind: 'HEADING', level: hashes.length === 2 ? 2 : 3, runs: parseRuns(body) })
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      const item = ((bullet ?? numbered)?.[1] ?? '').trim()
      const ordered = numbered !== null
      flushParagraph()
      // Una lista se corta si cambia de tipo: «- a» y «1. b» seguidas son dos listas,
      // y pintarlas como una sola perdería la numeración.
      if (list !== null && list.ordered !== ordered) flushList()
      if (list === null) list = { ordered, items: [] }
      if (item !== '') list.items.push(item)
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flush()
  return blocks
}

/**
 * Los trozos de una línea, con la negrita y la cursiva resueltas.
 *
 * Se recorre una sola vez y de izquierda a derecha, tratando `**` y `*` como
 * interruptores. Un asterisco sin pareja **es un asterisco** y se imprime: en un texto
 * pegado de una web aparecen solos, y comerse la mitad de la frase buscando el cierre
 * es peor que dejar el símbolo a la vista.
 */
export function parseRuns(line: string): MarkupRun[] {
  const runs: MarkupRun[] = []
  let bold = false
  let italic = false
  let current = ''

  const push = () => {
    if (current === '') return
    runs.push({ text: current, bold, italic })
    current = ''
  }

  for (let i = 0; i < line.length; i += 1) {
    const two = line.slice(i, i + 2)
    if (two === '**' && closes(line, i + 2, '**', bold)) {
      push()
      bold = !bold
      i += 1
      continue
    }
    const one = line[i]
    if ((one === '*' || one === '_') && closes(line, i + 1, one, italic)) {
      push()
      italic = !italic
      continue
    }
    current += one ?? ''
  }
  push()

  // Sin marcas, un solo trozo: es el caso de casi todo lo escrito hasta hoy.
  return runs
}

/**
 * Si una marca abierta en `from` tiene cierre más adelante. Ya abierta, cierra
 * siempre — el interruptor de vuelta no necesita comprobar nada.
 */
function closes(line: string, from: number, mark: string, open: boolean): boolean {
  if (open) return true
  return line.indexOf(mark, from) !== -1
}

/** El texto sin marcas, para contar, buscar o resumir. */
export function markupPlainText(text: string): string {
  return parseMarkup(text)
    .flatMap((block) =>
      block.kind === 'LIST'
        ? block.items.map((item) => runsText(item))
        : [runsText(block.runs)],
    )
    .join('\n')
}

/** El texto de una fila de trozos. */
export function runsText(runs: readonly MarkupRun[]): string {
  return runs.map((run) => run.text).join('')
}

/** Si un texto lleva alguna marca, que es lo que decide si la ayuda se enseña. */
export function hasMarkup(text: string): boolean {
  return parseMarkup(text).some(
    (block) =>
      block.kind !== 'PARAGRAPH' ||
      block.runs.some((run) => run.bold || run.italic),
  )
}

/**
 * El texto con una marca puesta alrededor de un trozo, o de toda la línea.
 *
 * Es lo que hacen los botones de la barra: envolver lo seleccionado, y si no hay nada
 * seleccionado dejar el hueco entre las dos marcas con el cursor dentro. Devuelve
 * también dónde queda la selección, porque un botón que escribe y pierde el sitio
 * obliga a volver a buscarlo con el dedo.
 */
export function withMarkup(
  text: string,
  selection: { start: number; end: number },
  mark: 'bold' | 'italic' | 'heading' | 'bullet',
): { text: string; start: number; end: number } {
  const start = Math.max(0, Math.min(selection.start, text.length))
  const end = Math.max(start, Math.min(selection.end, text.length))

  if (mark === 'bold' || mark === 'italic') {
    const wrapper = mark === 'bold' ? '**' : '*'
    const chosen = text.slice(start, end)
    const next = `${text.slice(0, start)}${wrapper}${chosen}${wrapper}${text.slice(end)}`
    return {
      text: next,
      start: start + wrapper.length,
      end: start + wrapper.length + chosen.length,
    }
  }

  // Título y lista son de línea: la marca va al principio de la línea donde está el
  // cursor, y si ya la lleva se quita — un botón que solo pone obliga a borrar a mano.
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndIndex = text.indexOf('\n', start)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const line = text.slice(lineStart, lineEnd)
  const prefix = mark === 'heading' ? '## ' : '- '
  const already = line.startsWith(prefix)
  const bare = already ? line.slice(prefix.length) : line
  const next = `${text.slice(0, lineStart)}${already ? bare : prefix + bare}${text.slice(lineEnd)}`
  const shift = already ? -prefix.length : prefix.length
  return {
    text: next,
    start: Math.max(lineStart, start + shift),
    end: Math.max(lineStart, end + shift),
  }
}
