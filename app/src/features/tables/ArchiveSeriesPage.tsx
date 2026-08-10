import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import {
  BanIcon,
  BottomSheet,
  LoadingNotice,
  NoIcon,
  PenIcon,
  YesIcon,
} from '../../components/ui'
import type { ArchiveSeries } from '../../lib/types'
import { useTableAction } from './MasterTableRow'
import {
  canAddSeries,
  flattenSeries,
  seriesAddLabel,
  seriesAdditionSummary,
  seriesInside,
  seriesLevelLabel,
  seriesListNotice,
  seriesPathText,
  summarizeSeriesTree,
  type SeriesTree,
} from './archiveSeries'
import { useArchiveSeries } from './useArchiveSeries'

/**
 * The archive classification screen: creating, renaming, moving and retiring the
 * nodes of `archive_series` (RF-515, RF-901, RF-1106).
 *
 * It is the shape of the places screen because it is the same shape: RF-515 says
 * the classification is a tree — fondo, serie, subserie — «y no una jerarquía
 * metida dentro de un texto con una convención que hay que recordar», which is
 * the mistake this project already paid for once with the physical location and
 * that ADR-006 resolved. So the list is indented, «Mover» exists, and renaming is
 * one row that every document reads.
 *
 * **The database is the one that checks the rules, and this screen is the one
 * that explains them.** Two siblings with the same name, a cycle, retiring a
 * series with subseries or with documents inside: all four are refused next to
 * the data, in Spanish and with a hint, and that sentence is what shows up here.
 *
 * **The one thing added on top is how much is inside a series that refuses to be
 * retired.** The trigger says «No se puede retirar una serie que todavía tiene
 * documentos dentro» and never says whether that is two letters or two hundred.
 * The count and the names of the first few are asked for AFTER the refusal, which
 * is what keeps them from being a second copy of the rule: nothing here decides
 * whether the button may be pressed — the button always asks the database.
 *
 * **This table is born empty on purpose** (RF-515: «nace opcional: si la
 * clasificación archivística no se adopta nunca, se queda vacía y no estorba»),
 * so the empty state is not an edge case, it is the first thing anybody sees. It
 * explains what a fondo is instead of saying «no hay nada».
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list.
 */
