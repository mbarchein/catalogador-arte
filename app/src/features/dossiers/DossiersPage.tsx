import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { Toggle } from '../../components/ui'
import { dossiersNotice, rankDossiers, retiredCount } from './dossierIndex'
import { useDossiers } from './useDossiers'

/**
 * The index of dossiers, with its own search and the door to a new one (RF-1601,
 * RF-1610, RF-609).
 *
 * **Readable by anybody who can read, writable by whoever can edit**, like the
 * exhibitions index: a dossier is content of the catalogue and not a maintenance
 * list. RLS already hands a Lector only the live ones, and the «Nuevo» button is
 * not painted for one — with the route checking again, because a button that is
 * not painted is not a protection.
 *
 * **Its door is in «Tablas» and not in the footer menu**, and that is a
 * consequence and not a preference: the footer holds five tabs and the fifth
 * already cost a point of type size, so a sixth would narrow the five everyday
 * ones. It is the same reasoning the wastebasket wrote down. The cost is real and
 * worth saying: a Lector reaches this screen only by link, because «Tablas» is the
 * Cataloguer's. When the dossier is used every week that trade goes the other way.
 */
export function DossiersPage() {
  const { canEdit } = useAuth()
  const navigate = useNavigate()
  const { dossiers, loading, error, addDossier } = useDossiers()
  const [query, setQuery] = useState('')
  const [includingRetired, setIncludingRetired] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const entries = useMemo(
    () => rankDossiers(dossiers, query, { includeRetired: includingRetired }),
    [dossiers, query, includingRetired],
  )
  const retired = retiredCount(dossiers)
  const notice = dossiersNotice({ loading, error, count: entries.length, query })

  /**
   * Creating one asks for the title and nothing else, and then goes straight into
   * it. Everything else — who it goes to, the cover, the four switches — is decided
   * with the artworks already in front of you, which is when those answers exist.
   */
  async function create() {
    setSaving(true)
    setProblem(null)
    const result = await addDossier({ title, purpose: '', recipientPartyId: null })
    setSaving(false)
    if ('message' in result) {
      setProblem(result.message)
      return
    }
    setCreating(false)
    setTitle('')
    void navigate(`/dossiers/${result.id}`)
  }

  return (
    <Layout
      title="Dossieres"
      back="/tables"
      headerContent={
        <input
          className="field min-h-[2.5rem] py-1"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Título, uso o destinatario"
          aria-label="Buscar dossieres"
          autoComplete="off"
          autoCapitalize="none"
        />
      }
      action={
        canEdit ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[2.5rem] items-center rounded-lg bg-stone-800 px-2.5 text-sm font-medium text-white"
          >
            + Nuevo
          </button>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Qué es esto, una vez y arriba: es la única pantalla de la aplicación cuyo
          producto sale del catálogo hacia fuera. */}
      <p className="mb-3 text-sm text-stone-600">
        Una selección de obras en el orden que elijas, para mandar a una galería o para lo que haga
        falta. De cada una se emite un PDF que queda guardado con su fecha.
      </p>

      {creating && (
        <div className="card mb-3">
          <label className="block text-sm font-medium" htmlFor="dossier-title">
            Título del dossier
          </label>
          <input
            id="dossier-title"
            className="field mt-1"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Selección para la Galería Serrano"
            autoComplete="off"
          />
          {problem && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {problem}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-[2.5rem] flex-1 rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void create()}
              disabled={saving}
            >
              {saving ? 'Creando…' : 'Crear y empezar'}
            </button>
            <button
              type="button"
              className="min-h-[2.5rem] rounded-lg border border-stone-300 px-3 text-sm"
              onClick={() => {
                setCreating(false)
                setProblem(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* La papelera solo para quien puede editar y solo cuando hay algo dentro: es
          el único sitio desde el que se recupera uno retirado, y un interruptor que
          no cambia nada parece roto. */}
      {canEdit && retired > 0 && (
        <div className="mb-3">
          <Toggle
            active={includingRetired}
            onChange={setIncludingRetired}
            label="Ver también los retirados"
            help={`${retired === 1 ? '1 dossier retirado' : `${retired} dossieres retirados`}. Es el único sitio desde el que se recuperan.`}
          />
        </div>
      )}

      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.row.id}>
            {/* La fila entera es el enlace: en un móvil, un título como única zona
                pulsable es un objetivo que se falla. */}
            <Link
              to={`/dossiers/${entry.row.id}`}
              className={`card block active:bg-stone-50 ${entry.retired ? 'opacity-60' : ''}`}
            >
              <span className="block break-words font-medium">{entry.title}</span>
              <span className="mt-0.5 block break-words text-xs text-stone-600">
                {entry.subtitle}
              </span>
              {entry.retired && (
                <span className="mt-1 inline-block rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-700">
                  Retirado
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  )
}
