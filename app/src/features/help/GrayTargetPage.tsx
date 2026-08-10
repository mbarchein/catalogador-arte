import { useState, type ReactNode } from 'react'
import { Layout } from '../../components/Layout'
import { NoIcon, UnreviewedIcon, YesIcon } from '../../components/ui'

/**
 * How a grey target is used, for whoever photographs and does not program (RF-418, §4).
 *
 * It exists because the detection cannot explain itself: the editor can say «no
 * target has been found» and even why, but it cannot show in one line of
 * help where the chart is placed or why in shade it is of no use. And because the application
 * itself generates the printable sheet, so the place where it is downloaded is the same
 * where what it is for is told.
 *
 * **Illustrations drawn in SVG and not photographs** (the owner's decision). A
 * drawing shows the geometry —the chart next to the artwork, in the same plane, in the
 * same light— without dragging the weight of four photographs to a storeroom with poor
 * coverage, without becoming obsolete when the chart changes and without anybody confusing the
 * example with an artwork of the catalogue. They go inline, with `currentColor` where it can, like
 * `ui.tsx`'s icons.
 *
 * The sheet is generated with `grayTargetSheet.ts`, imported **dynamically**: it drags in
 * pdf-lib, and pdf-lib must not weigh on the application's start-up. It is the same path
 * as the artwork's printed record.
 */

/**
 * The greys of the drawn strip.
 *
 * They are the five codes the sheet prints (225, 180, 135, 90 and 45) in hexadecimal, and
 * they are written here by hand on purpose: importing them from `grayTargetSheet.ts` would put
 * pdf-lib in the initial bundle for one illustration. If the sheet changes its tones, this
 * drawing stays similar but not identical, and for a drawing that does not matter.
 */
const PATCHES = ['#e1e1e1', '#b4b4b4', '#878787', '#5a5a5a', '#2d2d2d'] as const

const WALL = '#f5f5f4'
const FLOOR = '#e7e5e4'
const FRAME = '#a8a29e'
const LINE = '#57534e'

/** The artwork hanging on the wall: frame, canvas and two strokes suggesting paint. */
function Artwork() {
  return (
    <g>
      <rect x="24" y="24" width="76" height="60" fill="#ffffff" stroke={FRAME} strokeWidth="3" />
      <path
        d="M32 74c10-16 16-6 24-18s14 4 22-10"
        fill="none"
        stroke={LINE}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="80" cy="38" r="6" fill="none" stroke={LINE} strokeWidth="2" />
    </g>
  )
}

/** Where the strip goes in the drawing: next to the artwork and at its same height. */
const TARGET_BOX = { x: 116, y: 44, width: 66, height: 21 } as const

/** The grey strip with its dark frame, just as it comes out printed. */
function Target({ opacity = 1 }: { opacity?: number }) {
  return (
    <g opacity={opacity}>
      <rect {...TARGET_BOX} fill="#1c1917" />
      {PATCHES.map((tone, i) => (
        <rect
          key={tone}
          x={TARGET_BOX.x + 3 + i * 12}
          y={TARGET_BOX.y + 3}
          width="12"
          height="15"
          fill={tone}
        />
      ))}
    </g>
  )
}

