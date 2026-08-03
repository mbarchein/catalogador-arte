import { useState } from 'react'
import { DownloadFailure } from '../../lib/download'
import type { ShotTypeValue } from '../../lib/types'
import type { EditColumns } from '../../lib/imageEdits'
import {
  ARCHIVE_STEP_TEXT,
  archiveDownloads,
  runArchiveDownload,
  type ArchiveDownloadStep,
  type ArchiveKind,
  type ArchiveOffer,
  type CorrectedCopyColumns,
} from './archiveDownloads'

/**
 * Taking a photograph out of the application: the original of the archive and the
 * full-resolution copy with the corrections already applied (RF-411, RF-420).
 *
 * ── Por qué está plegado ──
 * Behind a `<details>` and closed by default, because the record is a view and because
 * of the megabytes: nothing is signed, asked for or paid for on mobile data until
 * somebody opens this and taps. What is on show is the sentence that explains the
 * difference between the two files, which is the part that has to be readable without
 * committing to anything.
 *
 * ── Sin guardián de rol, a propósito ──
 * The Reader downloads both. That is the whole of RF-411 — sending the original to a
 * print shop or a curator is precisely their use case — and the signing function says
 * the same: an editing role to upload, a valid session to download. Any `if` about
 * roles added here would take away a function the requirement grants.
 *
 * What this file decides: nothing. Which downloads exist, what each one is called,
 * what the file will be named and every sentence come from `archiveDownloads.ts`,
 * which is pure and tested. Here there is a button, a wait and a message.
 */
export function PhotoDownloads({
  catalogId,
  row,
  detail,
  detailsFailed,
  ordinal,
}: {
  catalogId: string
  row: Partial<EditColumns> & {
    image_id: string
    master_path: string | null
    shot_type: ShotTypeValue
  }
  detail: CorrectedCopyColumns | undefined
  detailsFailed: boolean
  ordinal?: number
}) {
  const [busy, setBusy] = useState<{ kind: ArchiveKind; step: ArchiveDownloadStep } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { offers, notes } = archiveDownloads({ catalogId, row, detail, detailsFailed, ordinal })

  async function start(offer: ArchiveOffer) {
    // Both are cleared before starting: a red strip left over from a previous attempt
    // on top of a download that has just worked is the screen contradicting itself.
    setError(null)
    setNotice(null)
    setBusy({ kind: offer.kind, step: 'signing' })
    try {
      setNotice(
        await runArchiveDownload(offer, {
          onStep: (step) => setBusy({ kind: offer.kind, step }),
        }),
      )
    } catch (cause) {
      // `DownloadFailure` already carries the sentence to show; anything else is a bug
      // and gets shown as it is rather than swallowed, because a mute button is worse.
      setError(
        cause instanceof DownloadFailure || cause instanceof Error
          ? cause.message
          : String(cause),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5">
      <summary className="min-h-touch cursor-pointer py-1.5 text-xs font-medium text-stone-700">
        Descargar esta fotografía
      </summary>

      <p className="mt-1 text-xs text-stone-600">
        El original es el fichero tal como salió de la cámara; la copia corregida es el mismo
        tamaño con el giro, el recorte y el color ya aplicados, y es la que se manda a imprimir.
      </p>

      <div className="mt-2 space-y-2">
        {offers.map((offer) => (
          <div key={offer.kind}>
            <button
              type="button"
              // Disabled while ANY of the two is running: two taps used to fire two
              // invocations of the signing function and two downloads of the same
              // megabytes, and on a slow connection two taps is what you do when
              // nothing seems to be happening.
              disabled={busy !== null}
              onClick={() => void start(offer)}
              className="btn-secondary w-full text-sm disabled:opacity-60"
            >
              {busy?.kind === offer.kind ? ARCHIVE_STEP_TEXT[busy.step] : offer.label}
            </button>
            <p className="mt-1 text-xs text-stone-500">{offer.hint}</p>
          </div>
        ))}
      </div>

      {/* Never a gap: the copy that is not on offer says why it is not there. */}
      {notes.map((note) => (
        <p key={note} className="mt-2 text-xs text-stone-500">
          {note}
        </p>
      ))}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-xs text-stone-700">
          {notice}
        </p>
      )}
    </details>
  )
}
