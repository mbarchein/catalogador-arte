/**
 * Who owns a one-finger gesture on the editor's surface while the eyedropper is armed.
 *
 * This module exists because the first design got it wrong in a way that only shows up
 * with a finger. The eyedropper was an *armed mode* that took no gesture away: a drag
 * still slid the photograph and only a tap that never travelled took a sample. It reads
 * as careful and it is unusable — you cannot aim. Dragging towards the grey you want
 * drags the picture out from under you, so the only way to correct an aim was to lift,
 * look, and tap again, blind, as many times as it took.
 *
 * The rule now: **while the eyedropper is armed, one finger aims and does not pan.** The
 * sample follows the finger continuously, the loupe follows it showing the raw pixels,
 * and the lift is what commits. Repositioning and zooming stay available through the
 * pinch, which keeps precedence over everything — so the mode never has to be left to
 * frame the shot.
 *
 * That is the project's own gesture vocabulary applied, not a new one: one finger drives
 * whatever the current mode is about, two fingers always mean zoom and pan. And it
 * removes a case of two intents riding one gesture, which is the mistake the single
 * framing axis already corrected once.
 *
 * The decision lives here, apart from the 2000-line component, because it is pure and
 * therefore testable: there is no DOM environment in this project's test runner, so
 * anything left inline in the JSX is checked by the compiler and by nothing else.
 */

/** What the surface is being asked to do with a pointer that just went down. */
export interface PointerIntent {
  /** Aim the eyedropper: track this pointer and sample where it lifts. */
  readonly aims: boolean
  /** Slide the photograph with this pointer. */
  readonly pans: boolean
}

export interface PointerDownContext {
  /** Whether the eyedropper is armed. */
  readonly eyedropper: boolean
  /** How many pointers are down on the surface, this one included. */
  readonly touches: number
  /** `'mouse'`, `'touch'`, `'pen'` — as `PointerEvent.pointerType` reports it. */
  readonly pointerType: string
  /** `PointerEvent.button`. Only meaningful for a mouse. */
  readonly button: number
}

/**
 * What a pointer going down on the surface means.
 *
 * Aiming and panning are **mutually exclusive**: that exclusivity is the whole fix. A
 * second pointer means a pinch is starting and the pinch has its own pan, so neither
 * applies.
 */
export function pointerIntent(context: PointerDownContext): PointerIntent {
  const { eyedropper, touches, pointerType, button } = context
  const idle = { aims: false, pans: false }

  // The right button opens the menu and the middle one pastes on some systems: neither
  // should slide the photograph, and neither should measure a grey.
  if (pointerType === 'mouse' && button !== 0) return idle
  // A second pointer is a pinch, which owns the gesture entirely.
  if (touches !== 1) return idle

  return eyedropper ? { aims: true, pans: false } : { aims: false, pans: true }
}

export interface PickLiftContext {
  /** Whether the eyedropper is still armed when the finger lifts. */
  readonly eyedropper: boolean
  /** Whether this lift belongs to the pointer that was aiming. */
  readonly aiming: boolean
  /** Whether a pinch is in progress. */
  readonly pinching: boolean
  /** How many pointers are still down. */
  readonly touches: number
}

/**
 * Whether lifting the finger takes the sample.
 *
 * Note what is **not** here any more: how far the pointer travelled. Travel used to
 * disqualify a sample, and that was the bug. Sliding to the grey you mean is the normal
 * way to use this, not a sign that something else was intended.
 *
 * What still disqualifies it is a change of intent: a second finger landed, so this was a
 * pinch and a grey taken where the second finger happened to fall is a grey nobody chose;
 * or the mode was disarmed mid-gesture.
 */
export function liftTakesSample(context: PickLiftContext): boolean {
  const { eyedropper, aiming, pinching, touches } = context
  if (!eyedropper || !aiming) return false
  if (pinching || touches > 1) return false
  return true
}
