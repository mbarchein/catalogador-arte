import { Link, Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ChevronRightIcon } from '../../components/ui'

/**
 * The «Tablas» section: maintenance of the master tables (RF-1106).
 *
 * They are the lists the records choose from — places, artwork types, series —
 * and they need somewhere that is not inside a record's form. Two reasons, and
 * the first is the one that matters: **maintaining a list is not cataloging an
 * artwork.** Renaming a shelf, or retiring a type nobody uses, is a job done once
 * for the whole catalog, and burying it inside the form of whatever artwork
 * happened to be open makes it look like an edit of that artwork.
 *
 * The second is that some of it does not fit in a form at all: moving a place
 * with everything inside it has no field to live in.
 *
 * An index and not one long page, because these are separate jobs done at
 * separate times, and a phone screen shows one of them at a time anyway.
 *
 * Cataloger only (RF-1106), which is also why the tab is not painted for a
 * Reader — but the check is here too: a hidden button is not a protection.
 */
export function TablesPage() {
  const { canEdit, roleKnown } = useAuth()
  // Hasta que el perfil llega, el rol no es «no»: es que todavía no se sabe. Sin
  // esta espera, entrar por la pestaña con la aplicación recién abierta rebotaba
  // al listado, porque `canEdit` arranca en falso. Lo que protege de verdad son
  // las políticas RLS; esto solo evita echar a quien sí puede.
  if (!roleKnown) {
    return <div className="p-8 text-center text-sm text-stone-600">Cargando…</div>
  }
  if (!canEdit) return <Navigate to="/" replace />

  return (
    <Layout title="Tablas">
      <p className="mb-3 text-sm text-stone-600">
        Las listas de las que eligen las fichas. Lo que se cambia aquí lo ven todas las obras a
        la vez.
      </p>

      <ul className="space-y-2">
        <TableRow
          to="/places"
          name="Ubicaciones"
          hint="Los sitios donde están las obras, unos dentro de otros. Crear, renombrar, mover y retirar."
        />
      </ul>

      {/* Never a blank space, and never a link that does nothing: what is not here
          yet is said, with where it is meanwhile. */}
      <p className="mt-4 text-sm text-stone-600">
        Los tipos de obra y las series se siguen añadiendo desde el propio formulario de la
        ficha, que es donde hacen falta. Traerlos aquí —para renombrarlos y retirarlos— está
        pendiente.
      </p>
    </Layout>
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
