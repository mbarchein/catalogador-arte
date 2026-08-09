import { useState } from 'react'
import { BottomSheet, YesIcon } from '../../../components/ui'
import type { ResearchStatus } from '../../../lib/types'
import { researchStatusOptions } from './researchStatusOptions'

/**
 * Declaring how far the research on a block has got (RF-218).
 *
 * A sheet and not four chips inline, because this is the control that makes an
 * empty block mean something and it needs its explanations visible: the whole
 * point of the four states is that «Sin revisar» and «Investigado, sin
 * resultados» look identical on screen and mean opposite things, and a chooser
 * that shows only the four labels invites picking the wrong one.
 *
 * The option the database would refuse is listed disabled with its reason — see
 * `researchStatusOptions`, where that rule lives and gets verified. If the
 * database refuses anyway, its own sentence is shown verbatim: it is written in
 * Spanish for this very screen, and rewriting it here would be a second copy of a
 * rule that lives next to the data.
 */
export function ResearchStatusSheet({
  open,
  onClose,
  current,
  count,
  onChoose,
}: {
  open: boolean
  onClose: () => void
  current: ResearchStatus
  /** How many rows the block holds: it decides whether «sin resultados» can be declared. */
  count: number
  onChoose: (value: ResearchStatus) => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(value: ResearchStatus) {
    setBusy(true)
    setError(null)
    const failure = await onChoose(value)
    setBusy(false)
    if (failure !== null) {
      setError(failure)
      return
    }
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Investigación bibliográfica">
      <p className="mb-3 text-sm text-stone-600">
        Dice si alguien ha buscado, no qué hay. Vacío sin revisar no es inédito.
      </p>
      <div role="radiogroup" className="space-y-1">
        {researchStatusOptions(current, count).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.current}
            disabled={busy || (!option.available && !option.current)}
            onClick={() => void choose(option.value)}
            className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
              option.current
                ? 'bg-stone-800 text-white'
                : option.available
                  ? 'text-stone-800 active:bg-stone-100'
                  : 'text-stone-400'
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.text}</span>
              <span
                className={`block text-xs ${
                  option.current
                    ? 'text-stone-300'
                    : option.available
                      ? 'text-stone-500'
                      : 'text-stone-400'
                }`}
              >
                {option.hint}
              </span>
            </span>
            {option.current && <YesIcon className="h-5 w-5 shrink-0" />}
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </BottomSheet>
  )
}
