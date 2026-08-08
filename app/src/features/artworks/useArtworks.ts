import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { signedUrls } from '../../lib/images'
import type { ArtistFund, Artwork } from '../../lib/types'
import { DEFAULT_VIEW, serializeView, type ListView } from './listView'
import { sequenceOf } from './sequence'
import {
  readArtworksSnapshot,
  saveArtworksSnapshot,
  thumbnailsToSign,
  type CachedThumbnail,
} from './artworksCache'

const FIELDS = `
  catalog_id, artist, title, attributed_title, artwork_type, series,
  execution_date, start_year, end_year, approximate_date, unconfirmed_date, date_note,
  technique, support,
  height_cm, width_cm, depth_cm,
  signed, signature_description, dated_on_artwork,
  conservation_status, physical_place_id, existence_status,
  photographed, measurements_verified, inventory_phase_completed, documentation_phase_completed,
  catalog_record_complete, inventory_process_notes,
  updated_at, basic_updated_at, updated_by, active
`

/** Page size of the mirror fetch: the API caps a single response. */
const PAGE = 500

/**
 * How long a thumbnail's signed URL lasts. A week, unlike the hour used for
 * the derivative and the master (RF-110): the URL is the cache key of the
 * image the browser already downloaded, so re-signing on every visit would
 * throw away every cached thumbnail. The trade is bounded — a thumbnail is
 * 400 px, the level with the least to leak, and the bucket stays private.
 */
const THUMBNAIL_URL_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * The whole active catalog, paged so no row is silently dropped by the API
 * cap (RF-602). RF-609: deactivated records do not appear in the list. The
 * RLS policy already hides them from the Reader, but a cataloger does see
 * them, so the explicit filter is needed here too.
 */
