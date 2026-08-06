import { useEffect, useState } from 'react'
import { BUILD, formatBuildDate } from '../../lib/buildInfo'
import {
  changelogSourceText,
  CHANGELOG_FAILED,
  CHANGELOG_LOADING,
  groupChangelog,
  parseChangelog,
  type ChangelogBlock,
  type ChangelogEntry,
  type Span,
} from './changelogText'

/**
 * El registro de cambios, dentro de la aplicación y sin conexión (RF-1202).
 *
 * ── CÓMO LLEGA HASTA AQUÍ ───────────────────────────────────
 *
 * `CHANGELOG.md` se incrusta al compilar, con `?raw`, y **se pide solo al abrir esta
 * sección**: son noventa y cinco kilobytes de texto y esta es una pantalla que se visita
 * de tarde en tarde, así que no puede ir en lo que se descarga al entrar. Al ser un trozo
 * más de la compilación, el trabajador de servicio lo guarda con el resto del armazón y
 * queda disponible sin cobertura — que es el motivo de traerlo aquí y no pedirlo a la red.
 *
 * ── PLEGADO, MENOS EL PRIMERO ───────────────────────────────
 *
 * Quince meses de trabajo en una pantalla de móvil son un muro que no se lee. Lo que se
 * viene a mirar casi siempre es qué trae la versión que se acaba de instalar, así que la
 * entrada más reciente sale abierta y las demás esperan a que se toquen.
 */
export function ChangelogSection() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    // El `?raw` lo resuelve Vite: el fichero entra como texto en un trozo aparte.
    import('../../../../CHANGELOG.md?raw')
      .then((module) => {
        if (!alive) return
        setEntries(groupChangelog(parseChangelog(module.default)))
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="card mb-3">
      <h2 className="mb-1 font-medium">Novedades</h2>
      <p className="mb-3 text-sm text-stone-600">
        {changelogSourceText(BUILD.version, formatBuildDate())}
      </p>

      {failed ? (
        <p role="alert" className="text-sm text-stone-700">
          {CHANGELOG_FAILED}
        </p>
      ) : entries === null ? (
        <p className="text-sm text-stone-500">{CHANGELOG_LOADING}</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry, index) => (
            <Entry key={entry.date} entry={entry} open={index === 0} />
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * Una fecha con lo suyo debajo.
 *
 * `<details>` del navegador y no un estado propio: sabe plegar solo, lo anuncia bien a un
 * lector de pantalla y el buscador del navegador encuentra dentro de lo cerrado.
 */
function Entry({ entry, open }: { entry: ChangelogEntry; open: boolean }) {
  return (
    <li>
      <details open={open} className="rounded-lg border border-stone-200">
        <summary className="min-h-touch cursor-pointer list-none px-3 py-2 text-sm font-medium marker:content-none">
          {entry.date}
        </summary>
        <div className="border-t border-stone-100 px-3 py-2">
          {entry.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </div>
      </details>
    </li>
  )
}

function Block({ block }: { block: ChangelogBlock }) {
  if (block.kind === 'date') {
    // No llega ninguno: `groupChangelog` se los queda como encabezado de cada entrada.
    return <h3 className="mt-3 font-medium">{block.text}</h3>
  }
  if (block.kind === 'section') {
    return (
      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500 first:mt-0">
        {block.text}
      </h3>
    )
  }
  if (block.kind === 'list') {
    return (
      <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
        {block.items.map((item, index) => (
          <li key={index}>
            <Spans spans={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p className="mb-2 text-sm text-stone-700">
      <Spans spans={block.spans} />
    </p>
  )
}

/**
 * Los trozos de una línea, pintados con elementos.
 *
 * Nada de `dangerouslySetInnerHTML`: lo que llega de `changelogText` son datos, y así un
 * asterisco de más en el fichero no puede convertirse en marcado.
 */
function Spans({ spans }: { spans: readonly Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.strong) return <strong key={index}>{span.text}</strong>
        if (span.code) {
          return (
            <code key={index} className="rounded bg-stone-100 px-1 font-mono text-xs">
              {span.text}
            </code>
          )
        }
        return <span key={index}>{span.text}</span>
      })}
    </>
  )
}
