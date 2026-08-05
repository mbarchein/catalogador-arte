import { Link } from 'react-router'
import { ImageIcon } from '../../components/ui'
import {
  participantCountText,
  participantEntries,
  participantsNotice,
  type ParticipantRow,
} from './participatingArtworks'

/**
 * «Obras participantes» (RF-505): which artworks of the catalogue were in this
 * show.
 *
 * **Read-only, and not because the delivery ran out of room.** A participation is
 * a fact about an ARTWORK — «esta obra estuvo en esta muestra, con el número 12
 * bis» — and it is written from the artwork's record, where the state of its
 * exhibition research is kept coherent: the database refuses a participation in a
 * history declared «investigado, sin resultados», and that refusal only makes
 * sense next to the control that changes it. Writing the same row from two screens
 * with two sets of rules is how one of them ends up letting it through.
 *
 * So this block reads, counts and links. And linking IS the point: the code of each
 * artwork is the only link to its record (RF-604), and from there the participation
 * is corrected or retired.
 *
 * **The rule of the project applies and this block is the exception that proves
 * it**: reading a record changes nothing, writing lives in the edit zone — and an
 * action that does NOT modify stays in the view. Following a link is exactly that,
 * so this block is painted in both modes and takes no `writable`.
 */
export function ParticipatingArtworks({
  rows,
  thumbnails,
  loading,
  error,
  cataloguePublished,
}: {
  rows: readonly ParticipantRow[]
  /** Signed URL of each artwork's thumbnail, by `catalog_id`. Absent means «no photograph». */
  thumbnails: Record<string, string>
  loading: boolean
  error: string | null
  /** The show consta con catálogo publicado. Decides whether a missing number is a gap. */
  cataloguePublished: boolean
}) {
  const entries = participantEntries(rows, { cataloguePublished })
  const notice = participantsNotice({ loading, error, count: entries.length })

  return (
    <section className="mt-4">
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 font-semibold">
        Obras participantes
        {/* El recuento en la cabecera, porque es lo único que se lee antes de
            decidir si se recorre la lista. El vacío NO es un cero: es una frase,
            y la escribe `participantsNotice`. */}
        {entries.length > 0 && (
          <span className="text-sm font-normal text-stone-500">
            {participantCountText(entries.length)}
          </span>
        )}
      </h2>

      {error && (
        <p role="alert" className="card mb-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Nunca un hueco (RF-304), y sobre todo nunca un «ninguna obra participó»:
          que el bloque esté vacío dice que nadie ha enlazado todavía, no que la
          muestra no llevara obra del fondo. */}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const thumbnail = thumbnails[entry.catalogId]
          return (
            <li key={entry.id}>
              <Link
                to={`/artwork/${entry.catalogId}`}
                className={`card flex items-start gap-3 active:bg-stone-50 ${
                  entry.retirementNotice === null ? '' : 'opacity-60'
                }`}
              >
                {/* La miniatura pide RF-505. Sin fotografía, un marco honesto y
                    no una imagen rota: la obra existe igual y su código es lo que
                    lleva a la ficha. */}
                {thumbnail === undefined ? (
                  <span
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400"
                  >
                    <ImageIcon className="h-6 w-6" />
                  </span>
                ) : (
                  <img
                    src={thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                )}

                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{entry.catalogId}</span>
                  <span className="block break-words text-sm">{entry.title}</span>
                  <span className="block text-xs text-stone-500">{entry.subtitle}</span>
                  {/* El número de catálogo de la muestra es dato citable y va
                      aparte de la nota (RF-513): «cat. 12 bis» se cita tal cual. */}
                  {entry.catalogueNumber !== null && (
                    <span className="mt-0.5 block text-xs text-stone-600">
                      {entry.catalogueNumber}
                    </span>
                  )}
                  {entry.note !== '' && (
                    <span className="mt-0.5 block break-words text-xs text-stone-600">
                      {entry.note}
                    </span>
                  )}
                  {entry.retirementNotice !== null && (
                    <span className="mt-0.5 block break-words text-xs text-amber-800">
                      {entry.retirementNotice}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
