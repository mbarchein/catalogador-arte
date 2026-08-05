import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TriState } from '../lib/types'
import { filterVocabulary, findEquivalent, fuzzyRank, searchableOptions } from '../lib/vocabulary'
import {
  discardText,
  DISCARD_KEEP_LABEL,
  DISCARD_LEAVE_LABEL,
  DISCARD_TITLE,
} from './sheetExit'
import { useCloseOnBack } from './useCloseOnBack'
import type { SheetGuard } from './useSheetGuard'

// ── Icons ────────────────────────────────────────────────────
// Inline SVG, no library: these are five icons and pulling a whole dependency
// for that bloats the bundle downloaded in a storage room with poor coverage.
// `currentColor` so they inherit the button color and work in any state.

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function YesIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function NoIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function UnreviewedIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4" />
      <path d="M12 18h.01" />
    </svg>
  )
}

export function MinusIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function PlusIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...svg} strokeWidth={2} className={className}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function PenIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function TagIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <path d="M7.5 7.5h.01" />
    </svg>
  )
}

export function BanIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.7 5.7 12.6 12.6" />
    </svg>
  )
}

export function GripIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
    </svg>
  )
}

export function FunnelIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M3 5h18l-7 8v4.5l-4 2.5v-7L3 5Z" />
    </svg>
  )
}

export function ChevronLeftIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function ImageIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L8 19" />
    </svg>
  )
}

export function ExpandIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}

export function CameraIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

/** Counter-clockwise quarter turn: the arrow closes to the left. */
export function RotateLeftIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 5v5h5" />
      <path d="M4.5 10a8 8 0 1 1 1.6 6.9" />
    </svg>
  )
}

/** Clockwise quarter turn. */
export function RotateRightIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M20 5v5h-5" />
      <path d="M19.5 10a8 8 0 1 0-1.6 6.9" />
    </svg>
  )
}

export function CropIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M6 3v13a2 2 0 0 0 2 2h13" />
      <path d="M3 6h13a2 2 0 0 1 2 2v13" />
    </svg>
  )
}

/** A painting photographed from one side: the rectangle comes out a trapezium. */
export function PerspectiveIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M5 4.5 19 7v10L5 19.5z" />
    </svg>
  )
}

/** The detector doing the work for you: a wand, with its spark. */
export function WandIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 20 15 9" />
      <path d="m17.5 6.5-2-2" />
      <path d="M18 3v3M21 8h-3M19.5 11.5 21 13" />
    </svg>
  )
}

/** Back to the beginning: an arrow returning to where everything started. */
export function RevertIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M5 4v16" />
      <path d="M20 12H10" />
      <path d="M14 7l-5 5 5 5" />
    </svg>
  )
}

/** Four arrows out of a centre: drag me in any direction. */
export function MoveIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  )
}

export function EllipsisIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  )
}

// ── Three-state selector with icons ──────────────────────────

const STATES: { value: TriState; label: string; Icon: typeof YesIcon }[] = [
  { value: 'YES', label: 'Sí', Icon: YesIcon },
  { value: 'NO', label: 'No', Icon: NoIcon },
  { value: 'UNREVIEWED', label: 'Sin revisar', Icon: UnreviewedIcon },
]

/**
 * The three values in sight and one tap away, instead of a dropdown that
 * demands opening, searching and choosing.
 *
 * The "Sin revisar" icon is a question mark and not a gap on purpose: it is a
 * state with meaning — "we have not looked at it yet" —, distinct from "No",
 * and the interface must not hint that it is an absence of answer.
 */
