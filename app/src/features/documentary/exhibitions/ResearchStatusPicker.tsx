import { useState } from 'react'
import { BottomSheet, RadioList } from '../../../components/ui'
import type { ResearchStatus } from '../../../lib/types'
import type { DocumentarySectionSpec } from '../sections'
import {
  researchStatusButtonText,
  researchStatusOptions,
  statusChangeBlocked,
} from './researchStatusChoice'

/**
 * The control that declares how far the research on a documentary block has got
 * (RF-218).
 *
 * A bottom sheet and not four chips in the block: the four states need their
 * description to be chosen correctly — the whole point of the pair
 * «Investigado, sin resultados» / «Investigación completa» is invisible without
 * it — and four descriptions inline would bury the rows the block is about. In a
 * sheet they arrive under the thumb, which is where a decision gets made on a
 * phone.
 *
 * Nothing is decided here: which options exist, which one is refused and what the
 * refusal says come from `researchStatusChoice.ts`, where the battery reaches
 * them. What is here is the fold, the sheet and the round trip.
 *
 * Like the module beside it, this component is not about exhibitions. It lives in
 * this folder because the exhibition history was built first; it takes a spec and
 * serves the four blocks that carry a status, and it should move up to
 * `features/documentary/` the day the second one needs it.
 */
export function ResearchStatusPicker({
  spec,
  status,
  count,
  onChange,
}: {
  spec: DocumentarySectionSpec
  /** Null when the artwork's documentary row could not be read. */
  status: ResearchStatus | null
  /** Rows in the block right now: it decides which state can be declared. */
  count: number
  /** Answers null when it worked, and the database's own message when it did not. */
  onChange: (value: ResearchStatus) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Unreadable state, unchangeable state. Offering the control over a status
  // nobody could read would let the cataloger overwrite a value she has not
  // seen — and a research state is a claim about somebody's afternoon in an
  // archive, not a checkbox.
  if (status === null) {
    return (
      <p className="text-xs text-stone-500">
        {researchStatusButtonText(null)}. No se puede cambiar sin haberlo leído.
      </p>
    )
  }

  async function choose(value: ResearchStatus) {
    const blocked = statusChangeBlocked(spec, value, count)
    if (blocked !== null) {
      setNotice(blocked)
      return
    }
    setSaving(true)
    const failure = await onChange(value)
    setSaving(false)
    if (failure !== null) {
      // Verbatim: the database refuses this in Spanish and explains why, and a
      // second version of that sentence written here is a second version of the
      // rule.
      setNotice(failure)
      return
    }
    setNotice(null)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice(null)
          setOpen(true)
        }}
        className="btn-secondary min-h-touch w-full text-sm"
      >
        {researchStatusButtonText(status)}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${spec.title}: estado de la investigación`}
      >
        <p className="mb-2 text-xs text-stone-600">
          Lo que se declara aquí es sobre la investigación, no sobre la obra: un bloque vacío que
          nadie ha mirado y uno que se ha buscado sin resultado se leen distinto en la ficha.
        </p>
        <RadioList
          options={researchStatusOptions(spec, count).map((option) => ({
            value: option.value,
            text: option.text,
            hint: option.hint,
          }))}
          value={status}
          onChange={(value) => void choose(value)}
        />
        {saving && <p className="mt-2 text-xs text-stone-500">Guardando…</p>}
        {notice !== null && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            {notice}
          </p>
        )}
      </BottomSheet>
    </>
  )
}
