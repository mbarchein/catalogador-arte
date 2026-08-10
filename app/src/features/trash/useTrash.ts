import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { TRASH_KINDS, type TrashKindId, type TrashRow } from './trashKinds'
import { toTrashItems, type TrashAuthor, type TrashItem, type TrashKindView } from './trashItems'
import { describeLoadFailure, describeRestoreRefusal, type DatabaseRefusal } from './trashRestore'

/**
 * Cuántas filas se piden de cada clase.
 *
 * La papelera es pequeña por naturaleza: es lo que una persona ha retirado a mano a
 * lo largo de años, y hoy en toda la base son cinco filas. Cincuenta por clase deja
 * sitio de sobra y pone un techo, que es lo que impide que una tabla que alguien vacíe
 * por error convierta esta pantalla en una descarga de miles de líneas desde el móvil.
 */
export const TRASH_PAGE = 50

export interface TrashState {
  readonly views: readonly TrashKindView[]
  readonly loading: boolean
  readonly reload: () => void
  /**
   * Recupera una cosa. Devuelve la frase del fallo, o `null` si ha vuelto.
   *
   * Es la convención de las pantallas de mantenimiento de este proyecto: la acción
   * contesta texto en español o nada, y quien la llama no interpreta códigos.
   */
  readonly restore: (item: TrashItem) => Promise<string | null>
}

/**
 * Todo lo retirado, de las veintiuna tablas que llevan baja lógica.
 *
 * ── POR QUÉ VEINTIUNA CONSULTAS EN PARALELO ──────────────────────
 *
 * PostgREST no une tablas, así que no hay una consulta que traiga la papelera
 * entera. Las alternativas eran pedir primero veintiún recuentos y luego las filas
 * —pagar dos veces por lo mismo— o cargar cada grupo al abrirlo, que deja a la
 * usuaria abriendo cuatro bloques para descubrir que la papelera está vacía. Se
 * cargan las veintiuna de una vez, en paralelo y con techo por clase: son peticiones
 * diminutas sobre tablas diminutas, se multiplexan sobre la misma conexión, y esta es
 * una pantalla que se abre de tarde en tarde y no la que más se usa.
 *
 * ── QUE UNA FALLE NO PUEDE APAGAR LAS OTRAS ──────────────────────
 *
 * Cada clase guarda su propio fallo. Una tabla que no se pueda leer deja su línea
 * explicada y las demás siguen en pie: **nunca una página en blanco**, y menos por
 * una de veintiuna.
 *
 * ── QUIÉN LA VE ──────────────────────────────────────────────────
 *
 * No lo decide este código, lo deciden las políticas: dieciocho de las veintiuna
 * tablas tienen `(active and can_read()) or can_edit()`, así que quien solo consulta
 * recibe listas vacías. Aun así la pantalla entera está cerrada a quien no cataloga
 * —una lista vacía no es una explicación—, y eso se hace en `TrashPage`.
 */
export function useTrash(): TrashState {
  const [views, setViews] = useState<readonly TrashKindView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // One read per class, all at once. ONE row more than is shown is asked
    // for: it is how having more is known without paying for an exact count.
    const answers = await Promise.all(
      TRASH_KINDS.map(async (spec) => {
        try {
          const { data, error } = await supabase
            .from(spec.table)
            .select(spec.columns)
            .eq('active', false)
            // Lo último retirado primero, que es lo que se viene a buscar. Las filas
            // sin fecha —las que trasladó una migración y no retiró nadie— al final:
            // Postgres las pondría delante en un orden descendente, y encabezar la
            // papelera con lo que no tiene traza es enterrar lo que sí la tiene.
            .order('deactivated_at', { ascending: false, nullsFirst: false })
            .limit(TRASH_PAGE + 1)
          if (error) return { spec, rows: [] as TrashRow[], failure: error as DatabaseRefusal }
          return { spec, rows: (data ?? []) as unknown as TrashRow[], failure: null }
        } catch (thrown) {
          // Envuelto porque una lectura que lanza en vez de contestar dejaría
          // `loading` en verdadero para siempre, y una pantalla atascada en
          // «cargando» sin explicación es la página en blanco que este proyecto no
          // hace.
          return { spec, rows: [] as TrashRow[], failure: { message: String(thrown) } }
        }
      }),
    )

    // The names are resolved in ONE query narrowed to the people who really
    // appear, as in the change history: they are a few and not the whole team.
    const ids = [
      ...new Set(
        answers.flatMap((answer) =>
          answer.rows
            .map((row) => row['deactivated_by'])
            .filter((value): value is string => typeof value === 'string' && value !== ''),
        ),
      ),
    ]
    let authors = new Map<string, TrashAuthor>()
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('id, name, email').in('id', ids)
      // If this query fails, the wastebasket is shown all the same without names: losing the
      // names is far less bad than not being able to recover anything.
      authors = new Map(
        ((data ?? []) as { id: string; name: string | null; email: string | null }[]).map((p) => [
          p.id,
          { name: p.name, email: p.email },
        ]),
      )
    }

    setViews(
      answers.map(({ spec, rows, failure }) => ({
        spec,
        items: toTrashItems(spec, rows.slice(0, TRASH_PAGE), authors),
        truncated: rows.length > TRASH_PAGE,
        error: failure === null ? null : describeLoadFailure(spec.id, failure),
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Devuelve una cosa a la vida.
   *
   * Tres cosas que no son adorno:
   *
   *  1. **El bloqueo se comprueba antes de escribir.** Medido: la base acepta
   *     restaurar algo cuyo padre sigue retirado, y la fila vuelve invisible. El
   *     motivo ya está calculado en el elemento; aquí solo se respeta.
   *
   *  2. **`select(...)` no es adorno.** Un `update` que las políticas rechazan
   *     contesta 200 con la lista vacía y SIN error. Sin pedir las filas afectadas,
   *     esta función diría que ha ido bien.
   *
   *  3. **Nunca rechaza.** Quien la llama limpia su bandera de «ocupado» después del
   *     `await`; una promesa rechazada se saltaría esa línea y dejaría la pantalla con
   *     todos los botones apagados hasta recargar.
   *
   * Y al terminar se recarga TODO, no solo la clase tocada: recuperar una obra
   * desbloquea sus fotografías y sus eslabones, y son otras clases las que tienen que
   * dejar de decir «todavía no». Es la lectura entera otra vez, que aquí son unas
   * pocas filas.
   */
  const restore = useCallback(
    async (item: TrashItem): Promise<string | null> => {
      if (item.blocked !== null) return item.blocked
      const spec = TRASH_KINDS.find((kind) => kind.id === item.kind)
      if (spec === undefined) return describeRestoreRefusal(item.kind, null)
      try {
        const { data, error } = await supabase
          .from(spec.table)
          .update({ active: true })
          .eq(spec.key, item.key)
          .select(spec.key)
        if (error) return describeRestoreRefusal(item.kind, error as DatabaseRefusal)
        if ((data ?? []).length === 0) return describeRestoreRefusal(item.kind, null)
      } catch (thrown) {
        return describeRestoreRefusal(item.kind, { message: String(thrown) })
      }
      await load()
      return null
    },
    [load],
  )

  return { views, loading, reload: () => void load(), restore }
}

/** The class identifiers, for the checks that go through them. */
export type { TrashKindId }
