import { useResourceUsageOnMount } from './useResourceUsage'
import {
  bytesText,
  freeText,
  measuredText,
  objectsText,
  truncatedNotice,
  usageLevel,
  usageWarning,
  usedPercent,
  DATABASE_LIMIT_BYTES,
  MASTERS_LIMIT_BYTES,
  PLAN_NOTICE,
  STORAGE_LIMIT_BYTES,
  type UsageLevel,
} from './resourceUsage'

/**
 * The space left, in the profile and under «Sobre la aplicación» (RF-1202).
 *
 * Three bars and not one: see `resourceUsage.ts` for why they are not added up. Each one
 * says what was asked —how much is left— and below, in small print, what that
 * figure is of: the record, the working photograph or the archive master. Without that, three
 * bars in a row are three numbers one does not know what to do with.
 *
 * It is measured on opening the screen and with «Actualizar», which is what was asked for. Counting
 * the archive walks the bucket's listing, so it does not repeat itself.
 */
export function ResourceUsage() {
  const { usage, masters, usageError, mastersError, loading, measuredAt, refresh } =
    useResourceUsageOnMount()

  return (
    <section className="card mb-3">
      <h2 className="mb-2 font-medium">Espacio ocupado</h2>
      <p className="mb-3 text-sm text-stone-600">
        Cuánto queda en cada uno de los tres sitios donde vive el catálogo.
      </p>

      {usageError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {usageError}
        </p>
      )}
      {mastersError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {mastersError}
        </p>
      )}

      {/* Nunca un hueco en silencio: mientras no hay medida se dice que se está
          midiendo, y si algo no llegó lo dice su propia línea de arriba. */}
      {usage === null && usageError === null && (
        <p className="mb-3 text-sm text-stone-600">Midiendo…</p>
      )}

      {usage && (
        <>
          <Gauge
            name="Base de datos"
            detail="Las fichas: títulos, medidas, procedencias, exposiciones."
            used={usage.databaseBytes}
            limit={DATABASE_LIMIT_BYTES}
          />
          <Gauge
            name="Fotografías"
            detail={`Las copias de trabajo y las miniaturas. ${objectsText(usage.storageObjects)}.`}
            used={usage.storageBytes}
            limit={STORAGE_LIMIT_BYTES}
          />
        </>
      )}

      {masters && (
        <Gauge
          name="Archivo de másters"
          detail={`Los originales de cada toma, que son lo que más pesa. ${objectsText(
            masters.objects,
          )}, contando las versiones anteriores.`}
          used={masters.bytes}
          limit={MASTERS_LIMIT_BYTES}
          notice={truncatedNotice(masters.truncated)}
        />
      )}
      {masters === null && mastersError === null && usage !== null && (
        <p className="mb-3 text-sm text-stone-600">Contando el archivo…</p>
      )}

      <button
        type="button"
        className="btn-secondary mt-1 w-full"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? 'Midiendo…' : 'Actualizar'}
      </button>

      <p className="mt-2 text-xs text-stone-500">
        {measuredText(measuredAt)}. {PLAN_NOTICE}
      </p>
    </section>
  )
}

/** The bar's colour. There are only three states and they are seen at a glance. */
const BAR: Record<UsageLevel, string> = {
  ok: 'bg-stone-700',
  warning: 'bg-amber-500',
  full: 'bg-red-600',
}

function Gauge({
  name,
  detail,
  used,
  limit,
  notice,
}: {
  name: string
  detail: string
  used: number
  limit: number
  /** Something qualifying the figure, when there is any. */
  notice?: string | null
}) {
  const percent = usedPercent(used, limit)
  const level = usageLevel(used, limit)
  const warning = usageWarning(name, used, limit)

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{name}</p>
        <p className="shrink-0 text-sm tabular-nums text-stone-600">{bytesText(used)}</p>
      </div>

      {/* La barra es la lectura rápida y el texto es la exacta. Lleva los mismos
          números en `aria-*` porque un dibujo sin cifra no lo lee nadie que use
          lector de pantalla, y aquí el dibujo ES el dato. */}
      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name}: ${percent}% ocupado`}
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-200"
      >
        <div className={`h-full ${BAR[level]}`} style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-1 text-xs text-stone-600">{freeText(used, limit)}</p>
      <p className="text-xs text-stone-500">{detail}</p>
      {notice && <p className="mt-1 text-xs text-amber-800">{notice}</p>}
      {warning && <p className="mt-1 text-xs text-amber-800">{warning}</p>}
    </div>
  )
}
