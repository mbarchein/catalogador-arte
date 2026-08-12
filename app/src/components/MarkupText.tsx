import { Fragment } from 'react'
import { parseMarkup, type MarkupBlock, type MarkupRun } from '../lib/markup'

/**
 * Un texto con marcas, pintado.
 *
 * **Nunca `dangerouslySetInnerHTML`**, y ese es medio motivo de que el catálogo guarde
 * marcas en vez de HTML: aquí se pintan componentes a partir de bloques, así que lo
 * escrito en una biografía no puede convertirse en una etiqueta por ningún camino.
 *
 * Los tamaños son los de la pantalla y no los del papel: el PDF dibuja los mismos
 * bloques con su propia maqueta (`dossierPdf`), que es la que tiene que caber en A4.
 */
export function MarkupText({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkup(text)
  if (blocks.length === 0) return null
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: MarkupBlock }) {
  if (block.kind === 'HEADING') {
    return block.level === 2 ? (
      <p className="break-words text-base font-semibold text-stone-900">
        <Runs runs={block.runs} />
      </p>
    ) : (
      <p className="break-words text-sm font-semibold text-stone-800">
        <Runs runs={block.runs} />
      </p>
    )
  }

  if (block.kind === 'LIST') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag
        className={`ml-4 space-y-1 text-sm ${block.ordered ? 'list-decimal' : 'list-disc'}`}
      >
        {block.items.map((item, index) => (
          <li key={index} className="break-words">
            <Runs runs={item} />
          </li>
        ))}
      </Tag>
    )
  }

  return (
    <p className="break-words text-sm text-stone-800">
      <Runs runs={block.runs} />
    </p>
  )
}

function Runs({ runs }: { runs: readonly MarkupRun[] }) {
  return (
    <>
      {runs.map((run, index) => {
        if (run.bold && run.italic) {
          return (
            <strong key={index} className="italic">
              {run.text}
            </strong>
          )
        }
        if (run.bold) return <strong key={index}>{run.text}</strong>
        if (run.italic) return <em key={index}>{run.text}</em>
        // Sin envoltorio: un `span` por trozo sin estilo llena el árbol de nodos que no
        // dicen nada, y hace que buscar un texto en pantalla devuelva el `span` en vez
        // del párrafo.
        return <Fragment key={index}>{run.text}</Fragment>
      })}
    </>
  )
}
