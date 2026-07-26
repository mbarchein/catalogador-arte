import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
 *
 * `alCambiar` recibe el **año resultante**, no un incremento. La primera versión
 * comunicaba incrementos, y teclear un año sobre el campo vacío daba un
 * incremento de cero, que significa «parte del año en curso»: escribir 1978 en un
 * campo vacío lo dejaba en 2026. Justo el caso de la primera obra de cada lote.
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
  alCambiar: (anio: number | null) => void
  id: string
  etiqueta: string
  minimo: number
  maximo: number
}) {
  // Borrador de lo que se está teclando. Sin él, el campo es controlado y «19»
  // —dos dígitos, todavía no un año— se descartaría a cada pulsación, con lo que
  // sería imposible escribir un año a mano.
  const [borrador, setBorrador] = useState<string | null>(null)
  const acotar = (n: number) => Math.min(maximo, Math.max(minimo, n))

  function paso(delta: number) {
    setBorrador(null)
    alCambiar(acotar((valor ?? maximo) + delta))
  }

  return (
    <div>
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <BotonRepetible alPaso={() => paso(-1)} etiqueta={`${etiqueta}: un año menos`}>
          <IconoMenos />
        </BotonRepetible>

        <input
          id={id}
          className="campo h-14 flex-1 text-center text-2xl font-semibold tabular-nums"
          inputMode="numeric"
          value={borrador ?? valor?.toString() ?? ''}
          placeholder="—"
          onBlur={() => setBorrador(null)}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, '').slice(0, 4)
            setBorrador(digitos)
            if (digitos === '') {
              // Vaciar el campo es «obra sin fechar», no un error.
              alCambiar(null)
              return
            }
            // Se propaga solo cuando ya es un año completo: acotar «19» a 1900
            // mientras se escribe daría saltos absurdos en pantalla.
            if (digitos.length === 4) alCambiar(acotar(Number(digitos)))
          }}
        />

        <BotonRepetible alPaso={() => paso(1)} etiqueta={`${etiqueta}: un año más`}>
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

// ── Grupo de campos con nombre ──────────────────────────────

/**
 * fieldset + legend, el patrón de agrupación de la otra aplicación del equipo.
 * Un formulario largo sin grupos nombrados obliga a leerlo entero para saber
 * dónde está cada cosa; con el nombre en el borde, el ojo salta directo.
 *
 * `pista` es para lo que el operador necesita saber del grupo entero antes de
 * rellenarlo — p. ej. «se arrastra a la obra siguiente» — sin repetirlo campo
 * a campo.
 */
export function Grupo({
  titulo,
  pista,
  children,
}: {
  titulo: string
  pista?: string
  children: ReactNode
}) {
  return (
    <fieldset className="rounded-xl border border-stone-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-stone-800">
        {titulo}
        {pista && <span className="ml-1.5 font-normal text-stone-500">· {pista}</span>}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  )
}

// ── Barra de acciones fija abajo ────────────────────────────

/**
 * En un formulario largo, el botón de guardar al final obliga a desplazarse
 * para encontrarlo. Fijado abajo queda siempre bajo el pulgar, que es donde se
 * trabaja a una mano. El padding-bottom respeta la barra inferior del móvil.
 */
export function BarraAcciones({ children, aviso }: { children: ReactNode; aviso?: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-stone-200 bg-stone-100/95 px-4 pt-3 backdrop-blur"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* El aviso va aquí y no arriba de la página: el resultado de pulsar un
          botón debe aparecer donde se acaba de pulsar, no donde haya que ir a
          buscarlo desplazándose. */}
      {aviso && <div className="mx-auto mb-2 max-w-3xl">{aviso}</div>}
      <div className="mx-auto flex max-w-3xl gap-2">{children}</div>
    </div>
  )
}

// ── Contraseña con mostrar/ocultar ──────────────────────────

/**
 * En el móvil, teclear una contraseña a ciegas produce erratas, y el mensaje de
 * credenciales es genérico a propósito (no dice si fue el correo o la clave).
 * Poder verla es la forma barata de salir de ese callejón.
 */
export function CampoContrasena({
  id,
  valor,
  alCambiar,
  autoComplete = 'current-password',
}: {
  id: string
  valor: string
  alCambiar: (v: string) => void
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        className="campo pr-12"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-stone-500"
      >
        {visible ? <IconoOjoTachado /> : <IconoOjo />}
      </button>
    </div>
  )
}

function IconoOjo() {
  return (
    <svg {...svg} strokeWidth={2} className="h-5 w-5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconoOjoTachado() {
  return (
    <svg {...svg} strokeWidth={2} className="h-5 w-5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <path d="M4 4l16 16" />
    </svg>
  )
}
