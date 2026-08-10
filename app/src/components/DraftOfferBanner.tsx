import { DRAFT_DISCARD_LABEL, DRAFT_RESTORE_LABEL } from './draftStore'
import type { DraftOffer } from './useFormDraft'

/**
 * The offer to recover what was left half-done, at the top of the sheet.
 *
 * A component and not three lines copied into every form: there are six sheets and the one
 * left with an old wording would be the one that confuses. And it goes **at the top**, not at the
 * foot: the decision is what to do with the form, so it is taken before looking at it — at the foot
 * it would appear after having started to type over it.
 *
 * The stale case is painted differently **and deliberately in amber and not in red**: it is not an
 * error, it is a warning that one has to look before saving. Red would say «something is wrong» about
 * something that is fine and that also has to be read calmly.
 */
export function DraftOfferBanner<T>({
  offer,
  onAccept,
  onDiscard,
}: {
  offer: DraftOffer<T> | null
  onAccept: () => void
  onDiscard: () => void
}) {
  if (offer === null) return null
  return (
    <div
      role="status"
      className={`mb-3 rounded-lg p-3 ${offer.stale ? 'bg-amber-50' : 'bg-stone-100'}`}
    >
      <p className={`text-sm ${offer.stale ? 'text-amber-900' : 'text-stone-700'}`}>{offer.text}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {/* Recuperar primero: es lo que se viene a hacer. Y en lo desfasado también, que
            esconderlo detrás sería perder el trabajo por segunda vez — lo que cambia ahí
            es la frase de arriba, que dice qué mirar. */}
        <button type="button" onClick={onAccept} className="btn min-h-touch bg-stone-800 text-white">
          {DRAFT_RESTORE_LABEL}
        </button>
        <button type="button" onClick={onDiscard} className="btn-secondary min-h-touch">
          {DRAFT_DISCARD_LABEL}
        </button>
      </div>
    </div>
  )
}
