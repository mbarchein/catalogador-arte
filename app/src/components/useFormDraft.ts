/**
 * Noting down what is being written, and offering it on returning (RNF-106).
 *
 * The wiring of `draftStore.ts`, which is the one that decides. Here there are only the two edges that
 * need a browser: reading `localStorage` on opening the sheet and writing it while
 * typing.
 *
 * **It is read ONCE, on opening.** Reading it again on every render would make the draft
 * reappear after having discarded it, and above all it would offer itself: what
 * has just been written is stored, and a later read would find it and offer it
 * as if it were from another session.
 *
 * **It is written with a delay.** One `localStorage.setItem` per keystroke is
 * synchronous and blocks the interface thread: on a modest phone, with a form of
 * fifteen fields, that is felt while typing. Half a second after the last key is
 * invisible to whoever is writing and is plenty for what this protects — reloading, the tab
 * dying, running out of battery.
 *
 * `localStorage` can throw: Safari's private mode, quota full, or the user with
 * storage blocked. None of that can prevent filling in a form, so everything
 * is wrapped and the failure is swallowed: what is lost is the safety net, not the sheet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  draftOfferText,
  draftStorageKey,
  packDraft,
  readDraft,
  type DraftStatus,
} from './draftStore'

/** What is stored and can be offered. */
export interface DraftOffer<T> {
  draft: T
  status: DraftStatus
  /** The sentence that is read, already in Spanish and with the «hace…» inside. */
  text: string
  /** What is stored has changed since it was noted: look at it before saving. */
  stale: boolean
}

export interface FormDraft<T> {
  /** The draft there is to offer, or null. */
  offer: DraftOffer<T> | null
  /** Accepts it: returns the draft and withdraws the offer. The sheet puts it in its state. */
  accept: () => T | null
  /** Discards and deletes it: «empezar de cero». */
  discard: () => void
  /**
   * Deletes it without noise. Called **on really saving**: otherwise, the sheet would offer on
   * returning a draft identical to what is already stored.
   */
  clear: () => void
}

export function useFormDraft<T extends object>(input: {
  /**
   * Which form and over which row, for the key. With the identifier inside: two
   * half-corrected documents are two drafts, and sharing a key would make the
   * second one be offered on opening the first.
   */
  scope: string
  /** The live draft, exactly as it stands in the sheet's state. */
  draft: T
  /** Something has been typed. Without this an empty draft would be stored on every open. */
  dirty: boolean
  /**
   * How the stored row looks, with `draftFingerprint`. Null in a creation form.
   * It serves to warn if another session has corrected it while this was waiting.
   */
  fingerprint?: string | null
  /** The form carried a file, which cannot be noted down. It is said when offering it. */
  filesLost?: boolean
}): FormDraft<T> {
  const { scope, draft, dirty, fingerprint = null, filesLost = false } = input
  const key = draftStorageKey(scope)

  // The read, once and on the first render: `useState` with a function and not an effect,
  // because an effect would paint the form empty before knowing there is something to offer.
  const [offer, setOffer] = useState<DraftOffer<T> | null>(() => {
    const now = new Date()
    const read = readDraft<T>(safeRead(key), { now, fingerprint })
    if (read.draft === null) {
      // An expired draft is cleared on the way through here. No sweep is needed: the sheet
      // that left it is the one that opens again.
      if (read.status === 'expired') safeRemove(key)
      return null
    }
    const text = draftOfferText({ status: read.status, at: read.at, now, filesLost })
    if (text === null) return null
    return { draft: read.draft, status: read.status, text, stale: read.status === 'stale' }
  })

  // What the timer needs, in a ref: that way the saving effect is not rescheduled on every
  // keystroke and the delay really counts from the last one.
  const latest = useRef({ draft, dirty, fingerprint, key })
  latest.current = { draft, dirty, fingerprint, key }

  const serialised = useMemo(() => JSON.stringify(draft), [draft])

  useEffect(() => {
    if (!dirty) {
      // Emptying the form by hand also deletes the draft: leaving it in place would make the
      // sheet offer on returning what has just been removed on purpose.
      //
      // **Except while there is an unanswered offer**, and this is not a detail: on opening
      // the sheet the form is clean by definition —it carries the stored row—, so
      // without this condition the mount effect deleted the draft the sheet had just
      // offered. The offer was still read, because it is read before the effects, but
      // underneath there was nothing left: recovering it and reloading, or leaving without saving, lost it.
      // Found in Chromium, reloading the page with the form half-done.
      if (offer === null) safeRemove(key)
      return
    }
    const timer = window.setTimeout(() => {
      const now = latest.current
      safeWrite(
        now.key,
        packDraft({ draft: now.draft, at: new Date(), fingerprint: now.fingerprint }),
      )
    }, 500)
    return () => window.clearTimeout(timer)
    // `serialised` and not `draft`: a new object with the same content —what any
    // `setDraft({ ...was, ...patch })` that changes nothing returns— reschedules nothing.
  }, [serialised, dirty, key, offer])

  const accept = useCallback(() => {
    const recovered = offer?.draft ?? null
    setOffer(null)
    return recovered
  }, [offer])

  const discard = useCallback(() => {
    setOffer(null)
    safeRemove(key)
  }, [key])

  const clear = useCallback(() => {
    setOffer(null)
    safeRemove(key)
  }, [key])

  return { offer, accept, discard, clear }
}

// ── The three edges, wrapped ─────────────────────────────────
// `localStorage` throws in Safari's private mode, with the quota full and with
// storage blocked by policy. None of the three can prevent filling in a
// form: what is lost is the net, not the sheet.

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // No room or no permission. Nothing to do and nothing to say: telling the cataloger
    // about this would be reporting a breakage she cannot act on.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Igual.
  }
}
