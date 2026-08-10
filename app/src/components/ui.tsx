import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TriState } from '../lib/types'
import { ringOffset, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE } from '../lib/progressRing'
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

/**
 * The cover's star, in its two states.
 *
 * `filled` fills it in, and it is what distinguishes «this is the main one» from «make it
 * the main one» with no word alongside: the outline is a button and the fill is a
 * state. An icon that does not change when pressed does not say whether anything has happened.
 */
export function StarIcon({
  className = 'h-6 w-6',
  filled = false,
}: {
  className?: string
  filled?: boolean
}) {
  return (
    <svg {...svg} fill={filled ? 'currentColor' : 'none'} className={className}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  )
}

/** Removing from the record. The lid apart, which is what makes it legible at 20 px. */
export function TrashIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 7h16" />
      <path d="M9.5 4.5h5" />
      <path d="M6.5 7l.8 12.2a1.8 1.8 0 0 0 1.8 1.8h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
    </svg>
  )
}

/**
 * Moving one position, towards the start or towards the end.
 *
 * **It is not a navigation chevron**, and that is the whole decision: over a photograph
 * flicked past by swiping, a «‹» reads as «previous photo». The bar at the end is
 * what turns it into «take it that way», which is the same drawing the
 * home and end keys use.
 */
export function MoveBeforeIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M5 4v16" />
      <path d="M20 12H9" />
      <path d="m13 8-4 4 4 4" />
    </svg>
  )
}

export function MoveAfterIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M19 4v16" />
      <path d="M4 12h11" />
      <path d="m11 8 4 4-4 4" />
    </svg>
  )
}

export function InfoIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg {...svg} strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
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

/**
 * Progress ring, for the control that is working (RNF-106).
 *
 * Two shapes and not one: **determinate** when how much is travelling is known
 * —the arc advances and it can be decided whether to wait—, and **indeterminate** when it is not
 * —it spins, which only says «this is still alive»—. Faking a percentage without knowing the
 * total would be inventing the very datum being looked at.
 *
 * The background is that same whole circle in faint grey, so that the arc reads as
 * a part of a whole and not as a stray stroke.
 */
