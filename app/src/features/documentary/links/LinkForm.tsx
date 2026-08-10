import { useState } from 'react'
import { PlusIcon, RadioList } from '../../../components/ui'
import { linkTypeChoices, photoTitle, type ExternalLinkRow, type PhotoRef } from './externalLinks'
import {
  describeArchiveRefusal,
  describeUrlRefusal,
  draftFrom,
  duplicateMessage,
  duplicateOf,
  emptyDraft,
  missingUrl,
  retiredTwin,
  trimDraft,
  type LinkAnchor,
  type LinkDraft,
  type UrlVerdict,
} from './linkDraft'

/**
 * Pegar un enlace, o corregir uno que ya está (RF-1401 a RF-1403, RF-1406).
 *
 * **El campo obligatorio es uno: la dirección.** Exigir un título al pegar rompe
 * la captura de una mano, y sin título la ficha muestra el dominio, así que no hay
 * hueco (RNF-106, RF-1408).
 *
 * ── EL ORDEN DE LOS RECHAZOS, QUE NO ES CASUAL ──────────────
 *
 * Antes de guardar se hacen tres preguntas, y las dos primeras no gastan red:
 *
 *  1. ¿Hay dirección? Lo decide `missingUrl`, que es lo único que este lado sabe
 *     de una URL.
 *  2. ¿Ya está en esta ficha? Se predice con lo que el bloque tiene cargado, para
 *     contarlo en el acto y con lo que hay que hacer. Si la repetida está
 *     RETIRADA, no se dice que no: se ofrece recuperarla, que es lo que RF-1406
 *     llama volver a añadirla.
 *  3. ¿La acepta la base? Se le pregunta a `is_web_url` **a ella**, que es la
 *     única que tiene la regla. Aquí no hay ni un patrón de URL propio.
 *
 * Y si la tercera no contesta —sin cobertura— **se guarda igual**: la validación
 * de verdad es el `check` de la tabla y no se puede saltar, así que lo único que
 * se pierde sin red es la calidad del mensaje. Bloquear por no haber podido
 * preguntar convertiría un problema de cobertura en un enlace que no se puede
 * añadir.
 *
 * Nada de este fichero decide nada: cada frase, cada predicción y cada carga sale
 * de `linkDraft.ts`, que la batería sí puede abrir. Lo que queda aquí es el
 * formulario.
 */
