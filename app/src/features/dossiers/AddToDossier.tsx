import { useMemo, useState } from 'react'
import { Chips } from '../../components/ui'
import { ARTIST_LABEL, type ArtistFund } from '../../lib/types'
import { useCatalogArtworks } from '../documentary/relationships/useCatalogArtworks'
import { planText } from './dossierDraft'
import { pickableArtworks, pickerNotice } from './dossierPicker'

type Kind = 'ARTWORK' | 'TEXT' | 'BIOGRAPHY'

const KIND_LABEL: Record<Kind, string> = {
  ARTWORK: 'Obra',
  TEXT: 'Texto',
  BIOGRAPHY: 'Biografía',
}

/**
 * What is added to a dossier: an artwork, a free text or the biography of a fund
 * (RF-1602, RF-1614, RF-1616).
 *
 * **One panel with three doors and not three panels**, because the three end up in
 * the same list and at the same place — the end — and reading them as three
 * separate features would hide exactly what ADR-011 decided: that a paragraph is a
 * peer of an artwork.
 *
 * The artwork chooser reads the LOCAL MIRROR of the catalogue and not a query per
 * keystroke: it answers while the finger is still moving and it works with no
 * coverage, which is the difference between arming a dossier in a storeroom and
 * writing the codes on paper for later. The decision is `useCatalogArtworks`', and
 * it is reused here rather than copied.
 */
export function AddToDossier({
  inDossier,
  onAddArtwork,
  onAddText,
  onAddBiography,
}: {
  /** The codes already in the dossier: they are not offered again. */
  inDossier: readonly string[]
  onAddArtwork: (catalogId: string) => Promise<string | null>
  onAddText: (heading: string, body: string) => Promise<string | null>
  onAddBiography: (fund: ArtistFund, withCv: boolean) => Promise<string | null>
}) {
  const [kind, setKind] = useState<Kind>('ARTWORK')
  const [query, setQuery] = useState('')
  const [heading, setHeading] = useState('')
  const [body, setBody] = useState('')
  const [fund, setFund] = useState<ArtistFund>('ROTILI')
  const [withCv, setWithCv] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { catalog, loading } = useCatalogArtworks()
  const picked = useMemo(
    () => pickableArtworks(catalog, inDossier, query),
    [catalog, inDossier, query],
  )
  const notice = pickerNotice({
    loading,
    shown: picked.entries.length,
    alreadyIn: picked.alreadyIn,
    catalogSize: catalog.filter((artwork) => artwork.active).length,
    query,
  })

  async function run(action: () => Promise<string | null>, after: () => void) {
    setBusy(true)
    setProblem(null)
    const message = await action()
    setBusy(false)
    if (message !== null) {
      setProblem(message)
      return
    }
    after()
  }

  return (
    <div className="card space-y-3">
      <Chips
        id="add-kind"
        label="Añadir"
        value={kind}
        onChange={setKind}
        columns={3}
        options={(['ARTWORK', 'TEXT', 'BIOGRAPHY'] as const).map((value) => ({
          value,
          text: KIND_LABEL[value],
        }))}
      />

      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}

      {kind === 'ARTWORK' && (
        <>
          <input
            className="field"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Código, título, artista o año"
            aria-label="Buscar una obra del catálogo"
            autoComplete="off"
            autoCapitalize="none"
          />
          {picked.alreadyIn > 0 && (
            // Dicho y no callado: un catálogo al que le faltan obras es como
            // alguien concluye que una no está catalogada.
            <p className="text-xs text-stone-500">
              {picked.alreadyIn === 1
                ? '1 obra no se ofrece porque ya está en el dossier.'
                : `${picked.alreadyIn} obras no se ofrecen porque ya están en el dossier.`}
            </p>
          )}
          {notice && <p className="text-sm text-stone-600">{notice}</p>}
          <ul className="space-y-1">
            {picked.entries.map((entry) => (
              <li key={entry.catalogId}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm active:bg-stone-50 disabled:opacity-50"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => onAddArtwork(entry.catalogId),
                      () => setQuery(''),
                    )
                  }
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {kind === 'TEXT' && (
        <>
          <div>
            <label className="block text-sm font-medium" htmlFor="item-heading">
              Rótulo
            </label>
            <input
              id="item-heading"
              className="field mt-1"
              value={heading}
              onChange={(event) => setHeading(event.target.value)}
              placeholder="Óleos, 1962-1968"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="item-body">
              Párrafo
            </label>
            <textarea
              id="item-body"
              className="field mt-1 min-h-[5rem]"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Las tres primeras están sin enmarcar."
            />
          </div>
          <p className="text-xs text-stone-500">
            Con uno de los dos basta. Se coloca al final y desde ahí se mueve.
          </p>
          <button
            type="button"
            className="min-h-[2.75rem] w-full rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              // Comprobado aquí para que la negativa sea una frase y no el nombre
              // de una restricción; la base la vuelve a comprobar de todos modos.
              const plan = planText(heading, body)
              if (plan.action === 'blank') {
                setProblem(plan.message)
                return
              }
              void run(
                () => onAddText(plan.heading, plan.body),
                () => {
                  setHeading('')
                  setBody('')
                },
              )
            }}
          >
            Añadir el texto
          </button>
        </>
      )}

      {kind === 'BIOGRAPHY' && (
        <>
          <div>
            <label className="block text-sm font-medium" htmlFor="item-fund">
              De qué artista
            </label>
            <select
              id="item-fund"
              className="field mt-1"
              value={fund}
              onChange={(event) => setFund(event.target.value as ArtistFund)}
            >
              {(['ROTILI', 'RUIZ_CAMPINS'] as const).map((value) => (
                <option key={value} value={value}>
                  {ARTIST_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withCv}
              onChange={(event) => setWithCv(event.target.checked)}
            />
            Con el currículum detrás
          </label>
          <p className="text-xs text-stone-500">
            La biografía y el currículum se escriben una vez en la ficha del fondo, en «Tablas ·
            Fondos». Aquí se elige de quién es y dónde va.
          </p>
          <button
            type="button"
            className="min-h-[2.75rem] w-full rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              void run(
                () => onAddBiography(fund, withCv),
                () => undefined,
              )
            }
          >
            Añadir la biografía
          </button>
        </>
      )}
    </div>
  )
}
