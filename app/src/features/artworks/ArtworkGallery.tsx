import { useEffect, useState } from 'react'
import { masterDownloadUrl } from '../../lib/images'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import { YesIcon } from '../../components/ui'
import { useArtworkImages } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'

/**
 * Gallery of the record page — a view, nothing else. Everything that changes
 * the photos (adding with a shot type, retyping, main image, retiring) lives
 * on its own route, /artwork/:id/photos: those actions apply immediately and
 * mixing them into the reading view filled it with controls.
 */
export function ArtworkGallery({ catalogId }: { catalogId: string }) {
  const { images, thumbUrls, mainId, loading } = useArtworkImages(catalogId)
  const [viewId, setViewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Start on the main image; if the viewed one disappears (someone retired it
  // from the management page), fall back to the current main.
  useEffect(() => {
    if (loading) return
    setViewId((current) =>
      current && images.some((r) => r.image_id === current)
        ? current
        : (mainId ?? images[0]?.image_id ?? null),
    )
  }, [loading, images, mainId])

  const viewIndex = Math.max(
    0,
    images.findIndex((r) => r.image_id === viewId),
  )
  const viewing = images[viewIndex]

  if (loading) {
    return <div className="mb-3 aspect-[4/3] animate-pulse rounded-xl bg-stone-200" />
  }

  // RF-404: explicit placeholder, not an unexplained gap. Managing (and
  // adding the first photo) lives in the header button of the record page.
  if (images.length === 0) {
    return (
      <div className="mb-3">
        <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-stone-200 bg-stone-100">
          <p className="text-sm text-stone-500">Imagen no disponible</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-3">
      {/* The strip goes ABOVE the large photo: it is the navigation, and it
          stays put while the carousel below moves. */}
      {images.length > 1 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((r) => {
            const isMain = r.image_id === mainId
            return (
              <li key={r.image_id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setViewId(r.image_id)}
                  aria-label={`Ver ${SHOT_TYPE_LABEL[r.shot_type]}${isMain ? ', imagen principal' : ''}`}
                  aria-pressed={r.image_id === viewId}
                  className={`relative block overflow-hidden rounded-lg border-2 ${
                    r.image_id === viewId ? 'border-stone-800' : 'border-stone-200'
                  }`}
                >
                  {thumbUrls[r.image_id] ? (
                    <img
                      src={thumbUrls[r.image_id]}
                      alt=""
                      className="h-20 w-20 object-cover"
                    />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center bg-stone-100 text-[10px] text-stone-500">
                      sin vista
                    </span>
                  )}
                  {isMain && (
                    <span
                      className="absolute left-1 top-1 rounded-full bg-stone-900/85 p-0.5 text-white"
                      title="Imagen principal"
                    >
                      <YesIcon className="h-3 w-3" />
                    </span>
                  )}
                  {/* Same badge as the staging strip: the non-general shots
                      (back, signature detail…) are recognizable without
                      opening each one. */}
                  {r.shot_type !== 'GENERAL' && (
                    <span className="absolute bottom-1 left-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] text-white">
                      {SHOT_TYPE_LABEL[r.shot_type]}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <PhotoCarousel
        images={images}
        thumbUrls={thumbUrls}
        viewId={viewId}
        onView={setViewId}
        catalogId={catalogId}
      />

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-stone-500">
        <span>
          {viewing ? `${viewIndex + 1} de ` : ''}
          {images.length} {images.length === 1 ? 'fotografía' : 'fotografías'}
          {viewing ? ` · ${SHOT_TYPE_LABEL[viewing.shot_type]}` : ''}
        </span>
        {/* RF-411: the master is never shown in a view; it gets downloaded
            deliberately, with the function's signed URL. Also available to the
            Reader: downloading an original for a print shop or a curator is
            exactly their use case. */}
        {viewing?.master_path && (
          <button
            type="button"
            className="min-h-touch shrink-0 underline"
            onClick={() => {
              void masterDownloadUrl(viewing.master_path as string)
                .then((u) => window.open(u, '_blank', 'noopener'))
                .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            }}
          >
            Descargar máster
          </button>
        )}
      </div>
    </div>
  )
}
