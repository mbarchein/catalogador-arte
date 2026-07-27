import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { FooterMenu } from './FooterMenu'

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

/**
 * Fixed header with a back button, the view's title and a slot for the page's
 * main action ("Editar", "+ Nueva"...). Having the action live in the fixed
 * header means it is available without scrolling back up, however long the
 * page — a pattern inherited from the team's other application.
 *
 * Going back: if there is in-app history, it is used (keeps the page one came
 * from); if not — a cold entry, e.g. scanning the label's QR — the `back`
 * destination is used. Never a bare history.back(): with empty history it
 * would kick the cataloger out of the installed app, which in full screen has
 * no browser bar to come back in through.
 */
export function Layout({
  children,
  title,
  back,
  action,
}: {
  children: ReactNode
  /** Short title of the view, next to the back button. */
  title?: string
  /** Fallback destination for the back button. Without it, none is shown: it is the root. */
  back?: string
  /** Main action of the view, on the right side of the header. */
  action?: ReactNode
}) {
  const navigate = useNavigate()
  const { key } = useLocation()

  function goBack() {
    // location.key is 'default' only on the first entry (direct link, reload):
    // any other value means there is in-app history.
    if (key !== 'default') navigate(-1)
    else if (back) navigate(back)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 px-2 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          {back ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Volver"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-700 active:bg-stone-200"
            >
              <BackIcon />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <span className="min-w-0 flex-1 truncate font-semibold">{title ?? 'Catalogador'}</span>
          {action && <div className="shrink-0 pr-1">{action}</div>}
        </div>
      </header>

      <main className="flex-1 p-4">{children}</main>

      <FooterMenu />
    </div>
  )
}

/**
 * Sign out. Outside the header, where it competed for room with the back
 * button and could be pressed by accident mid-batch. Down here it is still
 * always at hand, which is needed: the session lasts twelve hours and the
 * device may be shared.
 */
export function SignOut() {
  const { profile, canEdit, signOut } = useAuth()

  return (
    <div className="mt-8 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
      {profile && (
        <p className="mb-1">
          {profile.name || profile.email}
          {!canEdit && ' · solo consulta'}
        </p>
      )}
      <button onClick={signOut} className="min-h-touch px-4 underline hover:text-stone-800">
        Cerrar sesión
      </button>
    </div>
  )
}
