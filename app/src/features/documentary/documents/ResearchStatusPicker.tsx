import { useState } from 'react'
import { BottomSheet } from '../../../components/ui'
import type { ResearchStatus } from '../../../lib/types'
import type { DocumentarySectionSpec } from '../sections'
import { researchStatusOptions } from './researchStatusChoice'

/**
 * Declaring how far the research on this block has got (RF-218).
 *
 * A bottom sheet and not a dropdown for the reason `BottomSheet` exists at all:
 * the choices have to appear under the thumb, and each of these four needs a line
 * of explanation — they are decisions taken a few times a month, not daily, and
 * «Investigado, sin resultados» against «Investigación completa» is exactly the
 * pair nobody remembers the difference between without reading it.
 *
 * Nothing here decides anything: which options exist, which one is refused and
 * what each of them means come from `researchStatusOptions`, which is pure and
 * verified. The refusal that arrives from the database — another session may add
 * a row between the render and the tap — is shown verbatim, in the Spanish the
 * database itself wrote.
 *
 * It lives in this folder and not one above because the folder above has no owner
 * while four blocks are being built at once. It is written to move up unchanged:
 * it takes the specification of any block and knows nothing about documents.
 */
export function ResearchStatusPicker({
  spec,
  status,
  count,
  onChange,
}: {
  spec: DocumentarySectionSpec
  /** What is declared today. Null when it could not be read. */
  status: ResearchStatus | null
  /** How many rows the block holds: it decides which option the database would refuse. */
  count: number
  /** Answers null when it worked, and the database's own message when it did not. */
  onChange: (value: ResearchStatus) => Promise<string | null>
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
                className={`flex w-full min-h-touch flex-col items-start gap-0.5 rounded-lg border-2 p-3
                            text-left transition disabled:opacity-60 ${
                              active
                                ? 'border-stone-800 bg-stone-100'
                                : 'border-stone-200 bg-white'
                            }`}
              >
                <span className="text-sm font-medium">
                  {saving === option.value ? 'Guardando…' : option.text}
                </span>
                {/* The reason an option is off goes right here and not in a
                    message after the tap: a button that exists to answer no is
                    worse than no button. */}
                <span className="text-xs text-stone-500">{option.hint}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </BottomSheet>
    </>
  )
}
