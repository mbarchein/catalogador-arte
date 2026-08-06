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
 * Qué versión está corriendo, en los dos lados.
 *
 * Existe porque «en local funciona y en producción no» se contesta comparando estas
 * líneas, sin abrir ningún panel de administración. Estaba en el perfil y se ha traído
 * aquí: es información de la APLICACIÓN, y el perfil es de la cuenta.
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
 * Lo que todavía no se puede hacer, y dónde se hace lo que no es aquí.
 *
 * ── POR QUÉ ESTÁ AQUÍ Y NO EN LA FICHA DE UNA OBRA ──────────
 *
 * Estuvo en la ficha, y **envejeció mal cuatro veces**: era una lista de carencias
 * escrita de memoria, y cada vez que se construía una de ellas la tarjeta seguía diciendo
 * que no se podía. Nombró los cinco bloques documentales cuando ya estaban justo encima;
 * dijo que los vocabularios no tenían pantalla cuando las series la han tenido siempre;
 * que una exposición no se podía dar de alta, que una referencia no se podía corregir,
 * que un documento no se podía subir; y que enlazarlo con una exposición no se hacía
 * desde ninguna pantalla. Todo eso se hace.
 *
 * El problema no era el texto, era el sitio: media pantalla de advertencias al pie de la
 * ficha que más se usa, leídas cien veces al día por quien ya sabe lo que dicen. Aquí se
 * consultan cuando se buscan, que es una vez, y son cuatro líneas.
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
 * Sobre la aplicación: qué versión corre, qué trajo y qué falta (RF-1202).
 *
 * Las tres cosas que antes estaban repartidas —el diagnóstico de versión en el perfil, la
 * lista de carencias al pie de cada ficha de obra, y el registro de cambios solo en el
 * repositorio— puestas donde se van a buscar: una pantalla que se abre cuando surge la
 * pregunta, en vez de tres textos que se leen sin querer todos los días.
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
