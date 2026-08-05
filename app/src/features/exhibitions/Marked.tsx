/**
 * A search result with the letters the query matched emphasized.
 *
 * The matching of this project is by subsequence — the letters need not sit
 * together — so without seeing WHICH letters matched, an option looks arbitrary:
 * typing «mbb» and getting «Museo de Bellas Artes de Badajoz» reads as a bug until
 * the four letters light up.
 *
 * It is the third copy of this ten-line component and the reason is the same one
 * `ExhibitionPicker` wrote down: the original lives inside `ui.tsx` and is not
 * exported. Copying ten lines of JSX beats exporting a private helper of a file
 * this piece does not own — and there is nothing here to keep in step, because the
 * indices come from `fuzzyRankBy`, which IS shared.
 */
export function Marked({ text, indices }: { text: string; indices: readonly number[] }) {
  if (indices.length === 0) return <>{text}</>
  const marked = new Set(indices)
  return (
    <>
      {[...text].map((character, index) =>
        marked.has(index) ? (
          <strong key={index} className="font-semibold underline decoration-stone-400">
            {character}
          </strong>
        ) : (
          <span key={index}>{character}</span>
        ),
      )}
    </>
  )
}