export function ArchiveSeriesPage() {
  const access = useEditingAccess()
  const { tree, loading, error, addSeries, renameSeries, moveSeries, setSeriesActive } =
    useArchiveSeries()
  // Shared with the other screens of the section: the same convention (null means
  // it worked) and the same reason for scrolling the message into view on a phone.
  const { busy, failure, failureRef, run } = useTableAction()

  /** Where a new node will hang. Null is a new fondo, which is a normal answer. */
  const [parentId, setParentId] = useState<string | null>(null)
  const [creating, setCreating] = useState('')
  /** Node being renamed, and the text in the field. */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  /** Node being moved: the picker of the new parent opens for it. */
  const [moving, setMoving] = useState<string | null>(null)
  /** Open sheet for choosing the parent of a NEW node. */
  const [choosingParent, setChoosingParent] = useState(false)

  // Everything, retired included: this is the screen where a retired series is
  // brought back, so hiding it would hide the only way out.
  const rows = useMemo(() => flattenSeries(tree), [tree])
  const summary = useMemo(() => summarizeSeriesTree(tree), [tree])
  const notice = seriesListNotice({ loading, error, count: rows.length })

  // The wait matters: the role arrives after the session, so deciding on the
  // first render would throw out whoever can. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Clasificación del archivo" back="/tables">
      <p className="mb-3 text-sm text-stone-600">
        Cómo se ordenan los papeles. Renombrar o mover una lo ven todos sus documentos.
      </p>
      {summary && <p className="mb-3 text-sm font-medium text-stone-700">{summary}</p>}

      {failure && (
        <p ref={failureRef} role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="card mb-3 space-y-2">
        <h2 className="font-medium">Añadir</h2>
        <div>
          <span className="label" id="new-series-parent-label">
            Dónde va
          </span>
          <button
            type="button"
            id="new-series-parent"
            aria-labelledby="new-series-parent-label"
            onClick={() => setChoosingParent(true)}
            className="field flex min-h-touch w-full items-center justify-between gap-2 text-left"
          >
            {/* Never a blank space: «no parent» is an answer and it says so, and a
                parent that vanished while the form was half filled in says THAT
                instead of leaving the button with no words in it. */}
            <span>
              {parentId === null
                ? 'Un fondo nuevo, en el primer nivel'
                : seriesPathText(tree, parentId) || 'La serie elegida ya no está'}
            </span>
            <span className="shrink-0 text-xs text-stone-500">Cambiar</span>
          </button>
        </div>
        <input
          className="field"
          value={creating}
          onChange={(e) => setCreating(e.target.value)}
          placeholder="Correspondencia"
          aria-label="Nombre de la serie nueva"
        />
        <p className="text-xs text-stone-500">
          {seriesAdditionSummary(tree, parentId)} El nombre se guarda tal y como se escribe, comas
          incluidas. Si ya existe ahí se reutiliza, aunque esté escrito con otras mayúsculas o
          tildes; si estaba retirada, vuelve.
        </p>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy || !canAddSeries(tree, parentId, creating)}
          onClick={() =>
            void run(async () => {
              const message = await addSeries(parentId, creating)
              if (!message) setCreating('')
              return message
            })
          }
        >
          {seriesAddLabel(tree, parentId)}
        </button>
      </section>

      {/* Never a blank page: an empty tree explains what the thing is, and it does
          not claim to be empty while it loads or when the load failed. */}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-1">
        {rows.map(({ series, depth }) => (
          <li
            key={series.id}
            // The name takes its own line and the actions go below, aligned to
            // the right: with three buttons alongside, a name like
            // «Correspondencia con galerías y salas de exposiciones» broke into
            // lines of two words. The phone is the primary device.
            className={`card flex flex-wrap items-center gap-2 ${series.active ? '' : 'opacity-60'}`}
            // Indentation as margin, so a long name wrapping keeps its level.
            style={{ marginLeft: `${depth * 1}rem` }}
          >
            {renaming?.id === series.id ? (
              <>
                <input
                  className="field basis-full"
                  autoFocus
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: series.id, name: e.target.value })}
                  aria-label={`Nuevo nombre de ${series.name}`}
                />
                <div className="ml-auto flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label="Guardar el nombre"
                    title="Guardar"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const message = await renameSeries(series.id, renaming.name)
                        if (!message) setRenaming(null)
                        return message
                      })
                    }
                  >
                    <YesIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Dejar el nombre como estaba"
                    title="Dejar el nombre como estaba"
                    className="btn-secondary"
                    onClick={() => setRenaming(null)}
                  >
                    <NoIcon className="h-5 w-5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="min-w-0 basis-full">
                  <span className="block break-words font-medium">{series.name}</span>
                  {/* The level is the domain's own word for what the indentation
                      says (RF-515), and on a phone the indentation of a third
                      level is two thumbs' width of nothing. */}
                  <span className="block text-xs text-stone-500">
                    {seriesLevelLabel(depth)}
                    {!series.active && ' · Retirada'}
                  </span>
                </span>
                <div className="ml-auto flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`Renombrar ${series.name}`}
                    title="Renombrar"
                    className="btn-secondary"
                    onClick={() => setRenaming({ id: series.id, name: series.name })}
                  >
                    <PenIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => setMoving(series.id)}
                  >
                    Mover
                  </button>
                  {series.active ? (
                    <button
                      type="button"
                      aria-label={`Retirar ${series.name}`}
                      title="Retirar"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void run(() => setSeriesActive(series.id, false))}
                    >
                      <BanIcon className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={busy}
                      onClick={() => void run(() => setSeriesActive(series.id, true))}
                    >
                      Recuperar
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {choosingParent && (
        <SeriesTreeSheet
          title="¿Dónde va la serie nueva?"
          tree={tree}
          value={parentId}
          noneLabel="Que sea un fondo"
          noneHint="Se creará en el primer nivel de la clasificación"
          onChange={(id) => {
            setParentId(id)
            setChoosingParent(false)
          }}
          onClose={() => setChoosingParent(false)}
        />
      )}

      {/* Moving uses the same sheet as choosing where to add, because it is the
          same question. What changes is that the node being moved and everything
          inside it are not on offer — that would be the cycle the trigger
          refuses — and that «no parent» here means «make it a fondo». */}
      {moving !== null && (
        <SeriesTreeSheet
          title="¿Dentro de qué serie?"
          tree={tree}
          value={tree.byId.get(moving)?.parent_id ?? null}
          exclude={seriesInside(tree, [moving])}
          noneLabel="Que no esté dentro de nada"
          noneHint="Pasa a ser un fondo de primer nivel"
          onChange={(id) => {
            const series = moving
            setMoving(null)
            void run(() => moveSeries(series, id))
          }}
          onClose={() => setMoving(null)}
        />
      )}
    </Layout>
  )
}

