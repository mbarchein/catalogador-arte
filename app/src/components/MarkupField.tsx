import { useId, useRef, useState } from 'react'
import { hasMarkup, withMarkup } from '../lib/markup'
import { pastedMarkup } from '../lib/markupPaste'
import { MarkupText } from './MarkupText'

/**
 * El campo de un texto largo con marcas: la caja, cuatro botones y el pegado que
 * conserva el formato (RF-1616, RF-1614).
 *
 * **Sigue siendo una caja de texto**, y eso no es un apaño: el teclado del móvil, el
 * cursor, el deshacer del navegador y el dictado funcionan porque debajo hay un
 * `textarea` de verdad. Un editor enriquecido gana el «se ve igual mientras escribo» y
 * pierde exactamente eso, que es lo que se usa con una mano en un almacén.
 *
 * Tres cosas hace de más que un `textarea`:
 *
 *   · **al pegar**, si el portapapeles trae HTML, lo convierte a marcas — es lo que
 *     permite copiar una biografía de una web y que se conserven los títulos y las
 *     listas. Si solo trae texto, no estorba: se pega tal cual;
 *   · **los botones** ponen y quitan la marca de lo seleccionado, y dejan el cursor
 *     donde estaba;
 *   · **la vista previa** se puede abrir para ver los bloques como se van a leer, que
 *     es lo único que dice si una lista ha quedado hecha una lista.
 */
export function MarkupField({
  label,
  hint,
  value,
  placeholder,
  rows = 'min-h-[7rem]',
  disabled = false,
  onChange,
}: {
  label: string
  /** La ayuda de siempre, si hace falta. La de las marcas la pone este componente. */
  hint?: string
  value: string
  placeholder?: string
  /** La altura mínima de la caja, en clases: un currículum quiere más que una entradilla. */
  rows?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  /** Pone la marca y devuelve el cursor a su sitio: sin esto hay que buscarlo con el dedo. */
  function mark(kind: 'bold' | 'italic' | 'heading' | 'bullet') {
    const element = area.current
    if (element === null) return
    const next = withMarkup(
      value,
      { start: element.selectionStart, end: element.selectionEnd },
      kind,
    )
    onChange(next.text)
    // Después del repintado: antes, React todavía tiene el valor viejo en la caja y la
    // selección se aplicaría sobre otro texto.
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.start, next.end)
    })
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <label className="block text-sm font-medium" htmlFor={id}>
          {label}
        </label>
        {(value.trim() !== '' || preview) && (
          <button
            type="button"
            className="min-h-touch text-sm text-stone-600 underline"
            aria-expanded={preview}
            onClick={() => setPreview((open) => !open)}
          >
            {preview ? 'Seguir escribiendo' : 'Ver cómo queda'}
          </button>
        )}
      </div>

      {preview ? (
        <div className="field mt-1 bg-stone-50">
          <MarkupText text={value} />
        </div>
      ) : (
        <>
          {/* La barra va encima de la caja y no debajo: con el teclado abierto, lo que
              está debajo de la caja no existe. */}
          <div className="mt-1 flex flex-wrap gap-1">
            <ToolButton label="Título" hint="Título de bloque" disabled={disabled} onClick={() => mark('heading')}>
              <span className="text-sm font-semibold">T</span>
            </ToolButton>
            <ToolButton label="Lista" hint="Lista de entradas" disabled={disabled} onClick={() => mark('bullet')}>
              <span className="text-sm">•—</span>
            </ToolButton>
            <ToolButton label="Negrita" hint="Negrita" disabled={disabled} onClick={() => mark('bold')}>
              <span className="text-sm font-bold">N</span>
            </ToolButton>
            <ToolButton label="Cursiva" hint="Cursiva" disabled={disabled} onClick={() => mark('italic')}>
              <span className="text-sm italic">C</span>
            </ToolButton>
          </div>

          <textarea
            id={id}
            ref={area}
            className={`field mt-1 ${rows}`}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
              const converted = pastedMarkup({
                html: event.clipboardData.getData('text/html'),
                text: event.clipboardData.getData('text/plain'),
              })
              if (converted === null) return
              event.preventDefault()
              const element = event.currentTarget
              const start = element.selectionStart
              const end = element.selectionEnd
              onChange(`${value.slice(0, start)}${converted}${value.slice(end)}`)
              const caret = start + converted.length
              requestAnimationFrame(() => {
                element.focus()
                element.setSelectionRange(caret, caret)
              })
            }}
          />
        </>
      )}

      {hint !== undefined && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      {/* La ayuda de las marcas solo mientras no hay ninguna: cuando el texto ya las
          lleva, quien escribe ya sabe cómo se ponen y la frase pasa a ser ruido. */}
      {!hasMarkup(value) && (
        <p className="mt-1 text-xs text-stone-500">
          Pegado de una web conserva títulos, listas y negritas. A mano: <code>## Título</code>,{' '}
          <code>- entrada</code>, <code>**negrita**</code>.
        </p>
      )}
    </div>
  )
}

function ToolButton({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string
  hint: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[2.25rem] min-w-[2.25rem] items-center justify-center rounded border border-stone-300 bg-white text-stone-700 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
