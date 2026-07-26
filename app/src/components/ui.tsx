import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { TriEstado } from '../lib/tipos'

// ── Iconos ──────────────────────────────────────────────────
// SVG en línea, sin librería: son cinco iconos y añadir una dependencia entera
// para eso engorda el paquete que se descarga en el almacén con mala cobertura.
// `currentColor` para que hereden el color del botón y funcionen en cualquier estado.

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconoSi({ clase = 'h-6 w-6' }: { clase?: string }) {
  return (
    <svg {...svg} className={clase}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function IconoNo({ clase = 'h-6 w-6' }: { clase?: string }) {
  return (
    <svg {...svg} className={clase}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function IconoSinRevisar({ clase = 'h-6 w-6' }: { clase?: string }) {
  return (
    <svg {...svg} className={clase}>
      <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4" />
      <path d="M12 18h.01" />
    </svg>
  )
}

export function IconoMenos({ clase = 'h-7 w-7' }: { clase?: string }) {
  return (
    <svg {...svg} className={clase}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function IconoMas({ clase = 'h-7 w-7' }: { clase?: string }) {
  return (
    <svg {...svg} className={clase}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconoCandado({ clase = 'h-4 w-4' }: { clase?: string }) {
  return (
    <svg {...svg} strokeWidth={2} className={clase}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

// ── Selector de tres estados con iconos ─────────────────────

const ESTADOS: { valor: TriEstado; etiqueta: string; Icono: typeof IconoSi }[] = [
  { valor: 'SI', etiqueta: 'Sí', Icono: IconoSi },
  { valor: 'NO', etiqueta: 'No', Icono: IconoNo },
  { valor: 'SIN_REVISAR', etiqueta: 'Sin revisar', Icono: IconoSinRevisar },
]

/**
 * Los tres valores a la vista y a un toque, en vez de un desplegable que exige
 * abrir, buscar y elegir.
 *
 * El icono de «Sin revisar» es una interrogación y no un hueco a propósito: es un
 * estado con significado —«todavía no lo hemos mirado»—, distinto de «No», y la
 * interfaz no debe insinuar que sea una ausencia de respuesta.
 */
export function TriEstadoIconos({
  valor,
  alCambiar,
  etiqueta,
  id,
}: {
  valor: TriEstado
  alCambiar: (v: TriEstado) => void
  etiqueta: string
  id: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`} className="etiqueta">
        {etiqueta}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {ESTADOS.map(({ valor: v, etiqueta: texto, Icono }) => {
          const activo = valor === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => alCambiar(v)}
              className={`flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border-2 transition ${
                activo
                  ? 'border-stone-800 bg-stone-800 text-white'
                  : 'border-stone-300 bg-white text-stone-500'
              }`}
            >
              <Icono />
              <span className="text-xs font-medium">{texto}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Botón con repetición al mantener pulsado ────────────────

function BotonRepetible({
  alPaso,
  etiqueta,
  children,
}: {
  alPaso: () => void
  etiqueta: string
  children: ReactNode
}) {
  const refEspera = useRef<number | null>(null)
  const refRepeticion = useRef<number | null>(null)
  const refRepitio = useRef(false)

  const detener = useCallback(() => {
    if (refEspera.current !== null) window.clearTimeout(refEspera.current)
    if (refRepeticion.current !== null) window.clearInterval(refRepeticion.current)
    refEspera.current = null
    refRepeticion.current = null
  }, [])

  // Sin esto, desmontar el componente con el dedo apoyado deja el intervalo vivo.
  useEffect(() => detener, [detener])

  function iniciar() {
    refRepitio.current = false
    // 400 ms antes de empezar a repetir: por debajo de eso, un toque normal
    // acabaría avanzando dos años.
    refEspera.current = window.setTimeout(() => {
      refRepitio.current = true
      refRepeticion.current = window.setInterval(alPaso, 90)
    }, 400)
  }

  return (
    <button
      type="button"
      aria-label={etiqueta}
      onPointerDown={iniciar}
      onPointerUp={detener}
      onPointerLeave={detener}
      onPointerCancel={detener}
      // El paso simple va en onClick y no en onPointerDown para que el teclado
      // también funcione. El indicador refRepitio evita que, al soltar tras una
      // pulsación sostenida, el click añada un año de más.
      onClick={() => {
        if (!refRepitio.current) alPaso()
        refRepitio.current = false
      }}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-stone-300
                 bg-white text-stone-700 active:bg-stone-200"
    >
      {children}
    </button>
  )
}

/**
 * Año con − y +, y el número tocable para teclearlo directamente.
 *
 * Mantener pulsado acelera: sin eso, ir de 1968 a 1985 son diecisiete toques y
 * nadie lo hace — abriría el teclado, que es justo lo que se quiere evitar
 * cuando se cataloga de pie.
 */
export function PasoAnio({
  valor,
  alCambiar,
  id,
  etiqueta,
  minimo,
  maximo,
}: {
  valor: number | null
  alCambiar: (delta: number) => void
  id: string
  etiqueta: string
  minimo: number
  maximo: number
}) {
  return (
    <div>
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <BotonRepetible alPaso={() => alCambiar(-1)} etiqueta={`${etiqueta}: un año menos`}>
          <IconoMenos />
        </BotonRepetible>

        <input
          id={id}
          className="campo h-14 flex-1 text-center text-2xl font-semibold tabular-nums"
          inputMode="numeric"
          value={valor ?? ''}
          placeholder="—"
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ''))
            if (!Number.isFinite(n) || n === 0) return
            // Se comunica como delta para que el ajuste de límites viva en un
            // solo sitio y no se duplique aquí.
            if (n >= minimo && n <= maximo) alCambiar(n - (valor ?? n))
          }}
        />

        <BotonRepetible alPaso={() => alCambiar(1)} etiqueta={`${etiqueta}: un año más`}>
          <IconoMas />
        </BotonRepetible>
      </div>

      {/* Desde vacío, los botones parten del año en curso, y bajar hasta los años
          sesenta serían decenas de toques. Se dice que el número se puede teclear:
          una vez por lote, y a partir de ahí ya se ajusta con los botones, porque
          la fecha se arrastra de una obra a la siguiente. */}
      {valor == null && (
        <p className="mt-1 text-xs text-stone-500">
          Toca el número para escribir el año. Después se ajusta con − y +, y se mantiene pulsado para
          avanzar rápido.
        </p>
      )}
    </div>
  )
}

// ── Interruptor táctil ──────────────────────────────────────

export function Interruptor({
  activo,
  alCambiar,
  etiqueta,
  ayuda,
}: {
  activo: boolean
  alCambiar: (v: boolean) => void
  etiqueta: string
  ayuda?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => alCambiar(!activo)}
      className={`flex w-full min-h-toque items-center justify-between gap-3 rounded-lg border-2 px-3 py-2
                  text-left transition ${
                    activo
                      ? 'border-stone-800 bg-stone-800 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
    >
      <span>
        <span className="block text-sm font-medium">{etiqueta}</span>
        {ayuda && (
          <span className={`block text-xs ${activo ? 'text-stone-300' : 'text-stone-500'}`}>
            {ayuda}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
          activo ? 'bg-white/30' : 'bg-stone-200'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition ${activo ? 'translate-x-5' : ''}`}
        />
      </span>
    </button>
  )
}

// ── Fichas de selección ─────────────────────────────────────

export function Fichas<T extends string>({
  opciones,
  valor,
  alCambiar,
  etiqueta,
  id,
}: {
  opciones: readonly { valor: T; texto: string }[]
  valor: T | null
  alCambiar: (v: T) => void
  etiqueta: string
  id: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`} className="etiqueta">
        {etiqueta}
      </span>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => {
          const activo = valor === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => alCambiar(o.valor)}
              className={`min-h-toque rounded-full border-2 px-4 text-sm font-medium transition ${
                activo
                  ? 'border-stone-800 bg-stone-800 text-white'
                  : 'border-stone-300 bg-white text-stone-700'
              }`}
            >
              {o.texto}
            </button>
          )
        })}
      </div>
    </div>
  )
}
