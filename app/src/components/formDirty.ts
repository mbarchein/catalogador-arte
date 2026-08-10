/**
 * Is there anything written in this form that would be lost on closing it?
 *
 * The condition that lights up `BottomSheet`'s question. It lives apart and is pure because it is
 * what decides whether to ask or not, and there are two ways of getting that wrong that are paid for in
 * opposite directions:
 *
 *   · **falling short** and not asking about a form with data in it, which is the
 *     incident all this comes from;
 *   · **overshooting** and asking about a blank one, which is the quickest way for the
 *     question to be learnt to be dismissed unread — and then on the day it matters it is not
 *     read either.
 *
 * Hence the two rules that are not obvious: **a space is not work** —closing over a
 * brush after having touched the space bar does not deserve a sign— and **a search
 * half-typed does not either**, so the search boxes are out; each sheet decides that
 * when it calls, and it is said in each place.
 */

/**
 * Compares the draft with the starting state, field by field.
 *
 * With the empty draft as the starting point it answers «has anything been written?»; with the
 * stored row, «is there an unsaved correction?». It is the same question from both
 * sides, and that is why it is a single function: a creation sheet and a correction one cannot
 * protect different things.
 *
 * Strings are compared **trimmed**: an extra space is not a correction, and it does not
 * go to the base either — every planner in the project trims before writing.
 *
 * It only looks at the fields the starting state declares, which leaves out whatever the sheet
 * carries on top that is not the form's. This project's drafts are flat
 * (`DocumentFields`, `ReferenceEdit`…); a value that is not primitive is compared by
 * identity, and if a nested one ever needs comparing, it is compared in the sheet and
 * added with an `||`.
 */
export function draftDirty<T extends object>(current: T, initial: T): boolean {
  // `T extends object` and not a `Record` with the values narrowed: the project's drafts
  // are interfaces (`DocumentFields`, `ReferenceEdit`) and an interface has no index
  // signature, so narrowing the values in the type would force touching all of them.
  // What is compared is narrowed below, which is where it can be checked.
  return (Object.keys(initial) as (keyof T)[]).some((key) => !sameValue(current[key], initial[key]))
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  // Null and undefined are the same «no datum» for a form: a field the row brings as null
  // and the draft leaves unset is not a correction.
  if (a == null && b == null) return true
  return Object.is(a, b)
}

/**
 * Has anything been written in any of these texts?
 *
 * For the sheets whose work is two free fields —a link's note, a citation's
 * page— and that have no draft to compare with. It trims, for the same reason as
 * `draftDirty`.
 */
export function anyWritten(...texts: (string | null | undefined)[]): boolean {
  return texts.some((text) => (text ?? '').trim() !== '')
}
