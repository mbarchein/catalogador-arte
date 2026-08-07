import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import {
  MIN_YEAR,
  adjustYear,
  maxYear,
  composeDate,
  type StructuredDate,
} from '../../lib/structuredDate'
import { ARTIST_LABEL, type ArtistFund, type TriState } from '../../lib/types'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import {
  ActionBar,
  Chips,
  ComboBox,
  FieldGroup,
  LoadingNotice,
  LockIcon,
  ToggleChip,
  TriStateIcons,
  YearStepper,
} from '../../components/ui'
import { CORRECTED_NOT_GENERATED, uploadShot, type CorrectedCopyResult } from '../../lib/images'
import { renderCorrectedCopy } from '../../lib/imageRender'
import { isNoEdit } from '../../lib/imageEdits'
import { preparingCopyText, uploadStatusText } from './uploadProgress'
import { PhotoPicker, type QueuedShot } from './PhotoPicker'
import { saveQueue, readQueue, rehydrate, clearQueue } from './photoQueue'
import { previewId } from './useArtworks'
import { useArtworkTypes } from './useArtworkTypes'
import { useSeries } from './useSeries'
import { usePhysicalPlaces } from './usePhysicalPlaces'
import { PlacePicker } from './PlacePicker'
import {
  INITIAL_BATCH,
  saveBatch,
  readBatch,
  batchConfigured,
  forgetBatch,
  type Batch,
} from './batch'

const FUNDS = [
  { value: 'ROTILI' as ArtistFund, text: ARTIST_LABEL.ROTILI },
  { value: 'RUIZ_CAMPINS' as ArtistFund, text: ARTIST_LABEL.RUIZ_CAMPINS },
  { value: 'TEST' as ArtistFund, text: ARTIST_LABEL.TEST },
]

/**
 * RF-1204 and RF-1205: batch capture, touch-first and one-handed.
 *
 * The screen has two states. First a batch is **opened** by choosing fund and
 * artwork type, which stay fixed. Then artworks are captured one after another
 * without touching them again.
 *
 * The distinction between fixed and carried is deliberate and visible: the
 * fixed fields appear under a lock, and changing them requires closing the
 * batch. If they were merely "values that persist", it would be easy to
 * unknowingly drag an artwork type onto a piece that is not one, and that is a
 * false datum in the catalog, not an interface annoyance.
 */
