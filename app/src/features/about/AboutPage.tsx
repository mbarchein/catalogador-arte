import { Link } from 'react-router'
import { useEffect, useState } from 'react'
import { Layout } from '../../components/Layout'
import {
  BUILD,
  apiHost,
  cleanRange,
  formatBuildDate,
  platformInfo,
  type PlatformInfo,
} from '../../lib/buildInfo'
import { ChangelogSection } from './ChangelogSection'

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-stone-500">{label}</dt>
      {/* Nunca un hueco: un dato vacío se dice, no se omite. */}
      <dd className="min-w-0 truncate text-right text-sm">{value || 'Sin indicar'}</dd>
    </div>
  )
}

/**
 * Which version is running, on both sides.
 *
 * It exists because «it works locally and not in production» is answered by comparing these
 * lines, without opening any administration panel. It was in the profile and has been brought
 * here: it is information about the APPLICATION, and the profile is about the account.
 */
function Diagnostics() {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)

  useEffect(() => {
    let current = true
    void platformInfo().then((info) => {
      if (current) setPlatform(info)
    })
    return () => {
      current = false
    }
  }, [])

  return (
    <section className="card mb-3">
      <h2 className="mb-2 font-medium">Versión</h2>

      <dl className="divide-y divide-stone-100">
        {/* La versión es la fecha y la hora de la publicación. El número de
            `package.json` no se sube en cada despliegue, así que no distinguía una
            versión de la siguiente. */}
        <DataRow label="Versión" value={formatBuildDate()} />
        {/* In local there is no commit: the environment does not provide one,
            and saying «desarrollo» beats showing an empty datum. */}
        <DataRow label="Revisión" value={BUILD.commit || 'desarrollo'} />
      </dl>

      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">
        Interfaz
      </h3>
      <dl className="divide-y divide-stone-100">
        <DataRow label="React" value={cleanRange(BUILD.deps.react)} />
        <DataRow label="React Router" value={cleanRange(BUILD.deps['react-router'])} />
        <DataRow label="Cliente Supabase" value={cleanRange(BUILD.deps['@supabase/supabase-js'])} />
        <DataRow label="Vite" value={`${cleanRange(BUILD.deps.vite)} (compilación)`} />
      </dl>

      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">
        Servicios
      </h3>
      <dl className="divide-y divide-stone-100">
        <DataRow label="API y datos" value={apiHost()} />
        <DataRow label="PostgreSQL" value={platform?.postgres ?? 'Consultando…'} />
        <DataRow
          label="Esquema"
          value={
            platform
              ? `${platform.schema_version ?? 'sin registro'} · ${platform.migrations} migraciones`
              : 'Consultando…'
          }
        />
        {/* Named, not versioned: the masters' provider is decided by the Edge
            function's configuration (B2 in production, MinIO in local) and the
            client legitimately does not know which one answered. */}
        <DataRow label="Másters de archivo" value="S3 externo vía función sign-file" />
      </dl>
    </section>
  )
}

/**
 * What cannot be done yet, and where what is not here gets done.
 *
 * ── WHY IT IS HERE AND NOT IN AN ARTWORK'S RECORD ───────────
 *
 * It was in the record, and **it aged badly four times**: it was a list of shortcomings
 * written from memory, and every time one of them was built the card kept saying
 * it could not be done. It named the five documentary blocks when they were already right above;
 * it said the vocabularies had no screen when the series have always had one;
 * that an exhibition could not be created, that a reference could not be corrected,
 * that a document could not be uploaded; and that linking it to an exhibition was not done
 * from any screen. All of that is done.
 *
 * The problem was not the text, it was the place: half a screen of warnings at the foot of the
 * most used record, read a hundred times a day by somebody who already knows what they say. Here they are
 * consulted when they are looked for, which is once, and they are four lines.
 */
function WhatIsMissing() {
  return (
    <section className="card mb-3">
      <h2 className="mb-2 font-medium">Lo que todavía no se puede hacer</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li>
          Dar de alta una <strong>referencia bibliográfica</strong> sin citarla desde una obra:
          una referencia nace citada.
        </li>
        <li>
          Subir, corregir o digitalizar un <strong>documento del archivo</strong> desde otro sitio
          que no sea la documentación de una obra enlazada.
        </li>
      </ul>

      <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">
        Y lo que sí se hace, pero en otra pantalla
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li>
          <Link to="/bibliography" className="underline">
            La bibliografía
          </Link>{' '}
          y{' '}
          <Link to="/archive" className="underline">
            el archivo
          </Link>{' '}
          tienen listado y ficha propios, con lo que cuelga de cada uno — también los que
          ninguna obra tiene enlazados.
        </li>
        <li>
          Enlazar un documento con una <strong>exposición</strong> —el cartel o el díptico de una
          muestra— se hace en la ficha del documento.
        </li>
        <li>
          Decir cuál de las referencias es el <strong>catálogo</strong> de una muestra, en la ficha
          de la exposición, donde también se da de alta y se corrige.
        </li>
        <li>
          Las series, las sedes, los tipos y las personas e instituciones viven en{' '}
          <Link to="/tables" className="underline">
            Tablas
          </Link>
          . Renombrar algo ahí lo ven todas las obras que lo usan.
        </li>
      </ul>
    </section>
  )
}

/**
 * About the application: which version runs, what it brought and what is missing (RF-1202).
 *
 * The three things that used to be scattered —the version diagnostics in the profile, the
 * list of shortcomings at the foot of every artwork record, and the change log only in the
 * repository— put where they are going to be looked for: a screen opened when the
 * question comes up, instead of three texts read unintentionally every day.
 */
export function AboutPage() {
  return (
    <Layout title="Sobre la aplicación" back="/profile">
      <ChangelogSection />
      <WhatIsMissing />
      <Diagnostics />
    </Layout>
  )
}