export async function fetchAllArtworks(): Promise<Artwork[]> {
  const all: Artwork[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('artworks')
      .select(FIELDS)
      .eq('active', true)
      .order('catalog_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Artwork[]
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

/**
 * The list works over a LOCAL MIRROR of the catalog: filtering, ordering and
 * searching are instant because they never leave the device. The mirror
 * paints from the persisted snapshot, refreshes in the background on mount,
 * and again on every Realtime push (the page subscribes with useLiveChanges
 * and calls `reload`). A few hundred records make this cheap; the paged
 * fetch keeps it correct if the catalog outgrows a single response.
 */
/**
 * `placeScope` is the reach of the location filter (ADR-006): the chosen places
 * plus everything inside them. It comes from the page, which is where the tree is
 * loaded, and null while it has not arrived — see matchesView for why that is not
 * the same as an empty set.
 */
/** Nada apartado, que es lo que ve quien no ha tocado la tabla de fondos. */
const EMPTY_FUNDS: ReadonlySet<ArtistFund> = new Set()

export function useArtworks(
  view: ListView = DEFAULT_VIEW,
  placeScope: ReadonlySet<string> | null = null,
  /**
   * Los fondos cuyas obras se apartan del listado (ADR-007, segunda entrega).
   *
   * Llega de la página, que es donde se lee la tabla de fondos, y por omisión no
   * aparta nada: quien llame sin saber de esto ve el catálogo entero.
   */
  hiddenFunds: ReadonlySet<ArtistFund> = EMPTY_FUNDS,
) {
  const snapshot = useRef(readArtworksSnapshot()).current
  const [all, setAll] = useState<Artwork[] | null>(snapshot?.rows ?? null)
  // Thumbnails paint from the snapshot: their URLs are the ones handed out
  // before, so the browser reuses the images it already has instead of
  // downloading the whole index again.
  const [thumbnails, setThumbnails] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(snapshot?.thumbnails ?? {}).map(([id, t]) => [id, t.url]),
    ),
  )
  const [error, setError] = useState<string | null>(null)

  const rowsRef = useRef<Artwork[] | null>(all)
  rowsRef.current = all
  const cachedRef = useRef<Record<string, CachedThumbnail>>(snapshot?.thumbnails ?? {})

  /**
   * Refreshes which image represents each artwork (RF-403, decided by the
   * `representative_image` view) and signs only what changed: a new main
   * image, a photo added or retired, or a signature about to expire. An
   * unchanged thumbnail keeps its URL, which is what makes the revisit free.
   */
  const refreshThumbnails = useCallback(async () => {
    const rows = rowsRef.current
    if (!rows || rows.length === 0) {
      cachedRef.current = {}
      setThumbnails({})
      return
    }

    // The whole view, not filtered by identifier: RLS already limits it to
    // what this session may read, and a list of hundreds of identifiers in
    // the query string would eventually outgrow the URL.
    const paths: Record<string, string> = {}
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('representative_image')
        .select('catalog_id, thumbnail_path')
        .order('catalog_id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return
      const page = (data ?? []) as { catalog_id: string; thumbnail_path: string }[]
      for (const r of page) paths[r.catalog_id] = r.thumbnail_path
      if (page.length < PAGE) break
    }

    const stalePaths = thumbnailsToSign(paths, cachedRef.current)
    const fresh = stalePaths.length > 0 ? await signedUrls(stalePaths, THUMBNAIL_URL_TTL_SECONDS) : {}
    const expiresAt = Date.now() + THUMBNAIL_URL_TTL_SECONDS * 1000

    const next: Record<string, CachedThumbnail> = {}
    for (const [catalogId, path] of Object.entries(paths)) {
      const cached = cachedRef.current[catalogId]
      const url = fresh[path]
      if (url) {
        next[catalogId] = { path, url, expiresAt }
      } else if (cached && cached.path === path) {
        // Nothing to sign, or the signing failed: what works stays.
        next[catalogId] = cached
      }
    }

    cachedRef.current = next
    setThumbnails(Object.fromEntries(Object.entries(next).map(([id, t]) => [id, t.url])))
    saveArtworksSnapshot({ rows, thumbnails: next })
  }, [])

  const reload = useCallback(async () => {
    try {
      const rows = await fetchAllArtworks()
      setAll(rows)
      rowsRef.current = rows
      saveArtworksSnapshot({ rows, thumbnails: cachedRef.current })
      setError(null)
      await refreshThumbnails()
    } catch (e) {
      // The stale mirror stays on screen: outdated data plus a notice beats
      // an empty list in a storage room with intermittent coverage.
      setError(e instanceof Error ? e.message : String(e))
      setAll((current) => current ?? [])
    }
  }, [refreshThumbnails])

  useEffect(() => {
    void reload()
  }, [reload])

  // The very same function the record view uses for its previous/next (RF-311):
  // the list and the sequence cannot disagree about what comes after what
  // because there is only one place where that is decided.
  //
  // The view travels as its SERIALIZATION, the same string the URL carries: its
  // object identity changes on every parse and depending on that would refilter
  // on each render. Field by field also worked until «Sin serie» arrived — an
  // empty entry joins to the same string as no entry at all, so toggling it
  // changed nothing — and one canonical string cannot have that class of hole.
  //
  // The scope goes into the key as its own sorted list, for the same reason: the
  // set is a new object on every render of the page, and the identifiers in it are
  // what actually changes the answer.
  const key = serializeView(view).toString()
  const scopeKey = placeScope === null ? 'null' : [...placeScope].sort().join(' ')
  // Por lo mismo que el alcance: el conjunto es un objeto nuevo en cada pintado y
  // lo que cambia la respuesta son los códigos que lleva dentro.
  const hiddenKey = [...hiddenFunds].sort().join(' ')
  const artworks = useMemo(() => {
    if (!all) return []
    return sequenceOf(all, view, placeScope, hiddenFunds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, key, scopeKey, hiddenKey])

  // Loading only when there is no snapshot at all: with one, the list paints
  // instantly and the refresh happens behind it.
  //
  // `refreshThumbnails` is exposed so the page can react to photo changes
  // (Realtime on `images`) without refetching the whole mirror: adding,
  // retiring or re-marking a photo changes which image represents the artwork,
  // not the artwork's own data.
  return { artworks, thumbnails, loading: all === null, error, reload, refreshThumbnails }
}

/**
 * One artwork, for its record page.
 *
 * `mirror` is the local copy of the catalog the record view already holds for
 * its previous/next sequence (see useArtworkSequence). Painting from it first
 * matters more than it looks: the mirror is fetched with the SAME field list as
 * this query, so its row is a complete record, and passing from artwork to
 * artwork with the thumb becomes instant instead of flashing a spinner at every
 * swipe (RF-311). The query still runs, and what it brings replaces the copy.
 *
 * A stale answer never wins: swiping fast leaves several queries in flight, and
 * only the one for the record being shown is allowed to write.
 */
export function useArtwork(id: string | undefined, mirror: readonly Artwork[] = []) {
  /** The last answer of the query, and which record it was about. */
  const [answer, setAnswer] = useState<{
    id: string
    artwork: Artwork | null
    error: string | null
  } | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase
      .from('artworks')
      .select(FIELDS)
      .eq('catalog_id', id)
      .maybeSingle()
    setAnswer({
      id,
      artwork: (data ?? null) as unknown as Artwork | null,
      error: error?.message ?? null,
    })
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  // Swiping fast leaves several queries in flight: an answer about the record
  // that was on screen a moment ago is not an answer about this one.
  const answered = answer !== null && answer.id === id ? answer : null
  const cached = id === undefined ? null : (mirror.find((row) => row.catalog_id === id) ?? null)

  return {
    // A failed query does not blank a record the mirror already holds — outdated
    // data plus a notice beats an empty page in a storage room, the same choice
    // the list makes. A query that answered NOTHING is a different thing (the
    // record is deactivated, or not readable by this session) and must show.
    artwork: answered === null || answered.error !== null ? cached : answered.artwork,
    loading: answered === null && cached === null,
    error: answered?.error ?? null,
    reload,
  }
}

/**
 * Previews the identifier that would be assigned (DP-01). It does not reserve
 * it: between the query and the save, another cataloger may have created a
 * record. The final number is set by the database, with a per-fund lock, and
 * is the one the insert returns.
 */
export async function previewId(artist: ArtistFund): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_catalog_id', { p_artist: artist })
  return error ? null : (data as string)
}
