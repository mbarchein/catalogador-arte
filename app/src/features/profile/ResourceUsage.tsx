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
 * El espacio que queda, en el perfil y bajo «Sobre la aplicación» (RF-1202).
 *
 * Tres barras y no una: ver `resourceUsage.ts` para por qué no se suman. Cada una
 * dice lo que se preguntó —cuánto queda— y debajo, en pequeño, de qué es esa
 * cifra: la ficha, la fotografía de trabajo o el máster de archivo. Sin eso, tres
 * barras seguidas son tres números que no se sabe qué hacer con ellos.
 *
 * Se mide al abrir la pantalla y con «Actualizar», que es lo que se pidió. Contar
 * el archivo recorre el listado del bucket, así que no se repite sola.
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

/** El color de la barra. Solo hay tres estados y se ven de un vistazo. */
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
  /** Algo que matiza la cifra, cuando lo hay. */
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
