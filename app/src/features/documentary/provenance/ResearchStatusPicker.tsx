import { useState } from 'react'
import { BottomSheet, YesIcon } from '../../../components/ui'
import type { ResearchStatus } from '../../../lib/types'
import type { DocumentarySectionSpec } from '../sections'
import { researchStatusOptions } from './researchStatusChoice'

/**
 * Declaring how far the research on this block has got (RF-218).
 *
 * A bottom sheet and not a dropdown, for the reason `BottomSheet` exists: the
 * choices go under the thumb, and each of these four needs a line of explanation
 * — they are decisions taken a few times a month, and «Investigado, sin
 * resultados» against «Investigación completa» is exactly the pair nobody
 * remembers the difference between without reading it.
 *
 * Nothing here decides anything: which options exist, which one is refused and
 * what each means come from `researchStatusOptions`. The refusal that arrives
 * from the database — another session may add a link between the render and the
 * tap — is shown verbatim, in the Spanish the database itself wrote.
 *
 * It lives in this folder and not one above because the folder above has no owner
 * while four blocks are being built at once, and three sibling copies of this
 * file exist right now. It takes the specification of any block and knows nothing
 * about provenance: merging the four is a delete, not a rewrite.
 */
export function ResearchStatusPicker({
  spec,
  status,
  count,
  onChange,
  disabled = false,
}: {
  spec: DocumentarySectionSpec
  /** What is declared today. Null when it could not be read. */
  status: ResearchStatus | null
  /** How many rows the block holds: it decides which option the database would refuse. */
  count: number
  /** Answers null when it worked, and the database's own message when it did not. */
  onChange: (value: ResearchStatus) => Promise<string | null>
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<ResearchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const options = researchStatusOptions(spec, count)

  async function choose(value: ResearchStatus) {
    setSaving(value)
    setError(null)
    const failure = await onChange(value)
    setSaving(null)
    if (failure === null) {
      setOpen(false)
      return
    }
    setError(failure)
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="btn-secondary w-full text-sm"
      >
        Declarar el estado de la investigación
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${spec.title}: estado de la investigación`}
      >
        <div role="radiogroup" aria-label="Estado de la investigación" className="space-y-2">
          {options.map((option) => {
            const active = option.value === status
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={option.disabled || saving !== null}
                onClick={() => void choose(option.value)}
                className={`flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition
                            disabled:opacity-60 ${
                              active ? 'border-stone-800 bg-stone-100' : 'border-stone-200 bg-white'
                            }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {option.text}
                    {saving === option.value && ' · guardando…'}
                  </span>
                  <span className="block text-xs text-stone-500">{option.hint}</span>
                </span>
                {active && <YesIcon className="mt-0.5 h-5 w-5 shrink-0" />}
              </button>
            )
          })}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No se ha podido cambiar el estado: {error}
          </p>
        )}
      </BottomSheet>
    </>
  )
}
