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
import {
  ANIO_MINIMO,
  ajustarAnio,
  anioMaximo,
  componerFecha,
  descomponerFecha,
  type FechaEstructurada,
} from '../../lib/fechaEstructurada'
import { Fichas, Interruptor, PasoAnio, TriEstadoIconos } from '../../components/ui'
import { normalizarUbicacion, ubicacionParaGuardar } from '../../lib/ubicacion'
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
        ubicacion_fisica: ubicacionParaGuardar(datos.ubicacion_fisica),
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

        <Fichas
          id="e-atribuido"
          etiqueta="¿El título es del artista?"
          opciones={Object.entries(ETIQUETA_TITULO_ATRIBUIDO).map(([v, t]) => ({
            valor: v as Obra['titulo_atribuido'],
            texto: t,
          }))}
          valor={datos.titulo_atribuido}
          alCambiar={(v) => set('titulo_atribuido', v)}
        />

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

        <CampoFecha
          texto={datos.fecha_ejecucion}
          alCambiar={(v) => set('fecha_ejecucion', v)}
        />

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

        <TriEstadoIconos
          id="e-firmada"
          etiqueta="Firmada"
          valor={datos.firmada}
          alCambiar={(v) => set('firmada', v)}
        />

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

        <TriEstadoIconos
          id="e-fechada"
          etiqueta="Lleva fecha inscrita"
          valor={datos.fechada_en_obra}
          alCambiar={(v) => set('fechada_en_obra', v)}
        />
      </div>

      <div className="tarjeta space-y-4">
        <Fichas
          id="e-conservacion"
          etiqueta="Estado de conservación"
          opciones={Object.entries(ETIQUETA_CONSERVACION).map(([v, t]) => ({
            valor: v as Obra['estado_conservacion'],
            texto: t,
          }))}
          valor={datos.estado_conservacion}
          alCambiar={(v) => set('estado_conservacion', v)}
        />

        <Fichas
          id="e-existencia"
          etiqueta="Estado de existencia"
          opciones={Object.entries(ETIQUETA_EXISTENCIA).map(([v, t]) => ({
            valor: v as Obra['estado_existencia'],
            texto: t,
          }))}
          valor={datos.estado_existencia}
          alCambiar={(v) => set('estado_existencia', v)}
        />

        <div>
          <label className="etiqueta" htmlFor="e-ubicacion">
            Ubicación física
          </label>
          <input
            id="e-ubicacion"
            className="campo"
            autoCapitalize="none"
            value={datos.ubicacion_fisica}
            onChange={(e) => set('ubicacion_fisica', normalizarUbicacion(e.target.value))}
          />
        </div>
      </div>

      <div className="tarjeta space-y-2">
        <Interruptor
          etiqueta="Medidas verificadas físicamente"
          ayuda="Solo si alguien del equipo las ha medido, no si vienen de un catálogo antiguo."
          activo={datos.medidas_verificadas}
          alCambiar={(v) => set('medidas_verificadas', v)}
        />
        <Interruptor
          etiqueta="Fase 1 completada"
          ayuda="Toma de datos con la obra delante."
          activo={datos.fase_inventario_completada}
          alCambiar={(v) => set('fase_inventario_completada', v)}
        />
        <Interruptor
          etiqueta="Fase 2 completada"
          ayuda="Documentación e investigación."
          activo={datos.fase_documentacion_completada}
          alCambiar={(v) => set('fase_documentacion_completada', v)}
        />
        <Interruptor
          etiqueta="Ficha lista para publicar"
          ayuda="Revisión editorial final. No se deduce de las dos fases anteriores."
          activo={datos.ficha_catalografica_completa}
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

/**
 * Fecha de ejecución con controles táctiles, y con una salida de emergencia.
 *
 * `fecha_ejecucion` es texto libre por decisión del esquema (RF-207), y hay
 * anotaciones legítimas que los botones no saben representar: «finales de los
 * setenta», «1978 [?]», «siglo XX». Cuando el valor guardado es una de esas, este
 * campo **muestra el texto y no lo toca**. Reescribirlo para que encajara en los
 * controles destruiría un matiz que alguien puso a conciencia, y eso es peor que
 * obligar a teclear.
 */
function CampoFecha({ texto, alCambiar }: { texto: string; alCambiar: (v: string) => void }) {
  const estructurada = descomponerFecha(texto)
  const [aMano, setAMano] = useState(false)
  const [rango, setRango] = useState(() => estructurada?.anioFin != null)

  if (estructurada === null || aMano) {
    return (
      <div>
        <label className="etiqueta" htmlFor="e-fecha">
          Fecha de ejecución
        </label>
        <input
          id="e-fecha"
          className="campo"
          value={texto}
          onChange={(e) => alCambiar(e.target.value)}
          placeholder="1978 · 1975-1978 · c. 1980"
        />
        {estructurada === null ? (
          <p className="mt-1 text-xs text-amber-800">
            Este texto no se puede representar con los botones, así que se edita a mano y se conserva
            tal cual.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                alCambiar('')
                setRango(false)
                setAMano(false)
              }}
            >
              Vaciar y usar los botones
            </button>
          </p>
        ) : (
          <button
            type="button"
            className="mt-1 text-xs underline text-stone-600"
            onClick={() => setAMano(false)}
          >
            Volver a los botones
          </button>
        )}
      </div>
    )
  }

  const f = estructurada
  function poner(cambio: Partial<FechaEstructurada>, conRango = rango) {
    const nueva = { ...f, ...cambio }
    alCambiar(componerFecha(conRango ? nueva : { ...nueva, anioFin: null }))
  }

  return (
    <div className="space-y-3">
      <PasoAnio
        id="e-anio"
        etiqueta={rango ? 'Año inicial' : 'Año de ejecución'}
        valor={f.anio}
        minimo={ANIO_MINIMO}
        maximo={anioMaximo()}
        alCambiar={(anio) => poner({ anio })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Interruptor
          etiqueta="Aproximada"
          ayuda="c. 1980 — de alrededor de ese año"
          activo={f.aproximada}
          alCambiar={(v) => poner({ aproximada: v })}
        />
        <Interruptor
          etiqueta="Rango"
          ayuda="1975-1978"
          activo={rango}
          alCambiar={(v) => {
            setRango(v)
            poner(v && f.anio != null && f.anioFin == null ? { anioFin: ajustarAnio(f.anio, 1) } : {}, v)
          }}
        />
      </div>

      {/* Ver la nota de CapturaPage sobre la diferencia entre las dos banderas. */}
      <Interruptor
        etiqueta="Sin confirmar"
        ayuda="[?] — se desconoce; el año es una estimación"
        activo={f.sinConfirmar}
        alCambiar={(v) => poner({ sinConfirmar: v })}
      />

      {rango && (
        <PasoAnio
          id="e-anio-fin"
          etiqueta="Año final"
          valor={f.anioFin}
          minimo={ANIO_MINIMO}
          maximo={anioMaximo()}
          alCambiar={(anioFin) => poner({ anioFin })}
        />
      )}

      <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2">
        <span id="vista-fecha" aria-live="polite" className="text-sm">
          {f.anio == null ? (
            <span className="text-stone-500">Sin fechar</span>
          ) : (
            <>
              Se guardará como <span className="font-medium">{texto}</span>
            </>
          )}
        </span>
        <button
          type="button"
          className="shrink-0 text-xs underline text-stone-600"
          onClick={() => setAMano(true)}
        >
          Escribir a mano
        </button>
      </div>
    </div>
  )
}