export function TriStateIcons({
  value,
  onChange,
  label,
  id,
}: {
  value: TriState
  onChange: (v: TriState) => void
  label: string
  id: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="label">
        {label}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {STATES.map(({ value: v, label: text, Icon }) => {
          const active = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={`flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border-2 transition ${
                active
                  ? 'border-stone-800 bg-stone-800 text-white'
                  : 'border-stone-300 bg-white text-stone-500'
              }`}
            >
              <Icon />
              <span className="text-xs font-medium">{text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Button that repeats while held ───────────────────────────

function RepeatButton({
  onStep,
  label,
  children,
  compact = false,
}: {
  onStep: () => void
  label: string
  children: ReactNode
  compact?: boolean
}) {
  const delayRef = useRef<number | null>(null)
  const repeatRef = useRef<number | null>(null)
  const didRepeatRef = useRef(false)

  const stop = useCallback(() => {
    if (delayRef.current !== null) window.clearTimeout(delayRef.current)
    if (repeatRef.current !== null) window.clearTimeout(repeatRef.current)
    delayRef.current = null
    repeatRef.current = null
  }, [])

  // Without this, unmounting the component with a finger down leaves the
  // repetition alive.
  useEffect(() => stop, [stop])

  function start() {
    didRepeatRef.current = false
    // 400 ms before repeating starts: below that, a normal tap would end up
    // advancing two years.
    delayRef.current = window.setTimeout(() => {
      didRepeatRef.current = true
      let count = 0
      const tick = () => {
        onStep()
        count += 1
        // Cruise first, fast after ~1.5 s held: crossing a decade should not
        // demand patience, and the slow start keeps single years reachable.
        repeatRef.current = window.setTimeout(tick, count > 15 ? 35 : 90)
      }
      tick()
    }, 400)
  }

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // The single step goes in onClick and not in onPointerDown so the
      // keyboard also works. The didRepeat flag prevents the click after a
      // sustained press from adding one extra year.
      onClick={() => {
        if (!didRepeatRef.current) onStep()
        didRepeatRef.current = false
      }}
      // A sustained touch must stay OURS: without touch-action the browser
      // reads the long press as a scroll or long-press gesture and fires
      // pointercancel before the repeat delay elapses — which is why holding
      // did nothing on the phone. The context menu and text selection of a
      // long press are suppressed for the same reason.
      onContextMenu={(e) => e.preventDefault()}
      className={`flex shrink-0 touch-none select-none items-center justify-center rounded-lg
                  border border-stone-300 bg-white text-stone-700 active:bg-stone-200 ${
                    compact ? 'h-11 w-11' : 'h-14 w-14'
                  }`}
    >
      {children}
    </button>
  )
}

/**
 * Year with − and +, and the number tappable to type it directly.
 *
 * Holding accelerates: without that, going from 1968 to 1985 is seventeen taps
 * and nobody does it — they would open the keyboard, which is exactly what has
 * to be avoided when cataloging standing up.
 *
 * `onChange` receives the **resulting year**, not an increment. The first
 * version communicated increments, and typing a year over the empty field
 * yielded an increment of zero, which means "start from the current year":
 * writing 1978 into an empty field left it at 2026. Precisely the case of the
 * first artwork of every batch.
 */
export function YearStepper({
  value,
  onChange,
  id,
  label,
  min,
  max,
  compact = false,
}: {
  value: number | null
  onChange: (year: number | null) => void
  id: string
  label: string
  min: number
  max: number
  /** 44px buttons instead of 56: to fit two year fields on one line. */
  compact?: boolean
}) {
  // Draft of what is being typed. Without it the field is controlled and "19"
  // — two digits, not yet a year — would be discarded on every keystroke,
  // making it impossible to type a year by hand.
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  function step(delta: number) {
    setDraft(null)
    onChange(clamp((value ?? max) + delta))
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className={compact ? 'flex items-center gap-1' : 'flex items-center gap-2'}>
        <RepeatButton
          onStep={() => step(-1)}
          label={`${label}: un año menos`}
          compact={compact}
        >
          <MinusIcon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
        </RepeatButton>

        <input
          id={id}
          className={`field flex-1 text-center font-semibold tabular-nums ${
            compact ? 'h-11 px-1 text-lg' : 'h-14 text-2xl'
          }`}
          inputMode="numeric"
          value={draft ?? value?.toString() ?? ''}
          placeholder="—"
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
            setDraft(digits)
            if (digits === '') {
              // Emptying the field means "undated artwork", not an error.
              onChange(null)
              return
            }
            // Propagated only once it is a full year: clamping "19" to 1900
            // while typing would produce absurd jumps on screen.
            if (digits.length === 4) onChange(clamp(Number(digits)))
          }}
        />

        <RepeatButton
          onStep={() => step(1)}
          label={`${label}: un año más`}
          compact={compact}
        >
          <PlusIcon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
        </RepeatButton>
      </div>

      {/* From empty, the buttons start at the current year, and going down to
          the sixties would take dozens of taps. It is stated that the number
          can be typed: once per batch, and from then on it is adjusted with
          the buttons, because the date carries over from one artwork to the
          next. */}
      {value == null && (
        <p className="mt-1 text-xs text-stone-500">
          Toca el número para escribir el año. Después se ajusta con − y +, y se mantiene pulsado para
          avanzar rápido.
        </p>
      )}
    </div>
  )
}

// ── Touch toggle ─────────────────────────────────────────────

export function Toggle({
  active,
  onChange,
  label,
  help,
}: {
  active: boolean
  onChange: (v: boolean) => void
  label: string
  help?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={`flex w-full min-h-touch items-center justify-between gap-3 rounded-lg border-2 px-3 py-2
                  text-left transition ${
                    active
                      ? 'border-stone-800 bg-stone-800 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {help && (
          <span className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>
            {help}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
          active ? 'bg-white/30' : 'bg-stone-200'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition ${active ? 'translate-x-5' : ''}`}
        />
      </span>
    </button>
  )
}

// ── Selection chips ──────────────────────────────────────────

/**
 * Selection among options as a grid of fixed-size buttons, the same visual
 * language as the Yes/No/Unreviewed selector. Variable-width pills made it
 * impossible to sweep the options with the eyes: each one started at a
 * different place. In a grid, each option's position is stable and several fit
 * per line without any hiding at the end of a row.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
  id,
  columns = 2,
}: {
  options: readonly { value: T; text: string }[]
  value: T | null
  onChange: (v: T) => void
  label: string
  id: string
  /** Options per line. 3 for short texts, 2 for those that need room. */
  columns?: 2 | 3
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="label">
        {label}
      </span>
      <div className={columns === 3 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
        {options.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`flex min-h-touch items-center justify-center rounded-lg border-2 px-2 py-2
                          text-center text-sm font-medium leading-tight transition ${
                            active
                              ? 'border-stone-800 bg-stone-800 text-white'
                              : 'border-stone-300 bg-white text-stone-700'
                          }`}
            >
              {o.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A switch shaped like a grid button, to place several on one line. The big
 * Toggle (with help text) does not fit three times on a phone; this is its
 * compact version with the same semantics (role="switch").
 */
export function ToggleChip({
  label,
  active,
  onChange,
}: {
  label: string
  active: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={`flex min-h-touch items-center justify-center rounded-lg border-2 px-2 py-2
                  text-center text-sm font-medium leading-tight transition ${
                    active
                      ? 'border-stone-800 bg-stone-800 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
    >
      {label}
    </button>
  )
}

// ── Searchable combo over a controlled vocabulary ────────────

/**
 * Text input with a dropdown filtered while typing (case- and
 * accent-insensitive) and selection by tap. For fields whose values live in a
 * database vocabulary — today the artwork types (RF-213) — where a plain
 * dropdown stops scaling past a dozen entries and free text breeds
 * "Pintura"/"pintura" duplicates.
 *
 * The value only changes by choosing an option (or confirming a new entry):
 * closing the list discards what was being typed. That is deliberate — the
 * field holds vocabulary entries, not prose.
 *
 * When `onAdd` is present and the typed text matches no entry, the last row
 * offers adding it, behind an inline two-tap confirmation (same pattern as
 * removing a photo in the gallery): extending a shared vocabulary from a
 * touch screen must not happen by accident. Whoever cannot edit simply does
 * not pass `onAdd` and never sees the offer.
 */
/**
 * Free-text input with loose suggestions from previous values. Unlike the
 * ComboBox there is no vocabulary and nothing to confirm: whatever is typed
 * IS the value, and the dropdown only saves retyping something the catalog
 * already contains (physical locations, mainly). Matching is token-based and
 * accent-insensitive subsequence — the letters count even apart — with the
 * matched letters emphasized in the list (see fuzzyMatch/fuzzyRank).
 */
export function SuggestInput({
  id,
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  ariaLabel,
}: {
  id: string
  /** Visible label; omit it and provide ariaLabel when the context names the field. */
  label?: string
  value: string
  onChange: (v: string) => void
  suggestions: readonly string[]
  placeholder?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Closing on a tap outside, instead of on blur: blur fires before the tap
  // on a suggestion lands, which would close the list under the finger.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const matches = fuzzyRank(suggestions, value)
    .filter((m) => m.option !== value)
    .slice(0, 6)

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className="field"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        autoCapitalize="none"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          // Never submit the surrounding form from here.
          if (e.key === 'Enter') e.preventDefault()
          if (e.key === 'Escape') setOpen(false)
        }}
      />

      {open && matches.length > 0 && (
        <div className="absolute inset-x-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-stone-300 bg-white shadow-lg">
          <ul>
            {matches.map((m) => (
              <li key={m.option}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.option)
                    setOpen(false)
                  }}
                  className="min-h-touch w-full px-3 py-2 text-left text-sm hover:bg-stone-100"
                >
                  <HighlightedMatch text={m.option} indices={m.indices} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * The option with the matched letters emphasized: with subsequence matching
 * the letters need not sit together, and without seeing WHICH ones matched,
 * an option can look arbitrary.
 */
function HighlightedMatch({ text, indices }: { text: string; indices: readonly number[] }) {
  const marked = new Set(indices)
  return (
    <>
      {[...text].map((ch, i) =>
        marked.has(i) ? (
          <strong key={i} className="font-semibold text-stone-900 underline decoration-stone-400">
            {ch}
          </strong>
        ) : (
          <span key={i} className="text-stone-600">
            {ch}
          </span>
        ),
      )}
    </>
  )
}

export function ComboBox({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  addLabel,
  onAdd,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  placeholder?: string
  /** When set, an extra first row selects '' ("no value") with this text. */
  emptyLabel?: string
  /** Text of the add-to-vocabulary row, given the typed text. */
  addLabel?: (text: string) => string
  /**
   * Inserts the new entry in the vocabulary. Resolves to an error message in
   * Spanish, or null when it worked. Omit it for read-only users: without it,
   * unknown text offers nothing.
   */
  onAdd?: (name: string) => Promise<string | null>
}) {
  // What is being typed, apart from the committed value: like YearStepper's
  // draft, the field must be editable without the value changing under it.
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmingAdd, setConfirmingAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setDraft(null)
    setConfirmingAdd(false)
    setError(null)
  }, [])

  // Closing on a tap outside, instead of on blur: blur fires before the tap
  // on an option lands, which would close the list under the finger.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  function choose(option: string) {
    onChange(option)
    close()
  }

  const typed = (draft ?? '').trim()
  const matches = filterVocabulary(options, draft ?? '')
  // Typing "pintura" with "Pintura" in the vocabulary must select the
  // existing entry, never offer a duplicate that differs only in case.
  const equivalent = findEquivalent(options, typed)
  const offerAdd = onAdd !== undefined && typed !== '' && equivalent === undefined

  async function confirmAdd() {
    if (!onAdd) return
    setAdding(true)
    setError(null)
    const err = await onAdd(typed)
    setAdding(false)
    if (err) {
      setError(err)
      setConfirmingAdd(false)
    } else {
      choose(typed)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={draft ?? value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
          setConfirmingAdd(false)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Never submit the surrounding form from here; with an exact
            // (case/accent-insensitive) match, Enter selects it.
            e.preventDefault()
            if (equivalent) choose(equivalent)
          }
          if (e.key === 'Escape') close()
        }}
      />

      {open && (
        <div className="absolute inset-x-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-stone-300 bg-white shadow-lg">
          <ul>
            {emptyLabel && typed === '' && (
              <li>
                <button
                  type="button"
                  onClick={() => choose('')}
                  className="flex min-h-touch w-full items-center px-3 text-left text-sm italic text-stone-500 active:bg-stone-100"
                >
                  {emptyLabel}
                </button>
              </li>
            )}
            {matches.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => choose(option)}
                  className={`flex min-h-touch w-full items-center px-3 text-left text-sm active:bg-stone-100 ${
                    option === value ? 'font-semibold' : ''
                  }`}
                >
                  {option}
                </button>
              </li>
            ))}
            {/* Never an unexplained blank dropdown. */}
            {matches.length === 0 && !offerAdd && !(emptyLabel && typed === '') && (
              <li className="px-3 py-3 text-sm text-stone-500">
                No hay ningún tipo que coincida.
              </li>
            )}
          </ul>

          {offerAdd &&
            (confirmingAdd ? (
              <div className="border-t border-stone-200 p-2">
                <p className="text-xs text-stone-700">
                  Se añadirá «{typed}» al catálogo compartido, a la vista de todo el equipo.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => void confirmAdd()}
                    className="btn min-h-touch bg-stone-900 text-white"
                  >
                    {adding ? 'Añadiendo…' : 'Sí, añadir'}
                  </button>
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => setConfirmingAdd(false)}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingAdd(true)}
                className="flex min-h-touch w-full items-center gap-2 border-t border-stone-200 px-3 text-left text-sm font-medium text-stone-800 active:bg-stone-100"
              >
                <PlusIcon className="h-4 w-4 shrink-0" />
                <span>{addLabel ? addLabel(typed) : `Añadir «${typed}»`}</span>
              </button>
            ))}

          {error && (
            <p role="alert" className="border-t border-stone-200 bg-red-50 p-2 text-xs text-red-800">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Named field group ────────────────────────────────────────

/**
 * fieldset + legend, the grouping pattern of the team's other application. A
 * long form without named groups forces reading it whole to know where things
 * are; with the name on the border, the eye jumps straight there.
 *
 * `hint` is for what the operator needs to know about the whole group before
 * filling it — e.g. "carries over to the next artwork" — without repeating it
 * field by field.
 */
/**
 * Radio group as stacked cards: icon, short name and an always-visible
 * description. For choices whose values need explaining — chips with a
 * two-word label assume the cataloger remembers what each one implies, and
 * these decisions (title authorship) are made a few times a month, not daily.
 */
export function OptionCards<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  id: string
  label: string
  options: {
    value: T
    text: string
    description: string
    Icon: (props: { className?: string }) => ReactNode
  }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="label">
        {label}
      </span>
      <div className="space-y-2">
        {options.map(({ value: v, text, description, Icon }) => {
          const active = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(v)}
              className={`flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition ${
                active ? 'border-stone-800 bg-stone-100' : 'border-stone-200 bg-white'
              }`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{text}</span>
                <span className="block text-xs text-stone-500">{description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <fieldset className="rounded-xl border border-stone-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-stone-800">
        {title}
        {hint && <span className="ml-1.5 font-normal text-stone-500">· {hint}</span>}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  )
}

// ── Bottom sheet ─────────────────────────────────────────────

/**
 * Panel fixed to the bottom of the screen over a darkened backdrop, closed by
 * tapping outside, with its button, with Escape and with the phone's BACK
 * button. The mobile pattern for choosing among a handful of options: the
 * choices appear under the thumb, where a dropdown near the top of the page
 * would not.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  headerAction,
  children,
  guard,
}: {
  open: boolean
  onClose: () => void
  title: string
  /**
   * Un control opcional junto al título, a la izquierda del cierre.
   *
   * Existe porque la acción que deshace lo que la hoja acumula —quitar los filtros
   * puestos— tiene que estar donde se ve sin desplazarse: al pie queda por debajo de
   * cinco secciones de opciones, y con la hoja a tres cuartos de pantalla eso son
   * dos gestos para encontrarla. Y arriba puede además decir CUÁNTOS filtros va a
   * quitar, que es la información que hace falta para decidir si se pulsa.
   */
  headerAction?: ReactNode
  children: ReactNode
  /**
   * El guardián de lo escrito, para las hojas que son un formulario: `useSheetGuard`.
   *
   * Sin él la hoja se comporta como siempre —las cuatro salidas cierran en el acto—, que
   * es lo que necesita una hoja de ELEGIR algo: ahí no hay nada que perder y pedir
   * confirmación sería molestar sin proteger nada.
   *
   * Va entero y no como tres props porque el «Cancelar» del pie lo pinta el formulario, en
   * el mismo componente que pinta la hoja: el estado tiene que vivir arriba para que las
   * CINCO salidas entren por la misma puerta. Ver `useSheetGuard.ts`.
   */
  guard?: SheetGuard
}) {
  // Sin guardián, cerrar es cerrar: es lo que ha sido siempre y lo que necesita una hoja
  // de elegir.
  const requestClose = useCallback(
    (exit: 'backdrop' | 'close' | 'escape' | 'back') => {
      if (guard === undefined) {
        onClose()
        return
      }
      guard.request(exit)
    },
    [guard, onClose],
  )
  const backdropCloses = guard === undefined ? true : guard.backdropCloses
  const confirming = guard?.confirming ?? false

  // El botón de atrás cierra la hoja en vez de salir de la pantalla: es la salida que el
  // pulgar alcanza sin apuntar, y en el móvil la hoja es lo que tapa la ficha. Ver
  // `useCloseOnBack`, que ya sabe volver a empujar su entrada de historia cuando el
  // cierre se niega — que es exactamente lo que pasa cuando esto pregunta.
  const onBack = useCallback(() => requestClose('back'), [requestClose])
  useCloseOnBack(onBack, open)

  // Escape cierra, como cualquier diálogo. Registrado solo con la hoja abierta.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose('escape')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, requestClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label={title}>
      {/* El fondo es la superficie de «tocar fuera para cerrar», y solo lo es cuando de
          verdad cierra: en un formulario se queda como un fondo y punto, sin anunciarse
          como «Cerrar» a un lector de pantalla. */}
      {backdropCloses ? (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => requestClose('backdrop')}
          className="absolute inset-0 h-full w-full cursor-default bg-black/40"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 h-full w-full bg-black/40" />
      )}
      <div
        className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{title}</h2>
            {/* El cierre se queda pegado al borde y lo que se añada va a su
                izquierda: el pulgar aprende dónde está la salida y no conviene
                moverla porque una hoja tenga una acción y otra no. */}
            <div className="flex items-center gap-1">
              {headerAction}
              <button
                type="button"
                onClick={() => requestClose('close')}
                aria-label="Cerrar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-600 active:bg-stone-100"
              >
                <NoIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* La pregunta va ARRIBA y no al pie: la hoja puede estar desplazada por la
              mitad de un formulario largo, y un cartel al final es un cartel que hay que
              ir a buscar. Y no es una segunda hoja encima — anidar modales es donde este
              proyecto se ha llevado sus dos regresiones del botón de atrás. */}
          {confirming && (
            <div role="alertdialog" aria-label={DISCARD_TITLE} className="mb-3 rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{DISCARD_TITLE}</p>
              <p className="mt-1 text-sm text-amber-900">{discardText(guard?.discardNotice)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {/* El que no destruye, primero: es donde cae el pulgar sin apuntar. */}
                <button
                  type="button"
                  autoFocus
                  onClick={() => guard?.dismiss()}
                  className="btn min-h-touch bg-stone-800 text-white"
                >
                  {DISCARD_KEEP_LABEL}
                </button>
                <button
                  type="button"
                  onClick={() => guard?.leave()}
                  className="btn-secondary min-h-touch"
                >
                  {DISCARD_LEAVE_LABEL}
                </button>
              </div>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  )
}


/**
 * Vertical radio list for a bottom sheet: full-width rows, the active one
 * checked. One tap chooses and the caller closes the sheet — choosing and
 * confirming would be two gestures for one decision.
 */
export function RadioList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; text: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" className="space-y-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
              active ? 'bg-stone-800 text-white' : 'text-stone-800 active:bg-stone-100'
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.text}</span>
              {o.hint && (
                <span className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>
                  {o.hint}
                </span>
              )}
            </span>
            {active && <YesIcon className="h-5 w-5 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

export interface CheckOption<T extends string> {
  value: T
  /** Plain text of the row. Also what the searchable variant matches against. */
  text: string
  hint?: string
  /** Rendered instead of `text` when present, for the matched-letter emphasis. */
  label?: ReactNode
}

/**
 * Multiselect sibling of RadioList: same look, checkbox semantics. An empty
 * selection means "everything" — the caller says so next to its label; a
 * dedicated "all" row would need clearing logic the empty state already is.
 */
export function CheckList<T extends string>({
  options,
  values,
  onChange,
}: {
  options: readonly CheckOption<T>[]
  values: readonly T[]
  onChange: (values: T[]) => void
}) {
  function toggle(v: T) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }
  return (
    <div role="group" className="space-y-1">
      {options.map((o) => {
        const active = values.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(o.value)}
            className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
              active ? 'bg-stone-800 text-white' : 'text-stone-800 active:bg-stone-100'
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.label ?? o.text}</span>
              {o.hint && (
                <span className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>
                  {o.hint}
                </span>
              )}
            </span>
            {active && <YesIcon className="h-5 w-5 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A CheckList with a search field on top, for the lists that grow without
 * limit: series and physical locations are open vocabularies fed by the
 * catalog, and with sixty of them a column of checkboxes is not a chooser
 * anymore, it is a wall to scroll on a phone.
 *
 * Matching is the same accent-insensitive subsequence used by SuggestInput
 * (fuzzyRank over the option's `text`), with the matched letters emphasized so
 * an option never looks arbitrary. The search field only appears past
 * `searchFrom` options: below that it would be clutter competing for thumb
 * space.
 *
 * A MARKED option is always listed, even when the search does not reach it:
 * hiding what is filtering is how a filtered list ends up looking complete.
 * Those go last, under a note, because they are not answers to the search.
 */
export function SearchableCheckList<T extends string>({
  options,
  values,
  onChange,
  searchLabel,
  placeholder,
  emptyText = 'Todavía no hay opciones.',
  searchFrom = 8,
}: {
  options: readonly CheckOption<T>[]
  values: readonly T[]
  onChange: (values: T[]) => void
  /** Accessible name of the search field; it carries no visible label. */
  searchLabel: string
  placeholder?: string
  /** Shown instead of the rows when there is nothing to offer at all. */
  emptyText?: string
  searchFrom?: number
}) {
  const [query, setQuery] = useState('')
  const searchable = options.length >= searchFrom
  const searching = searchable && query.trim() !== ''

  // The option's text is its searchable identity: what the user reads is what
  // they type against.
  const { matches, selectedApart } = searchableOptions(
    options,
    searching ? query : '',
    (o) => o.text,
    (o) => values.includes(o.value),
  )
  // The emphasis is only applied while searching: with no query there is no
  // matched letter to point at, and the neutral row reads better.
  const rows = matches.map(({ item, indices }) =>
    searching ? { ...item, label: <HighlightedMatch text={item.text} indices={indices} /> } : item,
  )

  return (
    <div>
      {searchable && (
        <input
          className="field mb-1 min-h-[2.5rem] py-1"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          autoComplete="off"
          autoCapitalize="none"
        />
      )}

      {rows.length === 0 ? (
        /* Never a blank block: what happened is said where the rows would go. */
        <p className="px-3 py-2 text-sm text-stone-600">
          {searching ? 'Ninguna opción coincide con la búsqueda.' : emptyText}
        </p>
      ) : (
        <CheckList options={rows} values={values} onChange={onChange} />
      )}

      {selectedApart.length > 0 && (
        <>
          <p className="mt-2 px-3 text-xs text-stone-500">
            Marcadas, fuera de la búsqueda:
          </p>
          <CheckList options={selectedApart} values={values} onChange={onChange} />
        </>
      )}
    </div>
  )
}

// ── Action bar fixed at the bottom ───────────────────────────

/**
 * In a long form, a save button at the end forces scrolling to find it. Fixed
 * at the bottom it stays under the thumb, which is where one-handed work
 * happens. The padding-bottom respects the phone's bottom bar.
 */
/**
 * «Cargando…», centrado. Existe porque estaba copiado en cinco pantallas: es lo que
 * se pinta mientras una vista no puede decidir todavía qué mostrar, y el sitio donde
 * eso se decide es `useEditingAccess`.
 */
export function LoadingNotice({ children = 'Cargando…' }: { children?: ReactNode }) {
  return <div className="p-8 text-center text-sm text-stone-600">{children}</div>
}

export function ActionBar({ children, notice }: { children: ReactNode; notice?: ReactNode }) {
  return (
    <div
      className="sticky z-10 -mx-4 mt-4 border-t border-stone-200 bg-stone-100/95 px-4 pb-3 pt-3 backdrop-blur"
      // Pegada por encima del menú del pie, no al borde de la ventana.
      //
      // Con `bottom: 0` la barra se quedaba DEBAJO del menú: los dos son
      // `sticky bottom-0` con el mismo z-index, y el menú va después en el
      // documento, así que pintaba encima. «Guardar» y «Cancelar» solo aparecían
      // al llegar al final del formulario con el dedo, que es exactamente lo que
      // una barra pegada existe para evitar.
      //
      // 3.5rem es la altura del menú (`h-14`), y su franja segura la añade él
      // mismo, así que aquí se suma pero no se vuelve a rellenar. Al final del
      // recorrido la posición natural de la barra ya coincide con esta, y no
      // salta.
      style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
    >
      {/* The notice goes here and not at the top of the page: the result of
          pressing a button must appear where it was just pressed, not where
          one has to scroll to find it. */}
      {notice && <div className="mx-auto mb-2 max-w-3xl">{notice}</div>}
      <div className="mx-auto flex max-w-3xl gap-2">{children}</div>
    </div>
  )
}

// ── Password field with show/hide ────────────────────────────

/**
 * On a phone, typing a password blind produces typos, and the credentials
 * message is generic on purpose (it does not say whether it was the email or
 * the password). Being able to see it is the cheap way out of that dead end.
 */
export function PasswordField({
  id,
  value,
  onChange,
  autoComplete = 'current-password',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        className="field pr-12"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-stone-500"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg {...svg} strokeWidth={2} className="h-5 w-5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg {...svg} strokeWidth={2} className="h-5 w-5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <path d="M4 4l16 16" />
    </svg>
  )
}
