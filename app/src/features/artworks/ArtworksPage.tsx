import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { displayDate } from '../../lib/dates'
import { existenceNotice, displayMeasurements, displayTitle } from '../../lib/title'
import { ARTIST_LABEL } from '../../lib/types'
import { useLiveChanges } from '../../lib/live'
import { useArtworks } from './useArtworks'

export function ArtworksPage() {
  const [search, setSearch] = useState('')
  const { artworks, thumbnails, loading, error, reload } = useArtworks(search)
  const { canEdit } = useAuth()

  // The list updates live: if another cataloger creates or edits an artwork,
  // it appears without reloading. It is the view where two people working at
  // once step on each other unknowingly.
  useLiveChanges('artworks', reload)

  return (
    <Layout
      title="Obras"
      // RF-1104: the create button only for whoever can edit. In the fixed
      // header it stays available with the list scrolled — with hundreds of
      // artworks, "capture the next one" must not require scrolling back up.
      action={
        canEdit ? (
          <Link to="/captura" className="btn-primary min-h-[2.5rem] px-4 text-sm">
            + Nueva
          </Link>
        ) : undefined
      }
    >
      <div className="mb-4">
        <input
          className="field"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código o título"
          aria-label="Buscar obras"
        />
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No se ha podido cargar el listado: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-stone-600">Cargando…</p>
      ) : artworks.length === 0 ? (
        /* RF-605: never a blank page. The search is kept and what happened is
           explained where the list would go. */
        <div className="card text-sm">
          {search.trim() === '' ? (
            <>
              <p className="font-medium">Todavía no hay obra catalogada.</p>
              {canEdit && (
                <p className="mt-1 text-stone-600">
                  Empieza por la <Link to="/captura" className="underline">captura rápida</Link>.
                </p>
              )}
            </>
          ) : (
            <p>No se han encontrado obras con estos criterios.</p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-stone-500">
            {artworks.length} {artworks.length === 1 ? 'obra' : 'obras'}
          </p>
          <ul className="space-y-2">
            {artworks.map((artwork) => {
              const notice = existenceNotice(artwork)
              return (
                <li key={artwork.catalog_id}>
                  {/* The code is the only link to the record (RF-604), but on
                      a phone the whole card must be tappable: aiming at a
                      twelve-character text with a thumb is not reasonable. */}
                  <Link
                    to={`/obra/${artwork.catalog_id}`}
                    className="card flex gap-3 hover:border-stone-400"
                  >
                    {/* RF-604: thumbnail of the representative image. Which
                        one it is is decided by the database view, not this
                        screen. */}
                    <Thumbnail url={thumbnails[artwork.catalog_id]} photographed={artwork.photographed} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {artwork.catalog_id}
                        </span>
                        <span className="shrink-0 text-xs text-stone-500">
                          {displayDate(artwork.execution_date)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate">{displayTitle(artwork.title)}</p>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {ARTIST_LABEL[artwork.artist]}
                        {artwork.artwork_type && ` · ${artwork.artwork_type}`}
                        {' · '}
                        {displayMeasurements(artwork)}
                      </p>
                      {notice && (
                        <p className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                          {notice}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Layout>
  )
}

/**
 * List thumbnail, fixed-size so rows do not dance while images arrive: the
 * list paints before the URL signatures, and without a reserved box the text
 * would jump as each photo appears.
 *
 * Three distinct states, and distinguishing them matters:
 *  - there is a photo and its URL arrived → it is shown;
 *  - the artwork is photographed but the URL has not arrived yet → neutral gap;
 *  - the artwork has no photo at all → it is said, because in an inventory
 *    "unphotographed" is pending work and should be visible at a glance.
 */
function Thumbnail({ url, photographed }: { url?: string; photographed: boolean }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-lg border border-stone-200 bg-white object-cover"
      />
    )
  }
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-1 text-center text-[10px] leading-tight text-stone-400"
      aria-hidden={photographed}
    >
      {photographed ? '' : 'Sin foto'}
    </div>
  )
}
