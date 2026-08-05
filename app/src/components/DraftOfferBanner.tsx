import { DRAFT_DISCARD_LABEL, DRAFT_RESTORE_LABEL } from './draftStore'
import type { DraftOffer } from './useFormDraft'

/**
 * La oferta de recuperar lo que se dejó a medias, arriba de la hoja.
 *
 * Un componente y no tres líneas copiadas en cada formulario: son seis hojas y la que se
 * quedara con una redacción vieja sería la que confunde. Y va **arriba**, no al pie: la
 * decisión es qué hacer con el formulario, así que se toma antes de mirarlo — al pie
 * aparecería después de haber empezado a teclear encima.
 *
 * El caso desfasado se pinta distinto **y a propósito en ámbar y no en rojo**: no es un
 * error, es un aviso de que hay que mirar antes de guardar. Rojo diría «algo va mal» sobre
 * algo que está bien y que además hay que leer con calma.
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
