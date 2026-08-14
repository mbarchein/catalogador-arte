import type { UserRole } from '../lib/types'

/**
 * The role this device last saw for this user, so the navigation does not rebuild
 * itself a moment after the application opens (RNF-106).
 *
 * ── WHAT WAS SEEN ───────────────────────────────────────────
 *
 * The footer menu paints «Añadir» and «Tablas» only for whoever can edit, and the role
 * arrives in a query of its own AFTER the session. So the menu opened with three tabs
 * and became five a moment later: the labels moved under the thumb while it was already
 * going down, which is the one place in the application where a tab must not move.
 *
 * ── WHAT IT DOES AND DOES NOT DECIDE ────────────────────────
 *
 * It decides **what is painted before the answer arrives**, and nothing else. The role
 * that governs is the one in `profiles`, and what protects the data is the RLS policies:
 * the anonymous key travels in the client, so a boolean here could never be a permission
 * in the first place. Remembering it is exactly as safe as `canEdit` already was — and it
 * is used in ONE direction only, to offer, never to refuse: a screen for whoever edits
 * still waits for the real answer before turning anybody away, so a promotion cannot
 * bounce somebody out of the screen they have just been given.
 *
 * It is kept for ONE user — the last one who signed in on this device — and it is only
 * used when the open session is that same user's. Two people share a phone in this team,
 * and the Reader must not open the Cataloger's menu. And it is wiped on sign out, with
 * the mirrors of the catalogue.
 */

const KEY = 'catalogador.remembered-role'
const VERSION = 1

const ROLES: readonly string[] = ['SUPERUSER', 'CATALOGER', 'READER']

export interface RememberedRole {
  /** The user the role belongs to. A role with no owner cannot be used. */
  userId: string
  role: UserRole
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** What is remembered, or null if there is nothing usable. */
export function readRememberedRole(
  storage: Storage | undefined = getStorage(),
): RememberedRole | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; userId?: unknown; role?: unknown }
    if (parsed.v !== VERSION) return null
    if (typeof parsed.userId !== 'string' || parsed.userId === '') return null
    if (typeof parsed.role !== 'string' || !ROLES.includes(parsed.role)) return null
    return { userId: parsed.userId, role: parsed.role as UserRole }
  } catch {
    // Anything unrecognized is «nothing is remembered»: the menu waits for the answer,
    // which is what it did before this module existed.
    return null
  }
}

export function rememberRole(
  userId: string,
  role: UserRole,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, userId, role }))
  } catch {
    // Without storage —quota, private browsing— everything still works: the tabs go
    // back to appearing a moment late.
  }
}

/** Forgets it. On sign out, with the mirrors of the catalogue. */
export function clearRememberedRole(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}

/**
 * The remembered role, but only for the session that is open.
 *
 * The owner has to match: on a shared device, the Reader signing in after the
 * Cataloger must not be offered the Cataloger's tabs — they would take her to screens
 * the database then refuses, which reads as a broken application and not as a
 * permission she does not have.
 */
export function rememberedRoleFor(
  remembered: RememberedRole | null,
  userId: string | null,
): UserRole | null {
  if (remembered === null || userId === null || remembered.userId !== userId) return null
  return remembered.role
}

/** Whether what is remembered says this session was editing. */
export function remembersEditing(
  remembered: RememberedRole | null,
  userId: string | null,
): boolean {
  const role = rememberedRoleFor(remembered, userId)
  return role === 'CATALOGER' || role === 'SUPERUSER'
}