export function ProgressRing({
  percent,
  className = 'h-5 w-5',
}: {
  /** 0 to 100, or null when the total is unknown. */
  percent: number | null
  className?: string
}) {
  const common = {
    cx: 12,
    cy: 12,
    r: RING_RADIUS,
    fill: 'none',
    strokeWidth: RING_STROKE,
    strokeLinecap: 'round' as const,
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`${className} ${percent === null ? 'animate-spin' : ''}`}
    >
      <circle {...common} stroke="currentColor" opacity={0.25} />
      <circle
        {...common}
        stroke="currentColor"
        strokeDasharray={RING_CIRCUMFERENCE}
        // Indeterminate: a quarter turn, spinning. Determinate: what is left.
        strokeDashoffset={percent === null ? RING_CIRCUMFERENCE * 0.75 : ringOffset(percent)}
        // It starts at the top, like a clock, not at three o'clock.
        transform="rotate(-90 12 12)"
      />
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
          Toca el número para escribirlo. Después se ajusta con − y +.
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
  disabled = false,
}: {
  active: boolean
  onChange: (v: boolean) => void
  label: string
  help?: string
  /**
   * Off entirely: neither pressable nor looking pressable. For the control
   * the base is going to reject anyway — whoever looks at it has to see that
   * it is not going to work BEFORE trying, and the reason is said alongside.
   */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`flex w-full min-h-touch items-center justify-between gap-3 rounded-lg border-2 px-3 py-2
                  text-left transition disabled:opacity-50 ${
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


// ── Información ampliada ─────────────────────────────────────

/**
 * The long why, behind an icon (RNF-106).
 *
 * The screen says just enough —what there is and what can be done— and this keeps what
 * is really needed sometimes: why a rule is the way it is, what happens if it is done
 * another way, the example that unblocks. **It is not a place to dump what is
 * left over**: if the text alongside is already enough, this icon is not put in. What
 * justifies adding it is that without that explanation somebody gets it wrong; and since the
 * space exists, the sentence outside can genuinely fall short.
 *
 * A sheet and not a help bubble: it is read with the thumb, any length fits and
 * the phone's «back» closes it —`BottomSheet` does that— instead of leaving the
 * screen.
 */
export function InfoNote({
  title,
  children,
  className = '',
}: {
  /** What is being explained. It is the sheet's title. */
  title: string
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Más sobre ${title.toLowerCase()}`}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                    text-stone-400 active:bg-stone-100 ${className}`}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-2 text-sm text-stone-700">{children}</div>
      </BottomSheet>
    </>
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
   * An optional control next to the title, to the left of the close.
   *
   * It exists because the action undoing what the sheet accumulates —removing the filters
   * set— has to be where it is seen without scrolling: at the foot it ends up below
   * five sections of options, and with the sheet at three quarters of the screen that is
   * two gestures to find it. And at the top it can also say HOW MANY filters it is going to
   * remove, which is the information needed to decide whether to press it.
   */
  headerAction?: ReactNode
  children: ReactNode
  /**
   * The guard of what was written, for the sheets that are a form: `useSheetGuard`.
   *
   * Without it the sheet behaves as always —the four exits close on the spot—, which
   * is what a sheet for CHOOSING something needs: there is nothing to lose there and asking for
   * confirmation would be a nuisance protecting nothing.
   *
   * It goes whole and not as three props because the footer's «Cancelar» is painted by the form, in
   * the same component that paints the sheet: the state has to live above so that ALL
   * FIVE exits come in through the same door. See `useSheetGuard.ts`.
   */
  guard?: SheetGuard
}) {
  // With no guard, closing is closing: it is what it has always been and what a chooser
  // sheet needs.
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

  // The back button closes the sheet instead of leaving the screen: it is the exit the
  // thumb reaches without aiming, and on a phone the sheet is what covers the record. See
  // `useCloseOnBack`, which already knows how to push its history entry again when the
  // close is refused — which is exactly what happens when this asks.
  const onBack = useCallback(() => requestClose('back'), [requestClose])
  useCloseOnBack(onBack, open)

  // Escape closes, like any dialog. Registered only while the sheet is open.
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
              <p className="mt-1 text-sm text-amber-900">{discardText(guard?.discardNotice, guard?.draftKept)}</p>
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
  /**
   * Short badge next to the name, for what has to be known about that row
   * BEFORE choosing it. It goes here and not in `hint` because a condition of the row is
   * read at a glance and an explanation is read by reading.
   */
  badge?: string
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
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{o.label ?? o.text}</span>
                {o.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-2xs ${
                      active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {o.badge}
                  </span>
                )}
              </span>
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
 * «Cargando…», centred. It exists because it was copied into five screens: it is what
 * is painted while a view cannot decide yet what to show, and the place where
 * that is decided is `useEditingAccess`.
 */
export function LoadingNotice({ children = 'Cargando…' }: { children?: ReactNode }) {
  return <div className="p-8 text-center text-sm text-stone-600">{children}</div>
}

export function ActionBar({ children, notice }: { children: ReactNode; notice?: ReactNode }) {
  return (
    <div
      className="sticky z-10 -mx-4 mt-4 border-t border-stone-200 bg-stone-100/95 px-4 pb-3 pt-3 backdrop-blur"
      // Stuck above the footer menu, not to the window's edge.
      //
      // With `bottom: 0` the bar ended up BELOW the menu: both are
      // `sticky bottom-0` with the same z-index, and the menu comes later in the
      // document, so it painted on top. «Guardar» and «Cancelar» only appeared
      // on reaching the end of the form with the finger, which is exactly what
      // a stuck bar exists to avoid.
      //
      // 3.5rem is the menu's height (`h-14`), and it adds its own safe strip
      // itself, so here it is added but not padded again. At the end of the
      // scroll the bar's natural position already coincides with this one, and it does not
      // jump.
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

/**
 * A sheet's buttons, stuck to its bottom edge (RNF-106).
 *
 * `ActionBar`'s sibling, for the sheets that are a form. The sheet is at
 * most three quarters of the screen tall and its content scrolls inside, so a
 * «Guardar» at the end of seven fields ends up out of sight just as the record's did:
 * it gets filled in, the button is looked for, it is not there, and what is within reach is the dark
 * backdrop — which in a form no longer closes, precisely because of this.
 *
 * `sticky` and not `fixed`: what has to stay still is the foot **inside the
 * sheet**, not in the window, and a short sheet must not carry the foot detached from the
 * end of its content. The negative margins undo the sheet's `p-4` so
 * the band reaches from one edge to the other; without that, the content is seen going past the
 * four points at the sides.
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky -mx-4 mt-4 border-t border-stone-200 bg-white px-4 pt-3"
      style={{
        // Lowered by exactly the sheet's bottom padding, so the band
        // reaches its edge: with `bottom: 0` it floated above and through
        // that gap the next field was seen going past, which is worse than having no
        // band — it looks as if the form continued below the save button.
        bottom: 'calc(-1 * max(1rem, env(safe-area-inset-bottom)))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        // And its natural place set where it stays stuck, so that on reaching the
        // end of the form it does not jump a centimetre: it is the same care
        // that was taken with the page's bar.
        marginBottom: 'calc(-1 * max(1rem, env(safe-area-inset-bottom)))',
      }}
    >
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

// ── The floating notice ──────────────────────────────────────

/**
 * The confirmation of something that has just happened, floating at the top (RNF-106).
 *
 * ── WHY AT THE TOP AND FLOATING ─────────────────────────────
 *
 * «Imagen principal actualizada» lived at the end of the card, below the whole
 * data panel: with the eyes on the photograph —which is where the control
 * just pressed is— it appeared off screen, so the confirmation confirmed
 * nothing. And **it cannot stay in the gap** nor displace the content:
 * a line that appears and disappears among the fields moves what was
 * being looked at, which on a phone is the finger landing on the button next to it.
 *
 * ── AND WHY IT LEAVES ON ITS OWN ────────────────────────────
 *
 * Because there is nothing to do with it. A notice that stays until somebody
 * closes it turns every action into two, and by the third one it stops being read; then
 * the one that did matter is not read either. The seconds and the why of those seconds are
 * in `useAutoClear`. **Errors do not go here**: they ask for something to be done, they stay.
 *
 * `role="status"` and not `alert`: it is a confirmation, and an `alert` interrupts whatever
 * the screen reader is reading to announce that something went well.
 */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-30 max-w-[92vw] -translate-x-1/2
                 rounded-full bg-stone-900/90 px-4 py-2 text-center text-sm text-white
                 shadow-lg backdrop-blur"
      // Below the heading, not above it: that is where the «back» and the screen's
      // title are, and covering them for four seconds leaves you not knowing where you are. That it
      // receives no taps —`pointer-events-none`— is what saves whatever button ends up
      // underneath, but an invisible button is not pressed either.
      //
      // 3.5rem is the heading's height; the system's safe strip is added
      // by it, so here it is only summed.
      style={{ top: 'calc(3.5rem + 0.5rem + env(safe-area-inset-top))' }}
    >
      {children}
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
