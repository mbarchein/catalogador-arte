/**
 * What is typed into a dossier before it is saved: the new dossier, a free text,
 * and a price (RF-1601, RF-1604, RF-1614).
 *
 * Pure. Every one of these answers either the exact arguments for the write or
 * the sentence explaining why not, so the component only has to render one or
 * call the other. **The database still has the last word** — every refusal
 * predicted here also lives next to the data with its own Spanish message — and
 * these exist so the cataloguer reads it BEFORE pressing the button, not instead
 * of the check.
 */

/** What the «Nuevo dossier» form holds. Everything else is edited afterwards. */
export interface DossierDraft {
  title: string
  purpose: string
  recipientPartyId: string | null
}

export type DossierCreatePlan =
  | { action: 'insert'; payload: { title: string; purpose: string; recipient_party_id: string | null } }
  | { action: 'blank'; message: string }

/**
 * The insert for a new dossier, or why it cannot be made.
 *
 * The only thing demanded is a title, and it is not bureaucracy: a dossier with
 * no title cannot be found again, which is the only reason to save one instead of
 * assembling it in a folder. Everything else — who it goes to, what it is for,
 * the cover — is written while it is being armed.
 */
export function planDossierCreate(draft: DossierDraft): DossierCreatePlan {
  const title = draft.title.trim()
  if (title === '') {
    return {
      action: 'blank',
      message: 'Escribe un título: es como vas a encontrar el dossier dentro de un año.',
    }
  }
  return {
    action: 'insert',
    payload: {
      title,
      purpose: draft.purpose.trim(),
      recipient_party_id: draft.recipientPartyId,
    },
  }
}

export type TextPlan =
  | { action: 'add'; heading: string; body: string }
  | { action: 'blank'; message: string }

/**
 * A free text: a section heading, a paragraph, or both (RF-1614).
 *
 * Either of the two on its own is a legitimate item, and neither is — a text with
 * nothing in it is a blank space, and nobody means to add a blank space. It is
 * said as a sentence here because the database says it as the name of a
 * constraint, and what the user reads has to be a sentence.
 */
export function planText(heading: string, body: string): TextPlan {
  const rotulo = heading.trim()
  const cuerpo = body.trim()
  if (rotulo === '' && cuerpo === '') {
    return {
      action: 'blank',
      message: 'Escribe al menos un rótulo o un párrafo.',
    }
  }
  return { action: 'add', heading: rotulo, body: cuerpo }
}

export type PricePlan = { price: number | null } | { message: string }

/**
 * The price of an item, from what was typed (RF-1604).
 *
 * **Empty is null and null is a price datum**: «sin precio» is the normal state
 * of most items and it must never become a zero, which would be a figure nobody
 * offered.
 *
 * It reads what a Spanish keyboard actually produces: `4.500`, `4500,50`,
 * `4 500 €`, `4500€`. The point is a thousands separator and the comma is the
 * decimal one, which is the opposite of what `Number()` believes, and getting it
 * backwards turns four thousand five hundred euros into four and a half.
 *
 * Two decimals, because that is what the column stores; a third would be silently
 * rounded by the database and the screen would show a number nobody typed.
 */
export function planPrice(typed: string): PricePlan {
  const clean = typed.trim().replace(/[€\s ]/g, '')
  if (clean === '') return { price: null }

  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) {
    return {
      message:
        'Escribe el precio como una cantidad en euros: 4.500 o 4500,50. Déjalo vacío si no lleva precio.',
    }
  }

  const value = Number(clean.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(value)) {
    return { message: 'Ese precio no se entiende. Escríbelo como 4.500 o 4500,50.' }
  }
  if (value <= 0) {
    // The database says the same with `dossier_items_price_positive`, and it says
    // it as the name of a constraint.
    return { message: 'Cero no es un precio. Déjalo vacío si esta obra no lleva precio.' }
  }
  if (value > 99_999_999.99) {
    // `numeric(12, 2)` and nothing here needs the other four digits.
    return { message: 'Ese precio es demasiado grande. Comprueba si te has pasado con los ceros.' }
  }
  return { price: value }
}

/**
 * The price as it goes back into the input when the panel opens: what was saved,
 * written the way it is typed.
 *
 * NOT `priceText`, which is for reading and puts the € in: a field that opens
 * with «4.500 €» inside asks to be corrected before it can be edited.
 */
export function priceInputValue(price: number | null): string {
  if (price === null) return ''
  return price.toLocaleString('es-ES', {
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
