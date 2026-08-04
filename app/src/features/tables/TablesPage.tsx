import { Link, Navigate } from 'react-router'
import { useEditingAccess } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ChevronRightIcon, LoadingNotice } from '../../components/ui'

/**
 * The «Tablas» section: maintenance of the master tables (RF-1106).
 *
 * They are the lists the records choose from, and they need somewhere that is not
 * inside a record's form. Two reasons, and the first is the one that matters:
 * **maintaining a list is not cataloging an artwork.** Renaming a shelf, or
 * retiring a type nobody uses, is a job done once for the whole catalog, and
 * burying it inside the form of whatever artwork happened to be open makes it look
 * like an edit of that artwork.
 *
 * The second is that some of it does not fit in a form at all: moving a place with
 * everything inside it has no field to live in.
 *
 * An index and not one long page, because these are separate jobs done at separate
 * times, and a phone screen shows one of them at a time anyway.
 *
 * ── WHY THE LISTS ARE GROUPED ────────────────────────────────
 *
 * There were three of these and now there are nine, and nine links one under
 * another is a wall: to find «Sedes de exposición» you read eight names that all
 * begin with «Tipos de» or end in «s». So they are grouped by WHAT THEY ARE FOR,
 * which is also how they get looked for — the record's own fields, then who and
 * where, then the papers — and each group says in one line what it holds. Three
 * groups of three, so a thumb reaches the last one without a second scroll on a
 * phone, and so a fourth master arriving has an obvious place to go.
 *
 * The grouping is deliberately NOT alphabetical and NOT «the ones that existed
 * first»: alphabetical puts «Sedes de exposición» between «Series» and «Tipos de
 * obra», which is the arrangement that made the wall.
 *
 * Cataloger only (RF-1106), which is also why the tab is not painted for a
 * Reader — but the check is here too: a hidden button is not a protection.
 */
export function TablesPage() {
  const access = useEditingAccess()
  // La espera importa: el rol llega después de la sesión, así que decidir en el
  // primer render echaría a quien sí puede. Ver useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') return <Navigate to="/" replace />

  return (
    <Layout title="Tablas">
      <p className="mb-4 text-sm text-stone-600">
        Las listas de las que eligen las fichas. Lo que se cambia aquí lo ven todas las obras a la
        vez: renombrar una entrada se hace una sola vez, no obra por obra, y nada se borra —lo que
        deja de usarse se retira y se puede recuperar.
      </p>

      <TableGroup
        name="La ficha de la obra"
        hint="Lo que ofrecen sus campos y lo que cuentan las relaciones entre dos obras."
      >
        <TableRow
          to="/artwork-types"
          name="Tipos de obra"
          hint="Lo que ofrece el campo «Tipo de obra». Crear, renombrar y retirar."
        />
        <TableRow
          to="/series"
          name="Series"
          hint="Las series de cada fondo. Crear, renombrar y retirar."
        />
        <TableRow
          to="/relationship-types"
          name="Tipos de relación"
          hint="De qué clase es el parentesco entre dos obras, con sus dos lecturas. Crear, cambiar las lecturas y retirar."
        />
      </TableGroup>

      <TableGroup
        name="Dónde y quién"
        hint="Los sitios del almacén, los sitios donde se expuso, y las personas e instituciones por las que ha pasado cada obra."
      >
        <TableRow
          to="/places"
          name="Ubicaciones"
          hint="Los sitios donde están las obras, unos dentro de otros. Crear, renombrar, mover y retirar."
        />
        <TableRow
          to="/exhibition-venues"
          name="Sedes de exposición"
          hint="Los sitios donde ocurrieron las muestras, con su localidad. No son las del almacén. Crear, corregir y retirar."
        />
        <TableRow
          to="/parties"
          name="Personas e instituciones"
          hint="Quién ha tenido cada obra, quién presta y qué institución hay detrás de una sede. Crear, corregir, ver el contacto y retirar."
        />
      </TableGroup>

      <TableGroup
        name="Los papeles"
        hint="Cómo se ordena el archivo y cómo se citan las publicaciones."
      >
        <TableRow
          to="/archive-series"
          name="Clasificación del archivo"
          hint="Los fondos, series y subseries en los que se ordenan los papeles. Crear, renombrar, mover y retirar."
        />
        <TableRow
          to="/document-types"
          name="Tipos de documento"
          hint="Lo que ofrece el campo «Tipo» de un documento del archivo. Crear, renombrar y retirar."
        />
        <TableRow
          to="/publication-types"
          name="Tipos de publicación"
          hint="Lo que ofrece el campo «Tipo» de cada referencia de la bibliografía. Crear, renombrar y retirar."
        />
      </TableGroup>

      {/* Never a blank space, and never a link that does nothing: what is not here
          yet is said, so that it is not looked for. */}
      <p className="mt-4 text-sm text-stone-600">
        Los fondos —Rotili, Ruiz Campins y el de pruebas— no se mantienen aquí: su nombre está
        dentro del identificador de catalogación de cada obra, la etiqueta pegada al cuadro, y
        tocarlos es otra decisión.
      </p>
    </Layout>
  )
}

/**
 * One group of the index: its name, what it is for, and its lists.
 *
 * The group's own line is not decoration. «Tipos de documento» and «Tipos de
 * publicación» are two names that differ in one word, and what tells them apart is
 * which of the two jobs they belong to — the archive of papers or the bibliography
 * of an artwork. Said once above the three, it does not have to be repeated in
 * each hint.
 */
function TableGroup({
  name,
  hint,
  children,
}: {
  name: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-stone-500">{name}</h2>
      <p className="mb-2 px-1 text-xs text-stone-500">{hint}</p>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function TableRow({ to, name, hint }: { to: string; name: string; hint: string }) {
  return (
    <li>
      <Link
        to={to}
        className="card flex min-h-touch items-center justify-between gap-3 active:bg-stone-100"
      >
        <span className="min-w-0">
          <span className="block font-medium">{name}</span>
          <span className="block text-sm text-stone-600">{hint}</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-stone-400" />
      </Link>
    </li>
  )
}
