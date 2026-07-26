import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { derivarFechaOrden, mostrarFecha } from '../../lib/fechas'
import { avisoExistencia, avisoTituloAtribuido, mostrarMedidas, mostrarTitulo } from '../../lib/titulo'
import {
  ETIQUETA_ARTISTA,
  ETIQUETA_CONSERVACION,
  ETIQUETA_EXISTENCIA,
  ETIQUETA_TITULO_ATRIBUIDO,
  ETIQUETA_TRI_ESTADO,
  type Obra,
} from '../../lib/tipos'
import { useObra } from './useObras'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-32 shrink-0 text-sm text-stone-500">{etiqueta}</dt>
      {/* Nunca un hueco vacío (RF-304): si no hay dato, se dice. */}
      <dd className="text-sm">{valor.trim() === '' ? <span className="text-stone-400">Sin dato</span> : valor}</dd>
    </div>
  )
}

export function ObraPage() {
  const { id } = useParams<{ id: string }>()
  const { obra, cargando, error, recargar } = useObra(id)
  const { puedeEditar } = useAuth()
  const [editando, setEditando] = useState(false)

  if (cargando) {
    return (
      <Layout miga={id}>
        <p className="text-sm text-stone-600">Cargando…</p>
      </Layout>
    )
  }

  if (error || !obra) {
    return (
      <Layout miga={id}>
        <div className="tarjeta text-sm">
          <p className="font-medium">No se ha encontrado la ficha {id}.</p>
          <p className="mt-1 text-stone-600">
            Puede que esté dada de baja, o que no tengas permiso para verla.
          </p>
          <Link to="/" className="boton-secundario mt-4">
            Volver al listado
          </Link>
        </div>
      </Layout>
    )
  }

  if (editando) {
    return (
      <Layout miga={obra.id_catalogacion}>
        <FormularioEdicion
          obra={obra}
          alTerminar={async () => {
            await recargar()
            setEditando(false)
          }}
          alCancelar={() => setEditando(false)}
        />
      </Layout>
    )
  }

  const avisoTitulo = avisoTituloAtribuido(obra.titulo_atribuido)
  const avisoEstado = avisoExistencia(obra)

  return (
    <Layout miga={obra.id_catalogacion}>
      <header className="mb-4">
        <p className="font-mono text-sm text-stone-500">{obra.id_catalogacion}</p>
        <h1 className="text-xl font-semibold">{mostrarTitulo(obra.titulo)}</h1>
        <p className="text-sm text-stone-600">
          {ETIQUETA_ARTISTA[obra.artista]} · {mostrarFecha(obra.fecha_ejecucion)}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Insignia
            activa={obra.fase_inventario_completada}
            texto={obra.fase_inventario_completada ? 'Fase 1 completa' : 'Fase 1 en curso'}
          />
          <Insignia
            activa={obra.fase_documentacion_completada}
            texto={obra.fase_documentacion_completada ? 'Fase 2 completa' : 'Fase 2 en curso'}
          />
          {/* RF-306 y RF-307: los avisos que cambian cómo se lee la ficha van
              arriba, no enterrados entre los datos. */}
          {avisoEstado && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              {avisoEstado}
            </span>
          )}
          {avisoTitulo && (
            <span className="rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
              {avisoTitulo}
            </span>
          )}
        </div>

        {puedeEditar && (
          <button onClick={() => setEditando(true)} className="boton-primario mt-3">
            Editar
          </button>
        )}
      </header>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Identificación</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Tipo" valor={obra.tipo_obra} />
          <Dato etiqueta="Técnica" valor={obra.tecnica} />
          <Dato etiqueta="Soporte" valor={obra.soporte} />
          <Dato etiqueta="Medidas" valor={mostrarMedidas(obra)} />
          <Dato
            etiqueta="Firmada"
            valor={
              obra.firmada === 'SI' && obra.firma_descripcion
                ? `Sí, ${obra.firma_descripcion}`
                : ETIQUETA_TRI_ESTADO[obra.firmada]
            }
          />
          <Dato etiqueta="Fecha en la obra" valor={ETIQUETA_TRI_ESTADO[obra.fechada_en_obra]} />
          <Dato etiqueta="Título" valor={ETIQUETA_TITULO_ATRIBUIDO[obra.titulo_atribuido]} />
        </dl>
      </section>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Conservación y localización</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Conservación" valor={ETIQUETA_CONSERVACION[obra.estado_conservacion]} />
          <Dato etiqueta="Existencia" valor={ETIQUETA_EXISTENCIA[obra.estado_existencia]} />
          <Dato etiqueta="Ubicación" valor={obra.ubicacion_fisica} />
        </dl>
      </section>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Estado del proceso</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Medidas verificadas" valor={obra.medidas_verificadas ? 'Sí' : 'No'} />
          <Dato
            etiqueta="Ficha publicable"
            valor={obra.ficha_catalografica_completa ? 'Sí' : 'No'}
          />
          <Dato etiqueta="Notas" valor={obra.notas_proceso_inventario} />
          <Dato
            etiqueta="Actualizada"
            valor={new Date(obra.fecha_actualizacion).toLocaleString('es-ES')}
          />
          <Dato
            etiqueta="Toma de datos"
            valor={
              obra.fecha_actualizacion_basica
                ? new Date(obra.fecha_actualizacion_basica).toLocaleString('es-ES')
                : ''
            }
          />
        </dl>
      </section>

      {/* Los bloques que el esquema define pero esta entrega no cubre se declaran
          en vez de omitirse: así se ve qué falta y no parece que la ficha esté
          completa. */}
      <section className="tarjeta text-sm text-stone-500">
        <p className="font-medium text-stone-700">Pendiente en esta entrega</p>
        <p className="mt-1">
          Imágenes, procedencia, historial expositivo, bibliografía, documentación relacionada,
          series y obras relacionadas. Ver el orden de construcción en la documentación.
        </p>
      </section>
    </Layout>
  )
}

