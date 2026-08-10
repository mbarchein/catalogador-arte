/**
 * The catalogue's funds, maintained from Tablas (ADR-007, second delivery).
 *
 * ── WHAT A FUND IS AND WHY IT IS NOT JUST ANOTHER MASTER TABLE ──
 *
 * A fund is an artist's body of work, and it is the datum everything
 * else hangs from: the numbering (`AR-0001`), the series, the archive documents. That is
 * why this screen does LESS than the other five master tables and not more:
 *
 *   · **it does not create.** A new fund brings a new prefix, and that prefix enters the
 *     generation of identifiers, the constraint tying prefix and fund, and
 *     the whitelist of the function that signs the archive's files. It is a
 *     schema decision with its migration, not a row that gets typed;
 *   · **it does not delete**, like none of them (RF-901) — and here less than in any: deleting a
 *     fund would leave all its artworks with no name;
 *   · **it does not change the prefix.** It is printed on the label stuck to the painting.
 *
 * What it does do: rename, withdraw and set aside.
 *
 * ── THE TWO SWITCHES ────────────────────────────────────────
 *
 * They are different and the screen has to make it clear, because the case that asked for them
 * is the test fund and there both are wanted at once — but not always:
 *
 *   · **withdrawn** is that it stops being offered when creating and in the selectors. Its
 *     artworks stay where they were and its name is still read in each one;
 *   · **set aside** is that its artworks do not show up in the listing by default. It is not a
 *     delete or a wastebasket: the artwork opens through its link and is found
 *     by filtering by its fund.
 */

import type { ArtistFund } from '../../lib/types'

/** A fund as this screen reads and corrects it. */
export interface ArtistFundEntry {
  id: string
  /** The enum's value. Legacy, immutable, and not shown. */
  code: ArtistFund
  /** The identifiers' prefix. Shown because it explains the fund; not editable. */
  prefix: string
  name: string
  active: boolean
  hideArtworks: boolean
}

/** The order they are read in: by prefix, which is how the artworks are numbered. */
export function sortFunds(entries: readonly ArtistFundEntry[]): ArtistFundEntry[] {
  return entries.slice().sort((a, b) => a.prefix.localeCompare(b.prefix, 'es'))
}

/** What is read under each fund's name: its prefix, which is what identifies it. */
export function fundPrefixText(prefix: string): string {
  return `Obras ${prefix}-0001, ${prefix}-0002…`
}

/**
 * How each switch is labelled.
 *
 * Both name the NORMAL state, and on is that state. This way it reads
 * the same always —on is «this is as it should be»— and there is no
 * double negative to resolve to know what happens on turning «retirado» off.
 */
export const OFFERED_LABEL = 'Se ofrece al dar de alta'
export const LISTED_LABEL = 'Sus obras salen en el listado'

/**
 * What is read under each switch: **what happens now**, not what would happen.
 *
 * There used to be a fixed sentence describing both states at once, and that is why
 * the screen was not understood: one had to work out which of the two halves
 * applied by looking at the control. Now the subtext only tells the state one
 * is in, and the off one also bears the half that avoids the fright —what has NOT
 * been done—, which is precisely when it is needed.
 */
export function fundOfferedHint(active: boolean): string {
  return active
    ? 'Aparece entre los fondos al dar de alta una obra.'
    : 'No aparece al dar de alta. Sus obras no se han tocado: siguen en el listado y siguen ' +
        'diciendo que son de este fondo.'
}

export function fundListedHint(listed: boolean): string {
  return listed
    ? 'Sus obras aparecen en el listado, como las de los demás fondos.'
    : 'Sus obras no aparecen en el listado. No se ha borrado ni retirado nada: cada obra se sigue abriendo por su enlace.'
}

/**
 * Why this fund cannot be withdrawn, or null when it can.
 *
 * The base refuses it —and says so— but a control that is going to be rejected has to
 * say so BEFORE being pressed: whoever catalogues is on their feet, and a round trip
 * just to be told no is worse than a button that explains itself.
 */
export function retireFundBlockedReason(
  entry: ArtistFundEntry,
  all: readonly ArtistFundEntry[],
): string | null {
  if (!entry.active) return null
  const othersActive = all.filter((f) => f.active && f.id !== entry.id).length
  if (othersActive > 0) return null
  return (
    'Es el último fondo activo: si se retira no queda ninguno, así que activa antes otro.'
  )
}

/** What is said after each change, naming the fund. */
export function fundRenamedNotice(name: string): string {
  return `El fondo se llama ahora «${name}». Lo ven todas sus obras.`
}

export function fundActiveNotice(name: string, active: boolean): string {
  return active
    ? `«${name}» vuelve a ofrecerse al dar de alta.`
    : `«${name}» deja de ofrecerse. Sus obras no se han tocado.`
}

export function fundHiddenNotice(name: string, hidden: boolean): string {
  return hidden
    ? `Las obras de «${name}» dejan de salir en el listado. Se siguen abriendo por su enlace.`
    : `Las obras de «${name}» vuelven al listado.`
}

/**
 * The badge of the fund set aside, in the funds list of the filter panel.
 *
 * **Never a gap in silence**, but said where something can be done about it.
 * It used to be a warning over the listing —«las obras de X no se muestran»— and it was
 * in the wrong place twice: above a list that is already long, and far
 * from the switch that fixes it. Marking it in the fund's row, inside the
 * panel where filtering happens, puts it right where action will be taken: ticking that fund is
 * exactly what makes its artworks appear.
 */
export const HIDDEN_FUND_BADGE = 'Apartado'

/** What is read under the name of the fund set aside, in that same row. */
export const HIDDEN_FUND_FILTER_HINT = 'Sus obras no salen si no lo marcas'

/** The rows of the fund filter, with the one set aside marked. */
export function fundFilterOptions(
  entries: readonly ArtistFundEntry[],
): { value: ArtistFund; text: string; badge?: string; hint?: string }[] {
  return sortFunds(entries).map((entry) => ({
    value: entry.code,
    text: entry.name,
    ...(entry.hideArtworks
      ? { badge: HIDDEN_FUND_BADGE, hint: HIDDEN_FUND_FILTER_HINT }
      : {}),
  }))
}

/** The funds offered to choose from: the active ones, plus whichever the row already had. */
export function offeredFunds(
  entries: readonly ArtistFundEntry[],
  current?: ArtistFund | null,
): ArtistFundEntry[] {
  return entries.filter((f) => f.active || f.code === current)
}
