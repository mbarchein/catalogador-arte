import { useState } from 'react'
import { Toggle } from '../../components/ui'
import type { DossierRow } from './dossierIndex'
import type { DossierPatch } from './useDossier'
import { useRecipients } from './useRecipients'

/**
 * The header of a dossier: what it is called, what it is for, who it goes to, what
 * the cover says and which blocks the PDF prints (RF-1601, RF-1606, RF-1614,
 * RF-1615).
 *
 * **The four switches are saved on the spot and the four texts on «Guardar».** Not
 * a whim: a switch has one bit and pressing it IS the decision, so a second tap to
 * confirm it would be a tap for nothing; a text is being written, and saving on
 * every keystroke over a bad connection in a storeroom is how a half-typed
 * paragraph gets stored twenty times.
 *
 * The two notes are next to each other on purpose, with the difference said in
 * words: the cover is printed and the note is not. It is the distinction that makes
 * both worth having, and one nobody guesses from two identical boxes.
 */
export function DossierSettings({
  dossier,
  canEdit,
  onSave,
}: {
  dossier: DossierRow
  canEdit: boolean
  onSave: (patch: DossierPatch) => Promise<string | null>
}) {
  const [title, setTitle] = useState(dossier.title)
  const [purpose, setPurpose] = useState(dossier.purpose)
  const [coverText, setCoverText] = useState(dossier.cover_text)
  const [note, setNote] = useState(dossier.note)
  const [recipient, setRecipient] = useState(dossier.recipient_party_id ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { recipients } = useRecipients(canEdit)

  async function saveTexts() {
    setSaving(true)
    setProblem(null)
    setSaved(false)
    const message = await onSave({
      title,
      purpose,
      cover_text: coverText,
      note,
      recipient_party_id: recipient === '' ? null : recipient,
    })
    setSaving(false)
    if (message !== null) {
      setProblem(message)
      return
    }
    // Said out loud, because the four fields look exactly the same before and after
    // and the only other signal would be nothing at all.
    setSaved(true)
  }

  async function toggle(patch: DossierPatch) {
    setProblem(null)
    const message = await onSave(patch)
    if (message !== null) setProblem(message)
  }

  if (!canEdit) {
    // A Lector reads the dossier and does not arm it. What it needs is what the PDF
    // will say, not the form that decides it.
    return (
      <div className="card space-y-1 text-sm">
        <p className="text-stone-600">
          {dossier.purpose.trim() === '' ? 'Sin uso anotado' : dossier.purpose.trim()}
        </p>
        {dossier.cover_text.trim() !== '' && (
          <p className="whitespace-pre-wrap text-stone-800">{dossier.cover_text.trim()}</p>
        )}
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="dossier-title">
          Título
        </label>
        <input
          id="dossier-title"
          className="field mt-1"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="dossier-purpose">
          Para qué es
        </label>
        <input
          id="dossier-purpose"
          className="field mt-1"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="Galería, seguro, préstamo…"
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="dossier-recipient">
          A quién va
        </label>
        <select
          id="dossier-recipient"
          className="field mt-1"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
        >
          <option value="">Sin destinatario</option>
          {recipients.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          De la lista de personas e instituciones. Se puede dejar sin destinatario.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="dossier-cover">
          Texto de la portada
        </label>
        <textarea
          id="dossier-cover"
          className="field mt-1 min-h-[5rem]"
          value={coverText}
          onChange={(event) => setCoverText(event.target.value)}
          placeholder="Las medidas son sin marco, alto por ancho."
        />
        <p className="mt-1 text-xs text-stone-500">Sale impreso en la primera página.</p>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="dossier-note">
          Nota del equipo
        </label>
        <textarea
          id="dossier-note"
          className="field mt-1 min-h-[4rem]"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Pidieron solo obra sobre papel."
        />
        <p className="mt-1 text-xs text-stone-500">No sale en el PDF.</p>
      </div>

      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      {saved && <p className="text-sm text-emerald-800">Guardado.</p>}

      <button
        type="button"
        className="min-h-[2.75rem] w-full rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => void saveTexts()}
        disabled={saving}
      >
        {saving ? 'Guardando…' : 'Guardar'}
      </button>

      <div className="space-y-2 border-t border-stone-200 pt-3">
        <p className="text-sm font-medium">Qué enseña el PDF</p>
        <Toggle
          active={dossier.show_prices}
          onChange={(value) => void toggle({ show_prices: value })}
          label="Los precios"
          help="El precio es de este dossier, no de la obra."
        />
        <Toggle
          active={dossier.show_exhibitions}
          onChange={(value) => void toggle({ show_exhibitions: value })}
          label="El historial expositivo"
        />
        <Toggle
          active={dossier.show_provenance}
          onChange={(value) => void toggle({ show_provenance: value })}
          label="La procedencia"
          help="Lleva nombres de propietarios."
        />
        <Toggle
          active={dossier.show_bibliography}
          onChange={(value) => void toggle({ show_bibliography: value })}
          label="La bibliografía"
        />
      </div>
    </div>
  )
}
