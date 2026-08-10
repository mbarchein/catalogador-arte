import { useEffect, useState } from 'react'
import {
  CHANGELOG_FAILED,
  CHANGELOG_LOADING,
  groupChangelog,
  isHeadline,
  parseChangelog,
  type ChangelogBlock,
  type ChangelogEntry,
  type Span,
} from './changelogText'

/**
 * The change log, inside the application and offline (RF-1202).
 *
 * ── HOW IT GETS HERE ────────────────────────────────────────
 *
 * `CHANGELOG.md` is embedded at build time, with `?raw`, and **it is asked for only on opening this
 * section**: it is ninety-five kilobytes of text and this is a screen visited
 * once in a while, so it cannot go in what is downloaded on entering. Being one more piece
 * of the build, the service worker stores it with the rest of the shell and
 * it stays available with no coverage — which is the reason for bringing it here and not asking the network for it.
 *
 * ── FOLDED, EXCEPT THE FIRST ────────────────────────────────
 *
 * Fifteen months of work on a phone screen are a wall nobody reads. What people
 * come to look at almost always is what the version just installed brings, so
 * the most recent entry comes out open and the rest wait to be touched.
 */
export function ChangelogSection() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    // Vite resolves the `?raw`: the file comes in as text, in a chunk of its own.
    import('../../../../CHANGELOG.md?raw')
      .then((module) => {
        if (!alive) return
        setEntries(groupChangelog(parseChangelog(module.default)))
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="card mb-3">
      <h2 className="mb-3 font-medium">Novedades</h2>

      {failed ? (
        <p role="alert" className="text-sm text-stone-700">
          {CHANGELOG_FAILED}
        </p>
      ) : entries === null ? (
        <p className="text-sm text-stone-500">{CHANGELOG_LOADING}</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry, index) => (
            <Entry key={entry.date} entry={entry} open={index === 0} />
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * A date with its own below it.
 *
 * The browser's `<details>` and not state of our own: it knows how to fold on its own, announces it properly to a
 * screen reader and the browser's finder searches inside what is closed.
 */
function Entry({ entry, open }: { entry: ChangelogEntry; open: boolean }) {
  return (
    <li>
      <details open={open} className="rounded-lg border border-stone-200">
        <summary className="min-h-touch cursor-pointer list-none px-3 py-2 text-sm font-medium marker:content-none">
          {entry.date}
        </summary>
        <div className="border-t border-stone-100 px-3 py-2">
          {entry.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </div>
      </details>
    </li>
  )
}

function Block({ block }: { block: ChangelogBlock }) {
  if (block.kind === 'date') {
    // None arrive: `groupChangelog` keeps them as the heading of each entry.
    return <h3 className="mt-3 font-medium">{block.text}</h3>
  }
  if (block.kind === 'section') {
    return (
      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500 first:mt-0">
        {block.text}
      </h3>
    )
  }
  if (block.kind === 'list') {
    return (
      <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
        {block.items.map((item, index) => (
          <li key={index}>
            <Spans spans={item} />
          </li>
        ))}
      </ul>
    )
  }
  // The headline of each item: a paragraph that is bold and nothing else. It is painted as a
  // heading so the bullets that follow read as hanging off it and not at its own level.
  if (isHeadline(block)) {
    return <h4 className="mb-1 mt-3 text-sm font-medium text-stone-900 first:mt-0">{block.spans[0]!.text}</h4>
  }
  return (
    <p className="mb-2 text-sm text-stone-700">
      <Spans spans={block.spans} />
    </p>
  )
}

/**
 * A line's pieces, painted with elements.
 *
 * No `dangerouslySetInnerHTML`: what arrives from `changelogText` is data, and this way an
 * extra asterisk in the file cannot turn into markup.
 */
function Spans({ spans }: { spans: readonly Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.strong) return <strong key={index}>{span.text}</strong>
        if (span.code) {
          return (
            <code key={index} className="rounded bg-stone-100 px-1 font-mono text-xs">
              {span.text}
            </code>
          )
        }
        return <span key={index}>{span.text}</span>
      })}
    </>
  )
}
