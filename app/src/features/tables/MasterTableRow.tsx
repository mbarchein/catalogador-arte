import { useEffect, useRef, useState } from 'react'
import { BanIcon, NoIcon, PenIcon, YesIcon } from '../../components/ui'
import type { MasterEntry } from '../../lib/masterTables'

/**
 * One row of a master table: its name, and renaming and retiring it (RF-1106).
 *
 * Shared by the artwork types and the series screens because it is the same row,
 * not a similar one — down to the layout, which was corrected for a measured
 * reason (see the comment on the `li`). What is NOT shared is the two screens
 * around it: one lists flat, the other groups by fund and has to choose a fund to
 * add; forcing those two into one component would trade two readable files for one
 * with a switch in it.
 *
 * The rename field is state OF THE ROW and not of the page: the page has no other
 * use for it, and an identifier travelling up and back down only to be compared
 * with itself is plumbing. The visible difference is that opening a second rename
 * does not close the first, which is nobody's problem.
 */
export function MasterTableRow({
  entry,
  busy,
  retiredLabel,
  onRename,
  onSetActive,
}: {
  entry: MasterEntry
  busy: boolean
  /** «Retirado» or «Retirada»: only the screen knows which word this row is. */
  retiredLabel: string
  /** Answers whether it worked, which is when the field closes. */
  onRename: (name: string) => Promise<boolean>
  onSetActive: (active: boolean) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <li
      // El nombre se lleva su línea y las acciones van debajo, alineadas a la
      // derecha: con los botones al lado, un nombre como «Collage-Décollage
      // sobre tabla» se partía en varias líneas de dos palabras. El móvil es el
      // dispositivo principal.
      className={`card flex flex-wrap items-center gap-2 ${entry.active ? '' : 'opacity-60'}`}
    >
      {draft !== null ? (
        <>
          <input
            className="field basis-full"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Nuevo nombre de ${entry.name}`}
          />
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Guardar el nombre"
              title="Guardar"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                void onRename(draft).then((worked) => {
                  if (worked) setDraft(null)
                })
              }
            >
              <YesIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Dejar el nombre como estaba"
              title="Dejar el nombre como estaba"
              className="btn-secondary"
              onClick={() => setDraft(null)}
            >
              <NoIcon className="h-5 w-5" />
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="min-w-0 basis-full">
            <span className="block break-words font-medium">{entry.name}</span>
            {!entry.active && (
              <span className="block text-xs text-stone-500">{retiredLabel}</span>
            )}
          </span>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              aria-label={`Renombrar ${entry.name}`}
              title="Renombrar"
              className="btn-secondary"
              onClick={() => setDraft(entry.name)}
            >
              <PenIcon className="h-5 w-5" />
            </button>
            {entry.active ? (
              <button
                type="button"
                aria-label={`Retirar ${entry.name}`}
                title="Retirar"
                className="btn-secondary"
                disabled={busy}
                onClick={() => onSetActive(false)}
              >
                <BanIcon className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() => onSetActive(true)}
              >
                Recuperar
              </button>
            )}
          </div>
        </>
      )}
    </li>
  )
}

/**
 * Running one action of a maintenance screen: while it is in flight the buttons
 * are disabled, and what comes back — a sentence in Spanish, most of them written
 * by the database — is what the screen shows.
 *
 * Extracted because the three screens of the section share it verbatim, and
 * because it is where the convention lives: an action answers null when it
 * worked, and its own message when it did not.
 *
 * `failureRef` goes on the paragraph that shows the message, and the reason is
 * the phone. The message belongs at the top of the screen, and «retirar» gets
 * tapped at the bottom of a list two screens long: without scrolling it into
 * view, the answer «no se puede retirar un tipo que todavía usan obras» happens
 * off-screen and the screen looks like it ignored the tap.
 */
export function useTableAction() {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const failureRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    if (failure === null) return
    failureRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [failure])

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setFailure(null)
    const message = await action()
    setBusy(false)
    if (message) setFailure(message)
    return message === null
  }

  return { busy, failure, failureRef, run }
}