export function CapturePage() {
  const access = useEditingAccess()

  // Controlled vocabulary for the batch's fixed type (RF-213). Loaded here
  // and not inside the opening screen so it is ready before the batch opens.
  const { types: artworkTypes, addType } = useArtworkTypes()

  // Locations already used, as loose suggestions while typing (free text).
  const { tree: placeTree, ensurePlace, addPlaceInside } = usePhysicalPlaces()

  const [batch, setBatch] = useState<Batch>(() => readBatch())
  const [open, setOpen] = useState(() => batchConfigured(readBatch()))
  // Series dropped because the fund changed, to say so instead of letting it
  // vanish silently. Null when there is nothing to explain.
  const [seriesCleared, setSeriesCleared] = useState<string | null>(null)

  // Series vocabulary for the batch's fixed series (empty is legitimate). It
  // is the vocabulary OF THE BATCH'S FUND: a series belongs to one artist, so
  // this list follows the fund chosen above (see changeFund).
  const { names: seriesNames, addSeries } = useSeries(batch.fixed.artist)

  // Fields of the concrete artwork: never carried over.
  const [title, setTitle] = useState('')
  const [height, setHeight] = useState('')
  const [width, setWidth] = useState('')
  const [depth, setDepth] = useState('')
  const [signed, setSigned] = useState<TriState>('UNREVIEWED')

  const [range, setRange] = useState(false)
  const [previewedId, setPreviewedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [shots, setShots] = useState<QueuedShot[]>([])
  // An already-created artwork whose photos did not finish uploading. While it
  // has a value, the button retries the upload instead of creating another
  // artwork: in a storage room with intermittent coverage, failing midway is
  // normal, and creating a second record for it would be exactly the duplicate
  // the field schema fears.
  const [pendingArtwork, setPendingArtwork] = useState<string | null>(null)
  const [queueRestored, setQueueRestored] = useState(false)
  /**
   * Why a photograph of this piece has no full-resolution corrected copy, in the
   * generator's own words (RF-420).
   *
   * It is said next to the code of the saved record and never instead of it: the shot IS
   * registered and its correction IS stored, and what is missing is the file that goes to
   * a print shop, which a computer generates later (RF-421). Saying nothing is what
   * ADR-010 refuses — a queue nobody knows about is never emptied.
   */
  const [copyPending, setCopyPending] = useState<string | null>(null)

  /** The bytes of the photograph going up right now, or null when nothing is (RNF-106). */
  const [uploading, setUploading] = useState<string | null>(null)

  useEffect(() => {
    saveBatch(batch)
  }, [batch])

  // Restores the photos left pending. It is the safety net against the phone
  // discarding the tab while the camera is in the foreground: on return, the
  // page reloads and without this the photos already taken would vanish.
  useEffect(() => {
    let current = true
    void readQueue().then((rows) => {
      if (!current) return
      if (rows.length > 0) {
        setShots(rows.map((r) => ({ ...rehydrate(r), status: 'pending' as const })))
      }
      setQueueRestored(true)
    })
    return () => {
      current = false
    }
  }, [])

  // Persisted as soon as it changes, not on save: the tab discard gives no
  // warning, and saving "when due" would be exactly too late.
  //
  // The `queueRestored` guard is not a theoretical precaution: without it this
  // effect runs on mount with the queue still empty and DELETES what had just
  // been stored, so the safety net destroyed precisely what it came to save.
  // Seen while reproducing the failure.
  useEffect(() => {
    if (!queueRestored) return
    void saveQueue(shots)
  }, [shots, queueRestored])

  useEffect(() => {
    if (!open) return
    let current = true
    void previewId(batch.fixed.artist).then((id) => {
      if (current) setPreviewedId(id)
    })
    return () => {
      current = false
    }
  }, [open, batch.fixed.artist, saved.length])

  // Same order as everywhere else: the message only after the role is known, or a
  // reload of this address would tell the cataloger she cannot catalog.
  if (access === 'loading') {
    return (
      <Layout title="Captura" back="/">
        <LoadingNotice />
      </Layout>
    )
  }
  if (access === 'denied') {
    return (
      <Layout title="Captura" back="/">
        <div className="card">
          <p className="font-medium">No tienes permiso para dar de alta obra.</p>
          <p className="mt-1 text-sm text-stone-600">
            Tu cuenta es de solo consulta. Habla con el responsable del catálogo si necesitas
            catalogar.
          </p>
        </div>
      </Layout>
    )
  }

  const date = batch.carried.date
  function setDate(change: Partial<StructuredDate>) {
    setBatch((b) => ({
      ...b,
      carried: { ...b.carried, date: { ...b.carried.date, ...change } },
    }))
  }

  /**
   * Changing the fund EMPTIES the chosen series, and says so.
   *
   * A series belongs to one artist: the database only accepts a series from
   * the vocabulary of the artwork's own fund, so keeping it would leave the
   * batch holding a combination that cannot be saved — the failure would show
   * up later, on the first artwork, with the batch already open. And even when
   * both funds happen to have a series with the same name, they are two
   * different series, so carrying it over would be inventing a datum.
   */
  function changeFund(artist: ArtistFund) {
    if (batch.fixed.artist === artist) return
    setSeriesCleared(batch.fixed.series !== '' ? batch.fixed.series : null)
    setBatch((b) => ({ ...b, fixed: { ...b.fixed, artist, series: '' } }))
  }

  // ── Opening the batch ─────────────────────────────────────
  if (!open) {
    return (
      <Layout title="Abrir lote" back="/">
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Un lote agrupa las obras que vas a capturar seguidas: una estantería, una carpeta, una
            serie.
          </p>

          <FieldGroup title="Fijo en todo el lote" hint="cambiarlo exige cerrar el lote">
            <Chips
              id="fund"
              label="Fondo"
              options={FUNDS}
              value={batch.fixed.artist}
              onChange={changeFund}
            />

            {/* Open list (RF-213): the vocabulary suggests without closing —
                an unknown type can be added to the shared catalog right here.
                Only editors reach this page (guarded above), so offering the
                add row is always legitimate. */}
            <ComboBox
              id="type"
              label="Tipo de obra"
              value={batch.fixed.artworkType}
              onChange={(v) => setBatch((b) => ({ ...b, fixed: { ...b.fixed, artworkType: v } }))}
              options={artworkTypes}
              placeholder="Busca en el catálogo de tipos"
              addLabel={(t) => `Añadir «${t}» al catálogo de tipos`}
              onAdd={addType}
            />

            {/* The series is fixed too: a batch is usually one series, and
                retyping its name on every piece is how two spellings of the
                same series appear. It may stay empty — not every batch belongs
                to one — so it does not gate opening the batch. The offered set
                is the one of the fund chosen above (see changeFund). */}
            <ComboBox
              id="series"
              label="Serie"
              value={batch.fixed.series}
              onChange={(v) => {
                setSeriesCleared(null)
                setBatch((b) => ({ ...b, fixed: { ...b.fixed, series: v } }))
              }}
              options={seriesNames}
              placeholder="Busca en el catálogo de series"
              emptyLabel="Sin serie"
              addLabel={(t) => `Añadir «${t}» a las series de ${ARTIST_LABEL[batch.fixed.artist]}`}
              onAdd={(name) => addSeries(name, batch.fixed.artist)}
            />
            {seriesCleared && (
              <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                Se ha quitado la serie «{seriesCleared}»: cada fondo tiene sus propias series.
                Elige una de {ARTIST_LABEL[batch.fixed.artist]} si el lote pertenece a alguna.
              </p>
            )}
          </FieldGroup>

          <FieldGroup title="Ubicación física" hint="se arrastra, ajustable en cada obra">
            <PlacePicker
              id="batch-location"
              label="Ubicación física"
              value={batch.carried.placeId}
              tree={placeTree}
              ensurePlace={ensurePlace}
              addPlaceInside={addPlaceInside}
              onChange={(placeId) =>
                setBatch((b) => ({ ...b, carried: { ...b.carried, placeId } }))
              }
            />
          </FieldGroup>

          <ActionBar
            notice={
              !batchConfigured(batch) ? (
                <p className="text-xs text-stone-500">
                  Elige o escribe un tipo de obra para empezar.
                </p>
              ) : null
            }
          >
            <button
              type="button"
              className="btn-primary min-h-[3.25rem] flex-1 text-base"
              disabled={!batchConfigured(batch)}
              onClick={() => setOpen(true)}
            >
              Empezar a capturar
            </button>
          </ActionBar>
        </div>
      </Layout>
    )
  }

  // ── Capture ───────────────────────────────────────────────

  /**
   * Uploads the shots not yet up, one at a time. Sequential and not parallel
   * on purpose: three files per photo over a storage-room connection get in
   * each other's way, and photo-by-photo progress is what tells what is
   * missing if something cuts off.
   */
  async function uploadPending(artworkId: string, queue: QueuedShot[]): Promise<QueuedShot[]> {
    let current = queue
    const pending: string[] = []
    // Counted over what is actually going up: a retry of a record whose photos did not
    // finish skips the ones already stored, and «3 de 7» when only three are left would
    // be a count of something nobody asked about.
    const total = queue.filter((s) => s.status !== 'uploaded').length
    let index = 0
    for (const s of queue) {
      if (s.status === 'uploaded') continue
      index += 1
      const position = { index, count: total }
      current = current.map((x) =>
        x.key === s.key ? { ...x, status: 'uploading' as const, error: undefined } : x,
      )
      setShots(current)
      try {
        setUploading(
          isNoEdit(s.prepared.edit)
            ? uploadStatusText(position)
            : preparingCopyText(position.index, position.count),
        )
        const correctedCopy = await correctedCopyOf(s)
        setUploading(uploadStatusText(position))
        const result = await uploadShot(artworkId, s.prepared, {
          shotType: s.shotType,
          isIndex: s.isIndex,
          cropSource: s.prepared.cropSource,
          // The full-resolution copy with everything applied (RF-420), built HERE because
          // this is the one moment the master is already in memory: doing it later would
          // mean downloading it again over the connection of a storage room.
          correctedCopy,
          onProgress: (step, event, attempt) =>
            setUploading(uploadStatusText({ ...position, step, ...event, attempt })),
        })
        if (result.correctedPending) pending.push(result.correctedPending)
        current = current.map((x) => (x.key === s.key ? { ...x, status: 'uploaded' as const } : x))
      } catch (err) {
        current = current.map((x) =>
          x.key === s.key
            ? { ...x, status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
            : x,
        )
      }
      setShots(current)
    }
    setUploading(null)
    // The first reason and how many share it: they are all the same sentence when the
    // phone is the same phone, and repeating it once per photograph would bury the code of
    // the record, which is what has to be written on the physical label.
    setCopyPending(
      pending.length === 0
        ? null
        : pending.length === 1
          ? (pending[0] ?? null)
          : `${pending.length} fotografías sin copia a resolución completa: ${pending[0]}`,
    )
    return current
  }

  /**
   * The full-resolution corrected copy of a shot about to be uploaded (RF-420).
   *
   * It never throws and never takes the upload down with it: a master that will not
   * decode, or a canvas ceiling this phone cannot reach, leaves the copy pending — a row
   * that says «hace falta y falta» and a queue a computer empties later (RF-421). Losing
   * the photograph over the fourth level would be the wrong trade by a wide margin, and a
   * shot with no correction answers «no hace falta» without decoding anything.
   */
  async function correctedCopyOf(shot: QueuedShot): Promise<CorrectedCopyResult> {
    try {
      return await renderCorrectedCopy(shot.prepared.master, shot.prepared.edit)
    } catch {
      return { status: 'PENDING', reason: CORRECTED_NOT_GENERATED }
    }
  }

  function clearPiece(savedId: string) {
    shots.forEach((s) => URL.revokeObjectURL(s.prepared.preview))
    setShots([])
    void clearQueue()
    setPendingArtwork(null)
    setSaved((g) => (g.includes(savedId) ? g : [...g, savedId]))
    setTitle('')
    setHeight('')
    setWidth('')
    setDepth('')
    setSigned('UNREVIEWED')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    // What was pending belonged to the previous piece. It survives `clearPiece`, because
    // it is read next to the code of the record just saved, and it is cleared here.
    setCopyPending(null)

    // Retry: the artwork already exists and only photos are missing.
    if (pendingArtwork) {
      const result = await uploadPending(pendingArtwork, shots)
      const failed = result.filter((s) => s.status === 'error')
      if (failed.length === 0) {
        clearPiece(pendingArtwork)
      } else {
        setError(`Siguen fallando ${failed.length} de ${result.length} fotos.`)
      }
      setSaving(false)
      return
    }

    const toNumber = (v: string) => {
      const clean = v.replace(',', '.').trim()
      if (clean === '') return null
      const n = Number(clean)
      return Number.isFinite(n) ? n : null
    }

    // catalog_id is omitted: the database assigns it with a per-fund lock
    // (ADR-003). And execution_date is NOT sent: it is a generated column the
    // database composes from the structured fields (ADR-004) — writing it
    // would be an error, and this way text and structure cannot diverge.
    const { data, error } = await supabase
      .from('artworks')
      .insert({
        artist: batch.fixed.artist,
        artwork_type: batch.fixed.artworkType.trim(),
        series: batch.fixed.series.trim(),
        title: title.trim(),
        // RF-209: a written title at capture time has unverified authorship;
        // a blank one stays pending. The constraint
        // artworks_attributed_title_matches_title rejects any other pairing.
        attributed_title: title.trim() === '' ? 'UNREVIEWED' : 'UNCONFIRMED',
        height_cm: toNumber(height),
        width_cm: toNumber(width),
        depth_cm: toNumber(depth),
        technique: batch.carried.technique.trim(),
        start_year: date.year,
        end_year: range ? date.endYear : null,
        approximate_date: date.year != null && date.approximate,
        unconfirmed_date: date.year != null && date.unconfirmed,
        signed,
        physical_place_id: batch.carried.placeId,
      })
      .select('catalog_id')
      .single()

    if (error) {
      // Nothing is cleared: in a storage room with intermittent coverage,
      // retyping everything is unacceptable (RF-1207).
      setError(error.message)
      setSaving(false)
      return
    }

    const id = (data as { catalog_id: string }).catalog_id

    // The artwork now exists; the photos next. If any fails, the record is NOT
    // lost: it is noted as pending and the button switches to retrying the
    // photos only.
    if (shots.length > 0) {
      const result = await uploadPending(id, shots)
      const failed = result.filter((s) => s.status === 'error')
      if (failed.length > 0) {
        setPendingArtwork(id)
        setError(
          `La ficha ${id} se ha guardado, pero ${failed.length} de ${result.length} fotos no han subido.`,
        )
        setSaving(false)
        return
      }
    }

    // Only what belongs to the piece is cleared. Fund and type stay fixed;
    // date, technique and location carry over as they were left.
    clearPiece(id)
    setSaving(false)
  }

  const last = saved[saved.length - 1]

  return (
    <Layout title="Captura en lote" back="/">
      {/* Batch header: the fixed part, under a lock and always in sight.
          Knowing what is being inherited is what prevents discovering at
          artwork thirty that the type was wrong. */}
      <div className="mb-3 rounded-xl border-2 border-stone-800 bg-stone-800 p-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-stone-300">
              <LockIcon />
              Fijo en este lote
            </p>
            <p className="mt-0.5 truncate font-medium">
              {ARTIST_LABEL[batch.fixed.artist]} · {batch.fixed.artworkType}
              {batch.fixed.series !== '' && ` · ${batch.fixed.series}`}
            </p>
            <p className="mt-0.5 text-xs text-stone-300">
              {saved.length === 0
                ? 'Ninguna obra guardada todavía'
                : `${saved.length} ${saved.length === 1 ? 'obra' : 'obras'} en este lote`}
              {previewedId && ` · siguiente ${previewedId}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-touch shrink-0 rounded-lg border border-stone-500 px-3 text-sm"
          >
            Cambiar
          </button>
        </div>
      </div>

      <form onSubmit={save} className="space-y-3">
        {/* The order of the groups follows the physical gesture: one reaches
            the artwork, PHOTOGRAPHS it, measures and examines it, and only at
            the end adjusts what carries over from the previous piece — which
            most times is not touched. */}

        <FieldGroup
          title="Fotografías"
          hint={shots.length > 0 ? `${shots.length} en cola` : 'la primera será la del índice'}
        >
          <PhotoPicker shots={shots} onChange={setShots} disabled={saving} />
        </FieldGroup>

        <FieldGroup title="Esta pieza" hint="se vacía al guardar">
          <div>
            <label className="label" htmlFor="title">
              Título <span className="font-normal text-stone-500">(vacío si no tiene)</span>
            </label>
            <input
              id="title"
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <p className="label">Medidas en centímetros</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['height', 'Alto', height, setHeight],
                  ['width', 'Ancho', width, setWidth],
                  ['depth', 'Prof.', depth, setDepth],
                ] as const
              ).map(([id, label, value, set]) => (
                <div key={id}>
                  <label className="mb-1 block text-xs text-stone-500" htmlFor={id}>
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      id={id}
                      className="field h-14 pr-8 text-center text-xl tabular-nums"
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-stone-400"
                    >
                      cm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <TriStateIcons
            id="signed"
            label="Firmada"
            value={signed}
            onChange={setSigned}
          />
        </FieldGroup>

        <FieldGroup title="Fecha de ejecución" hint="se arrastra a la siguiente">
          {range ? (
            /* Both years of the range on the same line: they are one datum. */
            <div className="grid grid-cols-2 gap-2">
              <YearStepper
                id="year"
                label="Año inicial"
                compact
                value={date.year}
                min={MIN_YEAR}
                max={maxYear()}
                onChange={(year) => setDate({ year })}
              />
              <YearStepper
                id="end-year"
                label="Año final"
                compact
                value={date.endYear}
                min={MIN_YEAR}
                max={maxYear()}
                onChange={(endYear) => setDate({ endYear })}
              />
            </div>
          ) : (
            <YearStepper
              id="year"
              label="Año"
              value={date.year}
              min={MIN_YEAR}
              max={maxYear()}
              onChange={(year) => setDate({ year })}
            />
          )}

          {/* The three flags on one line, with the same visual language as the
              Yes/No/Unreviewed selector. What each one means lives in the help
              line below, once. */}
          <div className="grid grid-cols-3 gap-2">
            <ToggleChip
              label="Aproximada"
              active={date.approximate}
              onChange={(v) => setDate({ approximate: v })}
            />
            <ToggleChip
              label="Rango"
              active={range}
              onChange={(v) => {
                setRange(v)
                // When opening the range, the next year is proposed so the
                // first tap of + is already useful.
                if (v && date.year != null && date.endYear == null) {
                  setDate({ endYear: adjustYear(date.year, 1) })
                }
              }}
            />
            <ToggleChip
              label="Sin confirmar"
              active={date.unconfirmed}
              onChange={(v) => setDate({ unconfirmed: v })}
            />
          </div>

          <p className="text-xs text-stone-500">
            «Aproximada»: de alrededor de ese año (c.). «Sin confirmar»: se desconoce; el año es
            una estimación ([?]).
          </p>

          {/* What will be saved is shown. aria-live because the text changes
              without the focus moving. */}
          <p
            id="date-preview"
            aria-live="polite"
            className="rounded-lg bg-stone-100 px-3 py-2 text-sm"
          >
            {date.year == null ? (
              <span className="text-stone-500">Sin fechar</span>
            ) : (
              <>
                Se guardará como{' '}
                <span className="font-medium">
                  {composeDate(range ? date : { ...date, endYear: null })}
                </span>
              </>
            )}
          </p>
        </FieldGroup>

        <FieldGroup title="Técnica y ubicación" hint="se arrastran a la siguiente">
          <div>
            <label className="label" htmlFor="technique">
              Técnica
            </label>
            <input
              id="technique"
              className="field"
              placeholder="Óleo sobre lienzo"
              value={batch.carried.technique}
              onChange={(e) =>
                setBatch((b) => ({ ...b, carried: { ...b.carried, technique: e.target.value } }))
              }
            />
          </div>

          <PlacePicker
            id="location"
            label="Ubicación física"
            value={batch.carried.placeId}
            tree={placeTree}
            ensurePlace={ensurePlace}
            addPlaceInside={addPlaceInside}
            onChange={(placeId) => setBatch((b) => ({ ...b, carried: { ...b.carried, placeId } }))}
          />
        </FieldGroup>

        {saved.length > 0 && (
          <div className="card">
            <p className="text-sm font-medium">Guardadas en este lote</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {saved.map((id) => (
                <li key={id}>
                  <Link
                    to={`/artwork/${id}`}
                    className="inline-block rounded bg-stone-100 px-2 py-1 font-mono text-xs underline"
                  >
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">
              Comprueba que las etiquetas físicas coinciden con esta lista antes de cerrar el lote.
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            forgetBatch()
            void clearQueue()
            shots.forEach((s) => URL.revokeObjectURL(s.prepared.preview))
            setShots([])
            setBatch(INITIAL_BATCH)
            setSaved([])
            setRange(false)
            setOpen(false)
          }}
        >
          Cerrar lote
        </button>

        {/* Fixed bar: saving always under the thumb, and the result of saving
            — the code to write on the physical label — always in sight, not at
            the top of the page where one would have to go look for it. */}
        <ActionBar
          notice={
            error ? (
              <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
                No se ha podido guardar: {error} Los datos siguen aquí.
              </p>
            ) : uploading ? (
              // While it is going up, the bytes take the place of the saved-code line:
              // there is no code yet, and «Guardando…» on the button for two minutes says
              // nothing about whether it is moving (RNF-106).
              <p role="status" className="rounded-lg bg-stone-100 p-2 text-sm text-stone-700">
                {uploading}
              </p>
            ) : last ? (
              <div className="space-y-1">
                <p
                  role="status"
                  className="flex items-baseline justify-between gap-2 rounded-lg bg-green-50 p-2 text-sm text-green-900"
                >
                  <span>
                    Guardada como{' '}
                    <span className="font-mono text-base font-bold">{last}</span> — escríbelo en
                    la etiqueta
                  </span>
                  <Link to={`/artwork/${last}`} className="shrink-0 underline">
                    Ver ficha
                  </Link>
                </p>
                {/* Said in a lower voice and underneath, never in place of the code: the
                    photograph and its correction are saved, and what is missing is the copy
                    for a print shop. It is not an error and it is not silence either. */}
                {copyPending && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{copyPending}</p>
                )}
              </div>
            ) : null
          }
        >
          {pendingArtwork && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                // Honest exit: the record exists and gets completed later from
                // its page. What is not done is pretending the photos went up.
                clearPiece(pendingArtwork)
                setError(null)
              }}
            >
              Sin esas fotos
            </button>
          )}
          <button className="btn-primary min-h-[3.25rem] flex-1 text-base" disabled={saving}>
            {saving
              ? 'Guardando…'
              : pendingArtwork
                ? `Reintentar fotos de ${pendingArtwork}`
                : shots.length > 0
                  ? `Guardar con ${shots.length} ${shots.length === 1 ? 'foto' : 'fotos'}`
                  : 'Guardar y siguiente'}
          </button>
        </ActionBar>
      </form>
    </Layout>
  )
}