/** The room's lamp and where its light goes. */
function Light({ rays }: { rays: readonly { to: [number, number] }[] }) {
  return (
    <g>
      <circle cx="14" cy="12" r="5" fill="#fbbf24" />
      {rays.map(({ to }) => (
        <line
          key={`${to[0]}-${to[1]}`}
          x1="19"
          y1="16"
          x2={to[0]}
          y2={to[1]}
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}

/** The common stage: wall, floor and whatever each case adds on top. */
function Scene({ description, children }: { description: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 200 120"
      className="h-auto w-full rounded-lg border border-stone-200"
      role="img"
      aria-label={description}
    >
      <rect x="0" y="0" width="200" height="120" fill={WALL} />
      <rect x="0" y="96" width="200" height="24" fill={FLOOR} />
      <line x1="0" y1="96" x2="200" y2="96" stroke={FRAME} strokeWidth="1.5" />
      {children}
    </svg>
  )
}

type Verdict = 'ok' | 'note' | 'bad'

const VERDICT: Record<Verdict, { Icon: typeof YesIcon; className: string; text: string }> = {
  ok: { Icon: YesIcon, className: 'bg-green-50 text-green-900', text: 'Así sí' },
  // «Sin revisar» is not «no»: the photograph with no target is not badly taken.
  note: { Icon: UnreviewedIcon, className: 'bg-stone-100 text-stone-700', text: 'También vale' },
  bad: { Icon: NoIcon, className: 'bg-red-50 text-red-800', text: 'Así no' },
}

function Case({
  verdict,
  description,
  scene,
  children,
}: {
  verdict: Verdict
  /** The drawing's alternative text: what would be seen if it were seen. */
  description: string
  /** What is drawn over the wall and the floor. */
  scene: ReactNode
  /** The caption: what happens in this case, in one or two sentences. */
  children: ReactNode
}) {
  const { Icon, className, text } = VERDICT[verdict]
  return (
    <div className="mb-4 last:mb-0">
      <Scene description={description}>{scene}</Scene>
      <p className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${className}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide">{text}</span>
      </p>
      <p className="mt-1 text-sm text-stone-700">{children}</p>
    </div>
  )
}

export function GrayTargetPage() {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // pdf-lib is loaded only when the sheet is asked for: it must not fatten the start-up.
  async function downloadSheet() {
    setGenerating(true)
    setError('')
    try {
      const { generateGrayTargetSheet, GRAY_TARGET_SHEET_FILENAME } = await import(
        '../../lib/grayTargetSheet'
      )
      const blob = await generateGrayTargetSheet()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = GRAY_TARGET_SHEET_FILENAME
      link.click()
      // Margen amplio: algunos navegadores descargan en diferido.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setError('No se ha podido generar la hoja. Vuelve a intentarlo.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Layout title="Testigo de gris" back="/">
      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Qué es</h2>
        <p className="text-sm text-stone-700">
          Una tira de grises conocidos, junto a la obra. Si salen anaranjados, se sabe cuánto enfriar.
        </p>
        <p className="mt-2 text-sm text-stone-700">
          Sin testigo funciona igual: el gris se toma de la escena o a ojo.
        </p>
        <p className="mt-2 text-sm text-stone-700">
          Un gris liso, por sí solo, no se distingue de una pared gris. Lo que la aplicación reconoce
          es la <strong>escalera</strong>: varios parches iguales, pegados y en fila. Tiene que salir entero, no medio tapado.
        </p>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Dónde se coloca</h2>
        <ul className="space-y-2 text-sm text-stone-700">
          <li>
            <strong>Al lado de la obra, nunca encima.</strong> Apoyado junto al marco o sobre la mesa, sin tapar nada de la pieza.
          </li>
          <li>
            <strong>En el mismo plano y con la misma luz.</strong> Si el testigo cae en sombra, mide otra luz distinta de la que hay que corregir.
          </li>
          <li>
            <strong>Que salga entero y con tamaño.</strong> Al menos una décima del ancho de la foto.
          </li>
          <li>
            <strong>Sin brillos.</strong> Si coge un reflejo, inclínalo: un reflejo sobre un parche no es su color.
          </li>
          <li>
            <strong>Dentro del encuadre, no pegado al borde.</strong> Lo que llega al borde de la
            fotografía se toma por fondo.
          </li>
        </ul>
      </section>

      <section className="card mb-3">
        <h2 className="mb-3 font-medium">Cuatro casos</h2>

        <Case
          verdict="ok"
          description="Dibujo: una obra colgada en la pared y, a su derecha y a su misma altura, la tira de grises. La luz de la sala llega por igual a las dos."
          scene={
            <>
              <Light rays={[{ to: [58, 40] }, { to: [138, 40] }]} />
              <Artwork />
              <Target />
            </>
          }
        >
          Al lado de la obra, a su altura y bajo la misma luz. Entero y sin tapar la pieza.
        </Case>

        <Case
          verdict="note"
          description="Dibujo: la misma obra en la pared, sin ninguna tira de grises al lado."
          scene={
            <>
              <Light rays={[{ to: [58, 40] }]} />
              <Artwork />
              <rect
                {...TARGET_BOX}
                fill="none"
                stroke={FRAME}
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
            </>
          }
        >
          Sin testigo. El color se toma de un gris de la escena, y la ficha guarda que fue así.
        </Case>

        <Case
          verdict="bad"
          description="Dibujo: la obra iluminada y la tira de grises tapada por una sombra, con la luz llegando solo a la obra."
          scene={
            <>
              <Light rays={[{ to: [58, 40] }]} />
              <Artwork />
              <Target opacity={0.75} />
              {/* La sombra cae sobre el testigo y no sobre la obra: es lo que hay que ver. */}
              <path d="M106 16 L200 28 L200 120 L106 120 Z" fill="#1c1917" opacity="0.4" />
            </>
          }
        >
          El testigo en sombra y la obra iluminada: se mide otra luz, y corregir con ella empeora.
        </Case>

        <Case
          verdict="bad"
          description="Dibujo: la tira de grises al lado de la obra con una mancha blanca de brillo cruzándola."
          scene={
            <>
              <Light rays={[{ to: [58, 40] }, { to: [128, 40] }]} />
              <Artwork />
              <Target />
              {/* El brillo: pequeño, encima de dos parches, y fatal justo por eso. */}
              <ellipse cx="140" cy="54" rx="20" ry="7" fill="#ffffff" opacity="0.9" />
              <path
                d="M140 40v-6M152 44l4-4M128 44l-4-4"
                stroke="#fbbf24"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          }
        >
          El testigo cogiendo un reflejo: se mediría la ventana, no el gris. Basta inclinarlo.
        </Case>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Carta comprada u hoja impresa</h2>
        <p className="text-sm text-stone-700">
          <strong>Lo mejor es una carta de gris comprada.</strong> Su gris es neutro de verdad.
        </p>
        <p className="mt-2 text-sm text-stone-700">
          <strong>Si no hay carta, la hoja impresa en casa.</strong> El gris de una impresora no es neutro: sirve de patrón, no de referencia.
        </p>
        <button
          type="button"
          onClick={() => void downloadSheet()}
          disabled={generating}
          className="btn-primary mt-3 w-full"
        >
          {generating ? 'Generando la hoja…' : 'Descargar la hoja para imprimir (A5)'}
        </button>
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <p className="mt-2 text-xs text-stone-500">
          Imprímela sin corrección de color ni ahorro de tinta. Si la obra es grande, al 141%.
        </p>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Y luego el recorte lo deja fuera</h2>
        <p className="text-sm text-stone-700">
          Al recortar la foto a la obra, la tira queda fuera. Sigue en el original, que no se toca.
        </p>
      </section>
    </Layout>
  )
}
