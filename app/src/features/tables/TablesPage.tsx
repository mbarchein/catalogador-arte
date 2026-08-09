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
 *
 * Al final, y fuera de los tres grupos, la puerta de la papelera (RF-901): no es
 * una maestra y no se disfraza de una, pero es mantenimiento del catálogo y este es
 * el único índice del Catalogador. El razonamiento completo está junto a ella.
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
        Las listas de las que eligen las fichas. Un cambio aquí lo ven todas las obras a la vez.
      </p>

      <TableGroup
        name="La ficha de la obra"
        hint="Lo que ofrecen sus campos y lo que cuentan sus relaciones."
      >
        <TableRow
          to="/artist-funds"
          name="Fondos"
          hint="Renombrar, retirar y apartar sus obras del listado."
        />
        <TableRow
          to="/artwork-types"
          name="Tipos de obra"
          hint="Lo que ofrece el campo «Tipo de obra» de la ficha."
        />
        <TableRow
          to="/series"
          name="Series"
          hint="Las series de cada fondo."
        />
        <TableRow
          to="/relationship-types"
          name="Tipos de relación"
          hint="El parentesco entre dos obras, con sus dos lecturas."
        />
      </TableGroup>

      <TableGroup
        name="Dónde y quién"
        hint="Dónde está cada obra, dónde se expuso y por quién ha pasado."
      >
        <TableRow
          to="/places"
          name="Ubicaciones"
          hint="Los sitios del almacén, unos dentro de otros."
        />
        <TableRow
          to="/exhibition-venues"
          name="Sedes de exposición"
          hint="Dónde ocurrieron las muestras, con su localidad."
        />
        <TableRow
          to="/parties"
          name="Personas e instituciones"
          hint="Quién ha tenido cada obra, quién presta y quién hay detrás de una sede."
        />
      </TableGroup>

      <TableGroup
        name="Los papeles"
        hint="Cómo se ordena el archivo y cómo se citan las publicaciones."
      >
        <TableRow
          to="/archive-series"
          name="Clasificación del archivo"
          hint="Los fondos, series y subseries de los papeles."
        />
        <TableRow
          to="/document-types"
          name="Tipos de documento"
          hint="Lo que ofrece el campo «Tipo» de un documento."
        />
        <TableRow
          to="/publication-types"
          name="Tipos de publicación"
          hint="Lo que ofrece el campo «Tipo» de una referencia."
        />
      </TableGroup>

      {/* ── LA PAPELERA, Y POR QUÉ ESTÁ AQUÍ SIN SER UNA MAESTRA ──────
          Dentro de la papelera hay obras, fotografías y fichas, no solo listas: no
          es una de las nueve, así que va FUERA de los tres grupos, con su propio
          título y su propia frase. Ponerla como una fila más entre «Series» y
          «Tipos de obra» habría dicho que es una lista de la que eligen las
          fichas, y no lo es.

          Y está en esta pantalla porque es el único índice del Catalogador que
          existe, porque es donde ya se viene a hacer mantenimiento —de aquí sale
          además el «Volver» de la papelera— y porque una sexta pestaña en el menú
          de abajo estrecharía las cinco de todos los días por algo que se abre
          unas pocas veces al año. Solo Catalogador, y no por esconderla: tres
          maestras dejan ver sus filas retiradas a quien solo consulta, pero
          recuperar cualquier cosa exige permiso de edición, así que para un lector
          sería una lista incompleta con un botón que la base rechaza. La propia
          pantalla lo vuelve a comprobar. */}
      {/* La bibliografía del catálogo, que TAMPOCO es una lista de las que eligen
          las fichas: es contenido, como las exposiciones. Está aquí por lo mismo
          que la papelera —una sexta pestaña estrecharía las cinco de todos los días
          por algo que se abre de vez en cuando— y NO es solo del Catalogador: la
          lee cualquiera que pueda leer, y a esta pantalla llega solo quien edita, así
          que hay además una puerta desde la ficha de cualquier obra. */}
      <section className="mt-6">
        <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-stone-500">
          Contenido del catálogo
        </h2>
        <ul className="space-y-2">
          <TableRow
            to="/bibliography"
            name="Bibliografía"
            hint="Todas las referencias del catálogo, también las que ya no cita ninguna obra."
          />
          <TableRow
            to="/archive"
            name="Archivo"
            hint="Cartas, recortes, carteles y expedientes, y cuántos quedan sin digitalizar."
          />
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="px-1 text-sm font-medium uppercase tracking-wide text-stone-500">
          Lo retirado
        </h2>
        <p className="mb-2 px-1 text-xs text-stone-500">
          Todo lo que se ha sacado del catálogo, reunido en un sitio.
        </p>
        <ul className="space-y-2">
          <TableRow
            to="/trash"
            name="Papelera"
            hint="Todo lo retirado se puede devolver a su sitio."
          />
        </ul>
      </section>
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
