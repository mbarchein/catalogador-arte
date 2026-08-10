import { noteSegments } from './noteText'

/**
 * Una nota de texto libre, con sus direcciones acortadas y pulsables.
 *
 * Acortadas para que quepan (ver `noteText.ts`) y pulsables porque una dirección
 * recortada que no se pueda abrir no serviría de nada: lo que se enseña es un
 * resumen y el destino entero va en el enlace, así que se sigue llegando.
 */
export function NoteText({ text }: { text: string }) {
  return (
    // `whitespace-pre-line`: the note was written with its line breaks and that is how it
    // reads. `break-words` for whatever still does not fit once shortened.
    <span className="block whitespace-pre-line break-words">
      {noteSegments(text).map((segment, at) =>
        segment.href === null ? (
          <span key={at}>{segment.text}</span>
        ) : (
          <a
            key={at}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            // The whole address, for whoever hovers or uses a screen reader.
            title={segment.href}
            className="underline"
          >
            {segment.text}
          </a>
        ),
      )}
    </span>
  )
}

/**
 * La fila de una nota dentro de una lista de campos.
 *
 * Va **con los demás campos**, no en un bloque aparte: es un campo más de la
 * ficha. Lo que cambia es que su contenido ocupa el ancho entero en vez de la
 * columna estrecha de la derecha, porque es el único que trae párrafos y
 * direcciones. Se usa dentro de un `<dl>`.
 */
export function NoteRow({ label, value }: { label: string; value: string }) {
  const written = value.trim()
  return (
    <div className="py-1.5">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {/* Nunca un hueco en silencio (RF-304): sin nota, se dice. */}
        {written === '' ? <span className="text-stone-400">Sin dato</span> : <NoteText text={written} />}
      </dd>
    </div>
  )
}
