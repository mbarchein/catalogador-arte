import { noteSegments } from './noteText'

/**
 * A free-text note, with its addresses shortened and clickable.
 *
 * Shortened so they fit (see `noteText.ts`) and clickable because a shortened
 * address that cannot be opened would be of no use: what is shown is a
 * summary and the whole destination goes in the link, so it can still be reached.
 */
export function NoteText({ text }: { text: string }) {
  return (
    // `whitespace-pre-line`: the note was written with its line breaks and that is how it
    // reads. `break-words` for whatever still does not fit once shortened.
    <span className="block whitespace-pre-line break-words">
      {noteSegments(text).map((segment, at) =>
        segment.href === null ? (
          <span key={at}>{segment.text}</span>
        ) : (
          <a
            key={at}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            // The whole address, for whoever hovers or uses a screen reader.
            title={segment.href}
            className="underline"
          >
            {segment.text}
          </a>
        ),
      )}
    </span>
  )
}

/**
 * A note's row inside a list of fields.
 *
 * It goes **with the other fields**, not in a block apart: it is one more field of the
 * record. What changes is that its content takes up the whole width instead of the
 * narrow column on the right, because it is the only one that carries paragraphs and
 * addresses. It is used inside a `<dl>`.
 */
export function NoteRow({ label, value }: { label: string; value: string }) {
  const written = value.trim()
  return (
    <div className="py-1.5">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {/* Nunca un hueco en silencio (RF-304): sin nota, se dice. */}
        {written === '' ? <span className="text-stone-400">Sin dato</span> : <NoteText text={written} />}
      </dd>
    </div>
  )
}