export function LinkForm({
  anchor,
  photos,
  rows,
  editing = null,
  saving,
  verifyUrl,
  onSubmit,
  onRestore,
  onCancel,
}: {
  /** What the new link hangs from. The artwork, by default, or one particular photograph. */
  anchor: LinkAnchor
  /** The record's photographs, so it can be anchored to one shot (RF-1407). */
  photos: readonly PhotoRef[]
  /** What is already in the record, to predict the repeated address without going to the base. */
  rows: readonly ExternalLinkRow[]
  /** The link being corrected, or null if it is new. */
  editing?: ExternalLinkRow | null
  saving: boolean
  verifyUrl: (url: string) => Promise<UrlVerdict>
  /** Saves. Answers null if it went well, and the sentence in Spanish if not. */
  onSubmit: (draft: LinkDraft) => Promise<string | null>
  /** Recovers the withdrawn link having this same address (RF-1406). */
  onRestore: (link: ExternalLinkRow) => Promise<string | null>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<LinkDraft>(() =>
    editing === null ? emptyDraft(anchor) : draftFrom(editing),
  )
  const [problem, setProblem] = useState<string | null>(null)
  /** The withdrawn one with the same address: instead of a «no», a way out (RF-1406). */
  const [twin, setTwin] = useState<ExternalLinkRow | null>(null)
  const [asking, setAsking] = useState(false)

  const patch = (over: Partial<LinkDraft>) => {
    setDraft((was) => ({ ...was, ...over }))
    setProblem(null)
    setTwin(null)
  }

  // Anclar es una decisión del alta y no de la corrección: mover un enlace de la
  // obra a una fotografía es cambiar de qué ficha cuelga, no corregir una
  // dirección. El formulario de corrección enseña el ancla y no la ofrece.
  const anchorOptions: { value: string; text: string; hint?: string }[] = [
    { value: 'ARTWORK', text: 'De la obra', hint: 'Documenta la obra entera' },
    ...photos
      .filter((photo) => photo.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((photo) => ({
        value: `IMAGE:${photo.image_id}`,
        text: photoTitle(photo),
        hint:
          photo.provenance === 'OWN'
            ? 'Cuelga de esta fotografía'
            : 'Reproducción: aquí es donde se dice de dónde salió',
      })),
  ]

  async function submit() {
    setProblem(null)
    setTwin(null)
    const clean = trimDraft(draft)

    if (missingUrl(clean)) {
      setProblem('Pega la dirección de la página, empezando por https://')
      return
    }

    const repeated = duplicateOf(clean, rows, editing?.id ?? null)
    if (repeated !== null) {
      setProblem(duplicateMessage(repeated))
      return
    }

    if (editing === null) {
      const retired = retiredTwin(clean, rows)
      if (retired !== null) {
        setTwin(retired)
        return
      }
    }

    setAsking(true)
    const verdict = await verifyUrl(clean.url)
    if (verdict === 'REFUSED') {
      setAsking(false)
      setProblem(describeUrlRefusal(clean.url))
      return
    }
    if (clean.archiveUrl !== '') {
      const archive = await verifyUrl(clean.archiveUrl)
      if (archive === 'REFUSED') {
        setAsking(false)
        setProblem(describeArchiveRefusal(clean.archiveUrl))
        return
      }
    }
    setAsking(false)

    const failure = await onSubmit(clean)
    if (failure !== null) setProblem(failure)
  }

  const busy = saving || asking

  return (
    <div className="space-y-3">
      {/* 1 · LA DIRECCIÓN, que es el único campo obligatorio. `type="url"` saca el
          teclado con la barra y el punto en el móvil, y la corrección automática
          se apaga: una dirección con la primera letra en mayúscula es otra
          dirección. */}
      <div>
        <label className="label" htmlFor="link-url">
          Dirección de la página
        </label>
        <input
          id="link-url"
          className="field"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://www.macvac.es/obra/…"
          value={draft.url}
          onChange={(event) => patch({ url: event.target.value })}
        />
        <p className="mt-1 text-xs text-stone-500">
          Pégala tal como la copia el navegador. No se abre la página: solo se guarda la dirección.
        </p>
      </div>

      {/* 2 · EL TÍTULO, opcional y dicho como opcional. */}
      <div>
        <label className="label" htmlFor="link-title">
          Título (opcional)
        </label>
        <input
          id="link-title"
          className="field"
          type="text"
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="Ficha en el MACVA"
        />
        <p className="mt-1 text-xs text-stone-500">
          Si lo dejas vacío, la ficha llama al enlace por su dominio.
        </p>
      </div>

      {/* 3 · LA CLASE DE SITIO. «Sin clasificar» es la primera y es un valor, no
          un hueco: `OTHER` significa que alguien lo miró y no encajaba. */}
      <div>
        <label className="label" htmlFor="link-type">
          Clase de sitio
        </label>
        <select
          id="link-type"
          className="field"
          value={draft.linkType}
          onChange={(event) => patch({ linkType: event.target.value as LinkDraft['linkType'] })}
        >
          {linkTypeChoices().map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.text}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          «Sin clasificar» es que nadie lo ha mirado; «Otro» es que se miró y no encaja en ninguna.
        </p>
      </div>

      {/* 4 · DE QUÉ CUELGA. Solo al añadir, y con la obra por omisión. */}
      {editing === null ? (
        anchorOptions.length > 1 && (
          <div>
            <span className="label">De qué cuelga este enlace</span>
            <RadioList
              options={anchorOptions}
              value={draft.anchor.kind === 'ARTWORK' ? 'ARTWORK' : `IMAGE:${draft.anchor.id}`}
              onChange={(value) =>
                patch(
                  value === 'ARTWORK'
                    ? { anchor: { kind: 'ARTWORK', id: anchor.kind === 'ARTWORK' ? anchor.id : '' } }
                    : { anchor: { kind: 'IMAGE', id: value.slice('IMAGE:'.length) } },
                )
              }
            />
            <p className="mt-1 text-xs text-stone-500">
              Un enlace cuelga de una sola cosa: la obra o una de sus fotografías, con su nota.
            </p>
          </div>
        )
      ) : (
        <p className="rounded-lg bg-stone-100 p-2 text-xs text-stone-600">
          {draft.anchor.kind === 'ARTWORK'
            ? 'Este enlace cuelga de la obra.'
            : `Este enlace cuelga de una fotografía (${draft.anchor.id}).`}{' '}
          Corregir la dirección no lo mueve de sitio: si tiene que colgar de otra cosa, retíralo y
          añádelo donde toca.
        </p>
      )}

      {/* 5 · POR QUÉ IMPORTA. */}
      <div>
        <label className="label" htmlFor="link-note">
          Nota (opcional)
        </label>
        <textarea
          id="link-note"
          className="field"
          rows={2}
          value={draft.note}
          onChange={(event) => patch({ note: event.target.value })}
          placeholder="de aquí salen las medidas y la fecha de la ficha"
        />
      </div>

      {/* 6 · LA COPIA ARCHIVADA, y se dice quién la guarda: una persona, no esto. */}
      <div>
        <label className="label" htmlFor="link-archive">
          Copia archivada (opcional)
        </label>
        <input
          id="link-archive"
          className="field"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://web.archive.org/web/…"
          value={draft.archiveUrl}
          onChange={(event) => patch({ archiveUrl: event.target.value })}
        />
        <p className="mt-1 text-xs text-stone-500">
          La copia que hayas guardado tú en un archivo público. La aplicación no archiva nada.
        </p>
      </div>

      {problem !== null && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
          {problem}
        </p>
      )}

      {/* La misma dirección, retirada: no se dice que no, se ofrece devolverla con
          su nota y su comprobación intactas. Insertar otra fila igual dejaría dos
          enlaces con la misma dirección en la misma ficha —el índice único de la
          base es parcial sobre lo activo y no lo impediría— y perdería la
          historia de la primera. */}
      {twin !== null && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Esa dirección ya estuvo en esta ficha y está retirada, como «
            {twin.title.trim() === '' ? twin.url : twin.title}». Recupérala en vez de añadir otra
            igual: conserva su nota y su comprobación.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const failure = await onRestore(twin)
                if (failure !== null) setProblem(failure)
              })()
            }}
            className="btn-secondary mt-2 w-full text-sm"
          >
            {busy ? 'Recuperando…' : 'Recuperar el enlace retirado'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || draft.url.trim() === ''}
          onClick={() => void submit()}
          className="btn-primary min-h-touch"
        >
          {editing === null && <PlusIcon className="h-5 w-5" />}
          {asking
            ? 'Comprobando la dirección…'
            : saving
              ? 'Guardando…'
              : editing === null
                ? 'Añadir enlace'
                : 'Guardar cambios'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  )
}
