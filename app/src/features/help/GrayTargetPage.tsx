import { useState, type ReactNode } from 'react'
import { Layout } from '../../components/Layout'
import { NoIcon, UnreviewedIcon, YesIcon } from '../../components/ui'

/**
 * Cómo se usa un testigo de gris, para quien fotografía y no programa (RF-418, §4).
 *
 * Existe porque la detección no puede explicarse a sí misma: el editor puede decir «no
 * se ha encontrado un testigo» y hasta por qué, pero no puede enseñar en una línea de
 * ayuda dónde se pone la carta ni por qué en sombra no sirve. Y porque la propia
 * aplicación genera la hoja imprimible, así que el sitio donde se descarga es el mismo
 * donde se cuenta para qué es.
 *
 * **Ilustraciones dibujadas en SVG y no fotografías** (decisión del propietario). Un
 * dibujo enseña la geometría —la carta al lado de la obra, en el mismo plano, en la
 * misma luz— sin arrastrar el peso de cuatro fotografías a un almacén con mala
 * cobertura, sin quedarse obsoleto cuando cambie la carta y sin que nadie confunda el
 * ejemplo con una obra del catálogo. Van en línea, con `currentColor` donde puede, como
 * los iconos de `ui.tsx`.
 *
 * La hoja se genera con `grayTargetSheet.ts`, importado **dinámicamente**: arrastra
 * pdf-lib, y pdf-lib no debe pesar en el arranque de la aplicación. Es el mismo camino
 * que la ficha impresa de la obra.
 */

/**
 * Los grises de la tira dibujada.
 *
 * Son los cinco códigos que imprime la hoja (225, 180, 135, 90 y 45) en hexadecimal, y
 * están escritos aquí a mano a propósito: importarlos de `grayTargetSheet.ts` metería
 * pdf-lib en el paquete inicial por una ilustración. Si la hoja cambia sus tonos, este
 * dibujo se queda parecido pero no idéntico, y para un dibujo eso da igual.
 */
const PATCHES = ['#e1e1e1', '#b4b4b4', '#878787', '#5a5a5a', '#2d2d2d'] as const

const WALL = '#f5f5f4'
const FLOOR = '#e7e5e4'
const FRAME = '#a8a29e'
const LINE = '#57534e'

/** La obra colgada en la pared: marco, lienzo y dos trazos que sugieren pintura. */
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

/** Dónde va la tira en el dibujo: al lado de la obra y a su misma altura. */
const TARGET_BOX = { x: 116, y: 44, width: 66, height: 21 } as const

/** La tira de grises con su marco oscuro, tal como sale impresa. */
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

/** El foco de la sala y hacia dónde va su luz. */
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

/** El escenario común: pared, suelo y lo que cada caso añada encima. */
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
  // «Sin revisar» no es «no»: la fotografía sin testigo no está mal hecha.
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
  /** Texto alternativo del dibujo: lo que se vería si se viera. */
  description: string
  /** Lo que se dibuja sobre la pared y el suelo. */
  scene: ReactNode
  /** El pie: qué pasa en este caso, en una o dos frases. */
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

  // pdf-lib se carga solo cuando se pide la hoja: no debe engordar el arranque.
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
          Una tira de grises conocidos, fotografiada junto a la obra. Si salen anaranjados, se sabe cuánto enfriar la foto.
        </p>
        <p className="mt-2 text-sm text-stone-700">
          Sin testigo funciona igual: el gris se toma de la escena o a ojo. La ficha guarda cuál de las tres fue.
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
            <strong>Al lado de la obra, nunca encima.</strong> Apoyado en la pared junto al marco, o
            sobre la mesa junto al borde, sin tapar nada de la pieza.
          </li>
          <li>
            <strong>En el mismo plano y con la misma luz.</strong> Si la obra está iluminada y el
            testigo cae en sombra, el testigo mide otra luz distinta de la que hay que corregir.
          </li>
          <li>
            <strong>Que salga entero y con tamaño.</strong> Al menos una décima del ancho de la foto; por debajo, los parches traen pocos píxeles.
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
          <strong>Lo mejor es una carta de gris comprada.</strong> Su gris es neutro de verdad, así que de ella sí se puede creer la dominante.
        </p>
        <p className="mt-2 text-sm text-stone-700">
          <strong>Si no hay carta, la hoja impresa en casa.</strong> El gris de una impresora no es neutro: sirve de patrón y para blanco y negro, no de referencia.
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
          Imprímela sin corrección de color ni ahorro de tinta. Si la obra es grande, amplíala al 141 %.
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
