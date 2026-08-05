import { useState, type ReactNode } from 'react'
import { ChevronRightIcon } from '../../components/ui'
import { opensByDefault, type BlockState, type BlockTone } from './researchState'
import type { DocumentarySectionSpec } from './sections'

/**
 * A block of the documentary catalogue on the artwork record: heading, count,
 * state of its research, and what it says when it holds nothing.
 *
 * The five sections use this one and add only their rows. That is not a saving
 * of lines: it is what makes the five read as the same catalogue — same fold,
 * same place for the count, same voice for an empty block — and what stops the
 * «sin revisar» rule from being written five times in five ways.
 *
 * **Collapsed by default** (see `opensByDefault`). The record is read standing
 * up, with one hand, and five expanded blocks below the photographs is a scroll
 * to nowhere. Everything needed to decide whether to open one is on the heading:
 * how many rows there are and whether anybody has looked.
 *
 * **Nothing here decides anything.** Which sentence, which count and which tone
 * come in as a `BlockState`, computed by `blockState` and verified by the
 * battery, because the battery runs in node and cannot open a component. What is
 * left here is the fold and the colours.
 */
export function DocumentarySection({
  spec,
  state,
  loading = false,
  error = null,
  actions,
  children,
  defaultOpen,
}: {
  spec: DocumentarySectionSpec
  state: BlockState
  /** The query is in flight: the count is not known yet, and it is not claimed. */
  loading?: boolean
  /** The database's own message. The Spanish frame around it is written here. */
  error?: string | null
  /** Editor controls — add, declare the state of the research — at the foot of the open block. */
  actions?: ReactNode
  /** The rows. Rendered only when the block is open and it holds some. */
  children?: ReactNode
  /** Overrides the fold rule for a caller that knows better. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(() => defaultOpen ?? opensByDefault(state))
  const bodyId = `documentary-${spec.id}`

  return (
    <section className="card mb-3">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-touch w-full items-center gap-2 text-left"
        >
          <ChevronRightIcon
            className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{spec.title}</span>
            {/* The one line read before deciding to open the block: how many
                there are, and whether anybody has looked. Never a bare zero. */}
            <span className="block text-xs text-stone-500">
              {error !== null
                ? 'No se ha podido cargar'
                : loading
                  ? 'Cargando…'
                  : state.countText}
            </span>
          </span>
          {error === null && !loading && state.statusLabel !== null && (
            <StatusBadge tone={state.tone} label={state.statusLabel} />
          )}
        </button>
      </h2>

      <div id={bodyId} hidden={!open} className="mt-2">
        {error !== null ? (
          /* Two different things, and confusing them sends the cataloger looking
             for data that is perfectly fine: the catalogue answered that there is
             nothing, or the catalogue did not answer. */
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No se ha podido cargar este bloque, así que no se muestra nada: lo que hay registrado
            puede ser cualquier cosa. Vuelve a intentarlo donde haya cobertura. ({error})
          </p>
        ) : loading ? (
          <p className="p-2 text-sm text-stone-600">Cargando…</p>
        ) : (
          <>
            {state.partialText !== null && (
              <p
                className={`mb-2 rounded-lg p-2 text-xs ${
                  state.tone === 'conflict'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-amber-50 text-amber-900'
                }`}
              >
                {state.partialText}
              </p>
            )}
            {state.emptyText !== null ? (
              /* RF-304: an empty block explains itself, and the explanation is
                 about the research and not about the artwork. */
              <p className="p-2 text-sm text-stone-600">{state.emptyText}</p>
            ) : (
              children
            )}
          </>
        )}

        {actions && <div className="mt-3 border-t border-stone-100 pt-3">{actions}</div>}
      </div>
    </section>
  )
}

/** How far the research on this block has got (RF-218), on the heading. */
function StatusBadge({ tone, label }: { tone: BlockTone; label: string }) {
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-2xs ${TONE_CLASS[tone]}`}>{label}</span>
  )
}

/**
 * The four colours the record already speaks: stone for the neutral, amber for
 * the notice, green for the finished, red for the broken. No fifth one is
 * introduced here.
 *
 * «Sin revisar» is amber and not red, because it is the state every artwork
 * starts in and painting the normal case as an error teaches the eye to skip it.
 * Green covers BOTH closed states — «Investigado, sin resultados» is a finished
 * investigation exactly as «Investigación completa» is, and that is the whole
 * point of the pair. Red is kept for the contradiction.
 */
const TONE_CLASS: Record<BlockTone, string> = {
  unreviewed: 'bg-amber-100 text-amber-900',
  progress: 'bg-stone-200 text-stone-700',
  settled: 'bg-green-100 text-green-900',
  plain: 'bg-stone-200 text-stone-700',
  conflict: 'bg-red-100 text-red-900',
}
