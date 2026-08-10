/**
 * El registro de cambios, leído dentro de la aplicación y sin conexión (RF-1202).
 *
 * ── QUÉ ES ESTO Y QUÉ NO ────────────────────────────────────
 *
 * `CHANGELOG.md` se escribe para la catalogadora —así está decidido: la consecuencia
 * práctica y nada de nombres de tabla— y hasta ahora solo se leía en el repositorio, que
 * es justo donde ella no entra. Esto lo trae a la pantalla.
 *
 * Va **incrustado en la compilación** y no pedido a la red: se lee en un almacén sin
 * cobertura, y un «Novedades» que a veces no carga no se vuelve a abrir. Eso además lo
 * hace exacto — lo que se lee es lo que traía la versión que está corriendo, y no lo que
 * haya en la rama principal ahora mismo.
 *
 * ── UN LECTOR DE MARKDOWN MÍNIMO, Y POR QUÉ NO UNA BIBLIOTECA ──
 *
 * El fichero usa cuatro cosas: encabezados de fecha, encabezados de sección, párrafos y
 * cinco viñetas; más `**negrita**` y algún `código`. No hay tablas, ni citas, ni bloques
 * de código, ni enlaces. Traer un intérprete de Markdown entero —con su saneador, porque
 * pintar HTML sin sanear es abrir un agujero— para eso engorda lo que se descarga en un
 * almacén con mala cobertura, que es el mismo criterio por el que los iconos son SVG a
 * mano y no una biblioteca.
 *
 * Y lo importante: esto **no produce HTML**, produce datos. La pantalla los pinta con
 * elementos de React, así que no hay `dangerouslySetInnerHTML` en ninguna parte y un
 * asterisco de más en el fichero no puede convertirse en marcado.
 */

/** A piece of a paragraph's text, with its emphasis. */
export interface Span {
  text: string
  /** `**así**` in the file: the bold opening each item starts with. */
  strong?: boolean
  /** `` `así` ``: a technical name, one of the few left. */
  code?: boolean
}

export type ChangelogBlock =
  /** `## 5 de agosto de 2026` */
  | { kind: 'date'; text: string }
  /** `### Interfaz` */
  | { kind: 'section'; text: string }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; items: Span[][] }

/** A date with everything hanging off it, which is how it is read and how it folds. */
export interface ChangelogEntry {
  /** `5 de agosto de 2026`, or `Sin fechar` if the file began with no heading. */
  date: string
  blocks: ChangelogBlock[]
}

/**
 * Parte una línea en trozos con y sin énfasis.
 *
 * Una sola pasada con una expresión que alterna las dos marcas, y sin anidarlas: en el
 * fichero no hay negrita dentro de código ni al revés, y soportarlo sería inventar un
 * caso que no existe para poder equivocarse en él.
 */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = []
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    const at = match.index
    if (at > last) spans.push({ text: line.slice(last, at) })
    if (match[1] !== undefined) spans.push({ text: match[1], strong: true })
    else if (match[2] !== undefined) spans.push({ text: match[2], code: true })
    last = at + match[0].length
  }
  if (last < line.length) spans.push({ text: line.slice(last) })
  // An empty line yields no piece, and whoever paints it does not have to think about that.
  return spans
}

/**
 * Lee el fichero entero.
 *
 * Las líneas seguidas de un párrafo se unen con un espacio: el fichero está ajustado a
 * cien columnas para leerlo en un editor, y respetar esos cortes en una pantalla de móvil
 * daría un texto roto en escalera.
 */
export function parseChangelog(markdown: string): ChangelogBlock[] {
  const blocks: ChangelogBlock[] = []
  let paragraph: string[] = []
  let items: string[] = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', spans: parseSpans(paragraph.join(' ')) })
    paragraph = []
  }
  function flushList() {
    if (items.length === 0) return
    blocks.push({ kind: 'list', items: items.map(parseSpans) })
    items = []
  }
  function flush() {
    flushParagraph()
    flushList()
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      flush()
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'date', text: line.slice(3).trim() })
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      blocks.push({ kind: 'section', text: line.slice(4).trim() })
      continue
    }
    // The horizontal rule that separates entries in the file is not painted: here each date
    // already comes in its own collapsible box. Without this a stray «---» was read on screen.
    if (/^-{3,}$/.test(line.trim())) {
      flush()
      continue
    }
    // A bullet cuts off whatever paragraph was open.
    if (/^\s*-\s+/.test(line)) {
      flushParagraph()
      items.push(line.replace(/^\s*-\s+/, ''))
      continue
    }
    // Una línea SANGRADA con una lista abierta continúa la viñeta anterior. El fichero
    // está ajustado a cien columnas, así que casi toda viñeta ocupa dos o tres líneas;
    // sin esto, la primera línea era la viñeta y el resto salía como un párrafo suelto
    // detrás de la lista — el texto no se perdía, pero se leía descolgado.
    if (items.length > 0 && /^\s+\S/.test(raw)) {
      items[items.length - 1] += ` ${line.trim()}`
      continue
    }
    // And a normal line closes the list.
    flushList()
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

/**
 * Agrupa por fecha, que es como se lee: **la última abierta y las demás plegadas**.
 *
 * Son mil cuatrocientas líneas y quince meses de trabajo. Volcarlas de una vez en una
 * pantalla de móvil es un muro que no se lee, y lo que se viene a mirar casi siempre es
 * qué ha cambiado en la versión que se acaba de instalar — que es la primera.
 *
 * Lo que aparezca antes del primer encabezado de fecha no se tira: se agrupa bajo «Sin
 * fechar». Hoy no hay nada ahí, y perder texto en silencio porque el fichero no empiece
 * como se esperaba es peor que enseñarlo con una etiqueta rara.
 */
export function groupChangelog(blocks: readonly ChangelogBlock[]): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  for (const block of blocks) {
    if (block.kind === 'date') {
      entries.push({ date: block.text, blocks: [] })
      continue
    }
    if (entries.length === 0) entries.push({ date: 'Sin fechar', blocks: [] })
    entries[entries.length - 1]!.blocks.push(block)
  }
  // A date with nothing under it is not offered to expand: it would be a button that opens nothing.
  return entries.filter((entry) => entry.blocks.length > 0)
}

/**
 * ¿Es este párrafo el titular de una novedad?
 *
 * En el fichero, cada novedad empieza con una línea que es solo `**su título**` y sigue con sus
 * viñetas. Al leerlo sale un párrafo con un único trozo en negrita, y pintarlo como un párrafo
 * corriente lo deja al mismo peso que el texto que encabeza. Se detecta aquí, y no en la pantalla,
 * para poder comprobarlo sin navegador.
 */
export function isHeadline(block: ChangelogBlock): boolean {
  if (block.kind !== 'paragraph') return false
  return block.spans.length === 1 && block.spans[0]?.strong === true
}

/** What is read while it arrives, and if it does not. */
export const CHANGELOG_LOADING = 'Abriendo el registro de cambios…'

export const CHANGELOG_FAILED =
  'No se ha podido abrir el registro de cambios. Es una carencia de esta pantalla y no del ' +
  'catálogo: nada de lo que hay guardado depende de esto.'
