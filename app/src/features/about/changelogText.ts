/**
 * The change log, read inside the application and offline (RF-1202).
 *
 * ── WHAT THIS IS AND WHAT IT IS NOT ─────────────────────────
 *
 * `CHANGELOG.md` is written for the cataloguer —that is settled: the practical
 * consequence and no table names— and until now it could only be read in the repository, which
 * is precisely where she does not go. This brings it to the screen.
 *
 * It goes **embedded in the build** and is not asked of the network: it is read in a storeroom with no
 * coverage, and a «Novedades» that sometimes does not load is never opened again. That also
 * makes it exact — what is read is what the running version brought, and not what
 * happens to be on the main branch right now.
 *
 * ── A MINIMAL MARKDOWN READER, AND WHY NOT A LIBRARY ────────
 *
 * The file uses four things: date headings, section headings, paragraphs and
 * five bullets; plus `**bold**` and the odd bit of `code`. There are no tables, no quotations, no code
 * blocks, no links. Bringing in a whole Markdown interpreter —with its sanitiser, because
 * painting unsanitised HTML is opening a hole— for that fattens what is downloaded in a
 * storeroom with poor coverage, which is the same criterion by which the icons are hand-written
 * SVG and not a library.
 *
 * And the important part: this **does not produce HTML**, it produces data. The screen paints them with
 * React elements, so there is no `dangerouslySetInnerHTML` anywhere and an
 * extra asterisk in the file cannot turn into markup.
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
 * Splits a line into pieces with and without emphasis.
 *
 * A single pass with an expression alternating the two marks, and without nesting them: in the
 * file there is no bold inside code or the other way round, and supporting it would be inventing a
 * case that does not exist in order to get it wrong.
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
 * Reads the whole file.
 *
 * Consecutive lines of a paragraph are joined with a space: the file is wrapped to
 * a hundred columns to be read in an editor, and respecting those breaks on a phone screen
 * would give a text broken into a staircase.
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
    // An INDENTED line with an open list continues the previous bullet. The file
    // is wrapped to a hundred columns, so almost every bullet takes two or three lines;
    // without this, the first line was the bullet and the rest came out as a stray paragraph
    // after the list — the text was not lost, but it read detached.
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
 * Groups by date, which is how it is read: **the last one open and the rest folded**.
 *
 * It is one thousand four hundred lines and fifteen months of work. Dumping them all at once on a
 * phone screen is a wall nobody reads, and what people come to look at almost always is
 * what has changed in the version just installed — which is the first one.
 *
 * Whatever appears before the first date heading is not thrown away: it is grouped under «Sin
 * fechar». There is nothing there today, and losing text in silence because the file does not start
 * as expected is worse than showing it with an odd label.
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
 * Is this paragraph a new feature's headline?
 *
 * In the file, each new feature starts with a line that is only `**its title**` and continues with its
 * bullets. On reading it a paragraph comes out with a single bold piece, and painting it as an ordinary
 * paragraph leaves it at the same weight as the text it heads. It is detected here, and not in the screen,
 * so it can be checked without a browser.
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
