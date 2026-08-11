import { useEffect, useState } from 'react'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import { ExpandIcon, YesIcon } from '../../components/ui'
import { shotOrdinal } from './archiveDownloads'
import { originalSize, pixelText } from './photoDetails'
import { useArtworkImages } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'
import { PhotoDownloads } from './PhotoDownloads'
import { PhotoViewer } from './PhotoViewer'
import { usePhotoDetails } from './usePhotoDetails'

/**
 * Gallery of the record page — a view, nothing else. Everything that changes
 * the photos (adding with a shot type, retyping, main image, retiring) lives
 * on its own route, /artwork/:id/photos: those actions apply immediately and
 * mixing them into the reading view filled it with controls.
 */
export function ArtworkGallery({ catalogId }: { catalogId: string }) {
  const { images, thumbUrls, mainId, loading } = useArtworkImages(catalogId)
  // The state of the full-resolution corrected copy (RF-420) is not in the gallery's
  // query, and without it the record could not tell «no hay copia» from «no lo sé».
  // Short columns, one extra select over rows already loaded.
  const { details, detailsFailed } = usePhotoDetails(catalogId, images, loading)
  const [viewId, setViewId] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)

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

  // The size of the photograph being viewed, from the same reading of those two columns
  // the download buttons use: two readings would be two places for one of them to start
  // disagreeing about a null. It is the original's size with the orientation already
  // applied — what any viewer shows — and it is null on the rows uploaded before the
  // colour migration added the columns, because nothing was filled in backwards.
  const viewingPixels = pixelText(originalSize(viewing ? details[viewing.image_id] : null))

  // «f» opens the gallery full screen. It lives here and not in the page because
  // the viewer belongs to the gallery: lifting the state just to shortcut a key would be
  // splitting across two places something only one uses. With the viewer open it does
  // nothing: closing it is Escape or the back button, as always.
  const hayImagenes = images.length > 0
  useEffect(() => {
    if (!hayImagenes) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'f' && event.key !== 'F') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[data-photo-viewer]')) return
      event.preventDefault()
      setViewerOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hayImagenes])

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
    /* data-swipe-ignore: over the gallery a horizontal drag passes PHOTOGRAPHS,
       not artworks (RF-311). The whole block is marked, strip included: both are
       horizontal scrollers, and «on the photo you move photos» is a rule that
       can be explained in one sentence. */
    <div className="mb-3" data-swipe-ignore>
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
                    <span className="flex h-20 w-20 items-center justify-center bg-stone-100 text-3xs text-stone-500">
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
                    <span className="absolute bottom-1 left-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-3xs text-white">
                      {SHOT_TYPE_LABEL[r.shot_type]}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="relative">
        <PhotoCarousel
          images={images}
          thumbUrls={thumbUrls}
          viewId={viewId}
          onView={setViewId}
          catalogId={catalogId}
          onImageTap={() => setViewerOpen(true)}
        />
        <button
          type="button"
          aria-label="Ver a pantalla completa (tecla F)"
          // `title` for the hover hint: the shortcut is not discovered
          // on its own, and on the desktop the icon is where it is going to be looked for. On the phone
          // it does not get in the way, because there is no hover or keyboard there.
          title="Ver a pantalla completa · tecla F"
          onClick={() => setViewerOpen(true)}
          className="absolute bottom-2 right-2 rounded-full bg-stone-900/70 p-2.5 text-white"
        >
          <ExpandIcon className="h-4 w-4" />
        </button>
      </div>

      {viewerOpen && (
        <PhotoViewer
          images={images}
          thumbUrls={thumbUrls}
          viewId={viewId}
          onView={setViewId}
          catalogId={catalogId}
          onClose={() => setViewerOpen(false)}
          details={details}
        />
      )}

      {/* The size joins this line and not one of its own because it is a fact about the
          photograph, like the shot type: the counter already answers «which one of them
          is this», and the size answers «how big it is» in the same breath. */}
      <p className="mt-1 text-xs text-stone-500">
        {viewing ? `${viewIndex + 1} de ` : ''}
        {images.length} {images.length === 1 ? 'fotografía' : 'fotografías'}
        {viewing ? ` · ${SHOT_TYPE_LABEL[viewing.shot_type]}` : ''}
        {viewingPixels ? ` · ${viewingPixels}` : ''}
      </p>

      {/* RF-411 and RF-420: neither file is ever SHOWN in a view — both get
          downloaded deliberately, each with its own signed URL, and the panel
          says in one line what the difference is. It is offered to the Reader
          too: handing an original or a print copy to a print shop or a curator
          is exactly their use case. */}
      {viewing && (
        <PhotoDownloads
          // The key is the photograph, so passing to the next one resets the panel.
          // Without it React keeps the same instance and its state travels: «Descargado
          // AR-0001_general_original.jpg» stays on screen while the signature detail is
          // the one being looked at, and so does a red strip about a file that is no
          // longer the one on offer. A message that talks about another photograph is
          // worse than no message.
          key={viewing.image_id}
          catalogId={catalogId}
          row={viewing}
          detail={details[viewing.image_id]}
          detailsFailed={detailsFailed}
          ordinal={shotOrdinal(images, viewing.image_id)}
        />
      )}
    </div>
  )
}
