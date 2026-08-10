/**
 * Recovering the forgotten password (RF-112).
 *
 * ── THE RULE THAT RULES OVER ALL: NO ENUMERATION ────────────
 *
 * This screen can be used by anybody without having logged in, so **nothing it
 * answers can say whether an account exists**. Not the text, not the absence of
 * text, not a different error, not a button that behaves differently. The team is
 * three people and their addresses are guessable, and knowing which of them has
 * access to the catalogue is half an intrusion: it turns «trying passwords against
 * several addresses» into «trying passwords against the right one».
 *
 * Hence the result being **the same in every case but one**: if the
 * server does not answer. That exception leaks nothing —the network being down says
 * nothing about any account— and without it the commonest failure of all, being out of
 * coverage in a storeroom, would read as «the e-mail has been sent» and
 * a message that is never going to arrive would be waited for.
 *
 * ── THE WAIT BETWEEN SENDS ──────────────────────────────────
 *
 * The identity service already limits the rate on its own. The wait here is
 * something else: it makes **the rate be set by this screen and not by the server**, so
 * that a refusal for too many requests never comes about and there is no
 * observable difference between asking for it for an address that exists and one
 * that does not.
 */

/** Seconds the screen makes you wait between two sends. */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * What is always answered.
 *
 * In the conditional —«si la cuenta existe»— and not the affirmative: stating that it has
 * been sent would be lying half the time, and whoever reads it after mistyping their
 * own address would be left waiting for an e-mail nobody sent.
 */
export const RECOVERY_NOTICE =
  'Si esa dirección tiene cuenta, llegará un correo con el enlace. Mira también el spam.'

/** The one case told apart, because it is not about accounts but about the network. */
export const UNREACHABLE_NOTICE =
  'No se ha podido contactar con el servidor. Comprueba la conexión y vuelve a intentarlo.'

/**
 * The address as it is sent.
 *
 * Trimmed and in lower case: e-mail does not distinguish capitals and a space
 * stuck on when pasting from another application is the silliest cause of «it does not reach me».
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** What can happen when asking for the link. Two cases, and only two. */
export type RecoveryOutcome = 'requested' | 'unreachable'

/**
 * How whatever the identity service answers is classified.
 *
 * **Everything that is not a network failure counts as asked for.** A refusal by
 * rate, an address with no account, a badly configured e-mail template: the
 * user reads the same in all three cases. It is deliberate and it is the whole point of
 * this module — a different message for any of them would be the clue that cannot
 * be given here.
 *
 * `status` comes from the client's error: absent or zero means the request never
 * went out.
 */
export function recoveryOutcome(failure: { status?: number } | null): RecoveryOutcome {
  if (failure === null) return 'requested'
  return failure.status === undefined || failure.status === 0 ? 'unreachable' : 'requested'
}

/** The text for each outcome. */
export function recoveryText(outcome: RecoveryOutcome): string {
  return outcome === 'unreachable' ? UNREACHABLE_NOTICE : RECOVERY_NOTICE
}

/**
 * How many seconds until it can be asked for again.
 *
 * Zero when it already can. Both timestamps arrive as arguments instead
 * of being read here so this can be tested without a clock.
 */
export function secondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0
  const elapsed = Math.floor((now - sentAt) / 1000)
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed)
}

/** What the button says while there is a wait. */
export function resendText(left: number): string {
  return left > 0 ? `Volver a enviarlo en ${left} s` : 'Enviarme el enlace'
}