/**
 * Choosing a node of the tree, or none.
 *
 * Written here instead of reusing `PlacePicker`, and the reason is not the tree:
 * that picker also offers to CREATE what is typed, with the comma-path rules of
 * ADR-006 and a second button for the name that contains a comma, and every
 * label in it says «ubicación». Passing an archive series through it would show
 * the cataloger a sheet that talks about places and offers a syntax this table
 * does not have. What is shared is what is actually shared: the row layout, the
 * indentation as padding, and the rule that one tap chooses and closes.
 *
 * **Retired series are not offered as a destination.** Hanging a live series
 * inside a retired one produces exactly the state the deactivation trigger exists
 * to prevent, only reached from the other side. A retired node is brought back
 * from the list first, which is one tap away.
 */
function SeriesTreeSheet({
  title,
  tree,
  value,
  exclude,
  noneLabel,
  noneHint,
  onChange,
  onClose,
}: {
  title: string
  tree: SeriesTree
  value: string | null
  exclude?: ReadonlySet<string>
  noneLabel: string
  noneHint: string
  onChange: (id: string | null) => void
  onClose: () => void
}) {
  const rows = useMemo(
    () =>
      flattenSeries(
        tree,
        (series: ArchiveSeries) =>
          !(exclude?.has(series.id) ?? false) && (series.active || series.id === value),
      ),
    [tree, exclude, value],
  )

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div role="group" className="space-y-1">
        <SheetRow
          text={noneLabel}
          hint={noneHint}
          depth={0}
          active={value === null}
          onClick={() => onChange(null)}
        />
        {rows.map(({ series, depth }) => (
          <SheetRow
            key={series.id}
            text={series.name}
            hint={seriesLevelLabel(depth) + (series.active ? '' : ' · retirada')}
            depth={depth + 1}
            active={series.id === value}
            onClick={() => onChange(series.id)}
          />
        ))}
        {/* Never a blank page, not even inside a sheet. */}
        {rows.length === 0 && (
          <p className="px-3 py-2 text-sm text-stone-500">
            No hay ninguna otra serie donde meterla, así que de momento solo puede ser un fondo.
          </p>
        )}
      </div>
    </BottomSheet>
  )
}

/** One row of the sheet, indented by depth so the hierarchy is read and not deduced. */
function SheetRow({
  text,
  hint,
  depth,
  active,
  onClick,
}: {
  text: string
  hint: string
  depth: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
        active ? 'bg-stone-800 text-white' : 'text-stone-800 active:bg-stone-100'
      }`}
      // Indentation as padding and not as spaces: it survives a long name
      // wrapping onto a second line, which on a phone is the normal case.
      style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{text}</span>
        <span className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>
          {hint}
        </span>
      </span>
      {active && <YesIcon className="h-5 w-5 shrink-0" />}
    </button>
  )
}