function Insignia({ activa, texto }: { activa: boolean; texto: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        activa ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'
      }`}
    >
      {texto}
    </span>
  )
}

function FormularioEdicion({
  obra,
  alTerminar,
  alCancelar,
}: {
  obra: Obra
  alTerminar: () => Promise<void>
  alCancelar: () => void
}) {
  const [datos, setDatos] = useState(obra)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Obra>(campo: K, valor: Obra[K]) {
    setDatos((d) => ({ ...d, [campo]: valor }))
  }

  const aNumero = (v: string) => {
    const limpio = v.replace(',', '.').trim()
    if (limpio === '') return null
    const n = Number(limpio)
    return Number.isFinite(n) ? n : null
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    // id_catalogacion y artista no se envían: son inmutables (RF-204) y un
    // trigger de la base rechaza el cambio. No mandarlos evita provocar el error.
    const { error } = await supabase
      .from('obras')
      .update({
        titulo: datos.titulo.trim(),
        titulo_atribuido: datos.titulo_atribuido,
        tipo_obra: datos.tipo_obra.trim(),
        fecha_ejecucion: datos.fecha_ejecucion.trim(),
        fecha_orden: derivarFechaOrden(datos.fecha_ejecucion),
        tecnica: datos.tecnica.trim(),
        soporte: datos.soporte.trim(),
        alto_cm: datos.alto_cm,
        ancho_cm: datos.ancho_cm,
        profundidad_cm: datos.profundidad_cm,
        firmada: datos.firmada,
        firma_descripcion: datos.firma_descripcion.trim(),
        fechada_en_obra: datos.fechada_en_obra,
        estado_conservacion: datos.estado_conservacion,
        estado_existencia: datos.estado_existencia,
        ubicacion_fisica: datos.ubicacion_fisica.trim().toLowerCase(),
        medidas_verificadas: datos.medidas_verificadas,
        fase_inventario_completada: datos.fase_inventario_completada,
        fase_documentacion_completada: datos.fase_documentacion_completada,
        ficha_catalografica_completa: datos.ficha_catalografica_completa,
        notas_proceso_inventario: datos.notas_proceso_inventario,
      })
      .eq('id_catalogacion', obra.id_catalogacion)

    if (error) {
      setError(error.message)
      setGuardando(false)
      return
    }
    await alTerminar()
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      {/* RF-308: toda la ficha entra en edición a la vez, cabecera incluida.
          La clave primaria se muestra de solo lectura (RF-204). */}
      <div className="tarjeta space-y-3">
        <div>
          <label className="etiqueta">Código de catalogación</label>
          <input className="campo bg-stone-100 text-stone-500" value={obra.id_catalogacion} readOnly />
          <p className="mt-1 text-xs text-stone-500">
            No es editable: es la etiqueta pegada en la obra y el eje de las tablas relacionadas.
          </p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-titulo">
            Título
          </label>
          <input
            id="e-titulo"
            className="campo"
            value={datos.titulo}
            onChange={(e) => set('titulo', e.target.value)}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-atribuido">
            ¿El título es del artista?
          </label>
          <select
            id="e-atribuido"
            className="campo"
            value={datos.titulo_atribuido}
            onChange={(e) => set('titulo_atribuido', e.target.value as Obra['titulo_atribuido'])}
          >
            {Object.entries(ETIQUETA_TITULO_ATRIBUIDO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-tipo">
            Tipo de obra
          </label>
          <input
            id="e-tipo"
            className="campo"
            value={datos.tipo_obra}
            onChange={(e) => set('tipo_obra', e.target.value)}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-fecha">
            Fecha de ejecución
          </label>
          <input
            id="e-fecha"
            className="campo"
            value={datos.fecha_ejecucion}
            onChange={(e) => set('fecha_ejecucion', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="etiqueta" htmlFor="e-alto">
              Alto
            </label>
            <input
              id="e-alto"
              className="campo"
              inputMode="decimal"
              value={datos.alto_cm ?? ''}
              onChange={(e) => set('alto_cm', aNumero(e.target.value))}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="e-ancho">
              Ancho
            </label>
            <input
              id="e-ancho"
              className="campo"
              inputMode="decimal"
              value={datos.ancho_cm ?? ''}
              onChange={(e) => set('ancho_cm', aNumero(e.target.value))}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="e-prof">
              Prof.
            </label>
            <input
              id="e-prof"
              className="campo"
              inputMode="decimal"
              value={datos.profundidad_cm ?? ''}
              onChange={(e) => set('profundidad_cm', aNumero(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-tecnica">
            Técnica
          </label>
          <input
            id="e-tecnica"
            className="campo"
            value={datos.tecnica}
            onChange={(e) => set('tecnica', e.target.value)}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-soporte">
            Soporte
          </label>
          <input
            id="e-soporte"
            className="campo"
            value={datos.soporte}
            onChange={(e) => set('soporte', e.target.value)}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-firmada">
            Firmada
          </label>
          <select
            id="e-firmada"
            className="campo"
            value={datos.firmada}
            onChange={(e) => set('firmada', e.target.value as Obra['firmada'])}
          >
            {Object.entries(ETIQUETA_TRI_ESTADO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Solo tiene sentido describir la firma si hay firma. */}
        {datos.firmada === 'SI' && (
          <div>
            <label className="etiqueta" htmlFor="e-firma-desc">
              Descripción de la firma
            </label>
            <input
              id="e-firma-desc"
              className="campo"
              value={datos.firma_descripcion}
              onChange={(e) => set('firma_descripcion', e.target.value)}
              placeholder="ángulo inferior derecho, a lápiz"
            />
          </div>
        )}

        <div>
          <label className="etiqueta" htmlFor="e-fechada">
            Lleva fecha inscrita
          </label>
          <select
            id="e-fechada"
            className="campo"
            value={datos.fechada_en_obra}
            onChange={(e) => set('fechada_en_obra', e.target.value as Obra['fechada_en_obra'])}
          >
            {Object.entries(ETIQUETA_TRI_ESTADO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tarjeta space-y-3">
        <div>
          <label className="etiqueta" htmlFor="e-conservacion">
            Estado de conservación
          </label>
          <select
            id="e-conservacion"
            className="campo"
            value={datos.estado_conservacion}
            onChange={(e) =>
              set('estado_conservacion', e.target.value as Obra['estado_conservacion'])
            }
          >
            {Object.entries(ETIQUETA_CONSERVACION).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-existencia">
            Estado de existencia
          </label>
          <select
            id="e-existencia"
            className="campo"
            value={datos.estado_existencia}
            onChange={(e) => set('estado_existencia', e.target.value as Obra['estado_existencia'])}
          >
            {Object.entries(ETIQUETA_EXISTENCIA).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-ubicacion">
            Ubicación física
          </label>
          <input
            id="e-ubicacion"
            className="campo"
            autoCapitalize="none"
            value={datos.ubicacion_fisica}
            onChange={(e) => set('ubicacion_fisica', e.target.value)}
          />
        </div>
      </div>

      <div className="tarjeta space-y-2">
        <Casilla
          id="e-medidas-ver"
          etiqueta="Medidas verificadas físicamente"
          ayuda="Marcar solo si alguien del equipo las ha medido, no si vienen de un catálogo antiguo."
          valor={datos.medidas_verificadas}
          alCambiar={(v) => set('medidas_verificadas', v)}
        />
        <Casilla
          id="e-fase1"
          etiqueta="Fase 1 completada"
          valor={datos.fase_inventario_completada}
          alCambiar={(v) => set('fase_inventario_completada', v)}
        />
        <Casilla
          id="e-fase2"
          etiqueta="Fase 2 completada"
          valor={datos.fase_documentacion_completada}
          alCambiar={(v) => set('fase_documentacion_completada', v)}
        />
        <Casilla
          id="e-publicable"
          etiqueta="Ficha lista para publicar"
          ayuda="Revisión editorial final. No se deduce de las dos fases anteriores."
          valor={datos.ficha_catalografica_completa}
          alCambiar={(v) => set('ficha_catalografica_completa', v)}
        />

        <div className="pt-2">
          <label className="etiqueta" htmlFor="e-notas">
            Notas del proceso
          </label>
          <textarea
            id="e-notas"
            className="campo"
            rows={3}
            value={datos.notas_proceso_inventario}
            onChange={(e) => set('notas_proceso_inventario', e.target.value)}
            placeholder="pendiente contactar con la familia para confirmar medidas"
          />
          <p className="mt-1 text-xs text-stone-500">
            Uso interno del equipo. No se publica en el catálogo.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No se ha podido guardar: {error}
        </p>
      )}

      <div className="flex gap-2 pb-4">
        <button className="boton-primario flex-1" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton-secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Casilla({
  id,
  etiqueta,
  ayuda,
  valor,
  alCambiar,
}: {
  id: string
  etiqueta: string
  ayuda?: string
  valor: boolean
  alCambiar: (v: boolean) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-toque items-center gap-3">
        <input
          id={id}
          type="checkbox"
          className="h-5 w-5 rounded border-stone-300"
          checked={valor}
          onChange={(e) => alCambiar(e.target.checked)}
        />
        <span className="text-sm">{etiqueta}</span>
      </label>
      {ayuda && <p className="ml-8 text-xs text-stone-500">{ayuda}</p>}
    </div>
  )
}
